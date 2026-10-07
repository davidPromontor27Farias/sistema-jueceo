import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/requireAuth";
import { sinIndefinidos } from "../lib/utils";
import { modoPruebaActivo } from "../lib/modoEvento";
import {
    emparejarAleatorio,
    emparejarConSiembra,
    emparejarPorPosicion,
    nombreRonda,
    potenciaDe2MasGrandeQueNoExceda,
    repartirEnLotes,
    totalRondasParaParticipantes,
    type EmparejamientoSlot,
} from "../lib/brackets";
import { CATEGORIAS_LABEL, type Categoria } from "../config/catalog";

const TODAS_LAS_CATEGORIAS = Object.keys(CATEGORIAS_LABEL) as Categoria[];
const CATEGORIAS_ENUM = TODAS_LAS_CATEGORIAS as [Categoria, ...Categoria[]];

// Tamaños de corte permitidos para el Top N automático de la fase de
// Preselección (Filtro/Cypher estilo Red Bull BC One), ver generar-top-bracket.
const CORTES_PRESELECCION = [4, 8, 16, 32, 64];

// REPECHAJE_DESEMPATE no es un destino válido de la PATCH genérica de abajo:
// lo controla el sistema solo, al detectar un empate en la frontera de corte
// (ver resolverCorteOLanzarRepechaje). PRESELECCION tampoco (ver
// POST .../preseleccion/iniciar), pero se deja en este enum para poder
// interceptarlo con un mensaje de error claro en vez de un 400 genérico de zod.
const ESTATUS_COMPETENCIA_PATCH = ["NO_INICIADA", "PRESELECCION", "EN_CURSO", "FINALIZADA"] as const;
const ESTATUS_ENFRENTAMIENTO = ["PENDIENTE", "EN_CURSO", "FINALIZADO"] as const;

const patchCategoriaSchema = z.object({ estatus: z.enum(ESTATUS_COMPETENCIA_PATCH) });

const crearEnfrentamientoSchema = z.object({
    categoria: z.enum(CATEGORIAS_ENUM),
    ronda: z.string().trim().min(1),
    orden: z.number().int().default(0),
    competidorAId: z.string().uuid().optional(),
    competidorBId: z.string().uuid().optional(),
});

const editarEnfrentamientoSchema = z.object({
    ronda: z.string().trim().min(1).optional(),
    orden: z.number().int().optional(),
    competidorAId: z.string().uuid().nullable().optional(),
    competidorBId: z.string().uuid().nullable().optional(),
    ganadorId: z.string().uuid().nullable().optional(),
    estatus: z.enum(ESTATUS_ENFRENTAMIENTO).optional(),
});

// Criterios del reglamento (Artículo 35), escala 1-5, para cada competidor.
const PUNTAJE = z.number().int().min(1).max(5);
const calificarSchema = z.object({
    tecnicaA: PUNTAJE,
    ejecucionA: PUNTAJE,
    vocabularioA: PUNTAJE,
    musicalidadA: PUNTAJE,
    originalidadA: PUNTAJE,
    tecnicaB: PUNTAJE,
    ejecucionB: PUNTAJE,
    vocabularioB: PUNTAJE,
    musicalidadB: PUNTAJE,
    originalidadB: PUNTAJE,
});

// Mismos criterios que `calificarSchema` pero para UN participante (fase de
// Preselección), sin comparar A vs B.
const puntuacionPreseleccionSchema = z.object({
    tecnica: PUNTAJE,
    ejecucion: PUNTAJE,
    vocabulario: PUNTAJE,
    musicalidad: PUNTAJE,
    originalidad: PUNTAJE,
});

const COMPETIDOR_SELECT = {
    select: { id: true, nombreArtistico: true, nombres: true, apellidos: true, competidorId: true, fotoUrl: true },
};

// Cuántos jueces activos hay asignados a un escenario dado — reemplaza, para
// todo lo relacionado con Preselección, el conteo global que sigue usando la
// fase 1v1 (ahí todos los jueces confluyen en el escenario principal, sin
// cambios). Ver Preselección Paralela Multiescenario.
async function juecesActivosEnEscenario(escenarioId: string): Promise<number> {
    return prisma.adminUser.count({ where: { rol: "JUEZ", activo: true, escenarioId } });
}

interface FilaRondaNueva {
    categoria: Categoria;
    ronda: string;
    rondaNumero: number;
    orden: number;
    competidorAId: string;
    competidorBId: string | null;
    estatus: "PENDIENTE" | "FINALIZADO";
    ganadorId: string | null;
    rondasBaile: number;
}

// Cuántas veces presenta cada quien antes de que los jueces califiquen: lo de
// siempre (1) salvo la Final, que son 2 vueltas completas (A1, B1, A2, B2) y
// hasta ahí entran los jueces — sigue siendo una sola calificación por juez,
// sobre el total de ambas vueltas (ver rondasBaile en schema.prisma y
// calcularLimites en frontend/src/app/pantalla/SecuenciaBatalla.tsx).
function rondasBailePorNombre(nombreDeRonda: string): number {
    return nombreDeRonda === "Final" ? 2 : 1;
}

// Arma las filas de una ronda a partir de la lista de participantes (ya
// emparejados por `emparejador`); cada slot sin competidorB es un bye (avanza
// sin pelear, ya FINALIZADO con ganador = él mismo). El orden de la lista de
// slots ES el orden de posición en el árbol (campo `orden`) — no se reordena,
// para que las rondas siguientes conecten con el partido real.
function filasParaRonda(
    categoria: Categoria,
    rondaNumero: number,
    nombreDeRonda: string,
    participantes: string[],
    emparejador: (participantes: string[]) => EmparejamientoSlot<string>[],
): FilaRondaNueva[] {
    const slots = emparejador(participantes);
    const rondasBaile = rondasBailePorNombre(nombreDeRonda);

    return slots.map((slot, orden) => ({
        categoria,
        ronda: nombreDeRonda,
        rondaNumero,
        orden,
        competidorAId: slot.competidorA,
        competidorBId: slot.competidorB,
        estatus: slot.competidorB ? "PENDIENTE" : "FINALIZADO",
        ganadorId: slot.competidorB ? null : slot.competidorA,
        rondasBaile,
    }));
}

// Si todos los enfrentamientos de (categoria, rondaNumero) ya tienen ganador,
// arma la siguiente ronda con los ganadores, o marca la categoría FINALIZADA
// si ya solo queda un campeón. No hace nada si la ronda sigue incompleta.
async function intentarAvanzarRonda(categoria: Categoria, rondaNumero: number): Promise<void> {
    // orderBy es clave: el emparejamiento de la siguiente ronda es por
    // posición (orden 0 vs 1, 2 vs 3, ...), no por sorteo, para que las
    // líneas conectoras del bracket en /pantalla conecten con el partido real.
    const enfrentamientos = await prisma.enfrentamiento.findMany({
        where: { categoria, rondaNumero },
        orderBy: { orden: "asc" },
    });
    if (enfrentamientos.length === 0) return;

    const incompleta = enfrentamientos.some((e) => e.estatus !== "FINALIZADO" || !e.ganadorId);
    if (incompleta) return;

    const ganadores = enfrentamientos.map((e) => e.ganadorId).filter((id): id is string => !!id);

    const estado = await prisma.estadoCategoria.findUnique({ where: { categoria } });
    const totalRondas = estado?.totalRondas ?? rondaNumero;

    if (ganadores.length <= 1) {
        await prisma.estadoCategoria.upsert({
            where: { categoria },
            create: { categoria, estatus: "FINALIZADA", totalRondas },
            update: { estatus: "FINALIZADA" },
        });
        return;
    }

    const siguienteNumero = rondaNumero + 1;
    const yaExiste = await prisma.enfrentamiento.count({ where: { categoria, rondaNumero: siguienteNumero } });
    if (yaExiste > 0) return;

    const filas = filasParaRonda(
        categoria,
        siguienteNumero,
        nombreRonda(siguienteNumero, totalRondas),
        ganadores,
        emparejarPorPosicion,
    );
    await prisma.enfrentamiento.createMany({ data: filas });
}

type ResultadoCalificacion =
    | { completo: false; faltan: number }
    | { completo: true; empatado: true; numeroDesempate: number }
    | { completo: true; empatado: false; ganadorId: string };

// Se llama después de guardar cada CalificacionJuez. Si ya calificaron todos
// los jueces activos (de ESTE intento, ver numeroDesempate), suma los 5
// criterios de cada uno por competidor; el que tenga más gana. Si empatan,
// se lanza automáticamente una ronda extra para los mismos dos competidores
// (estilo Red Bull BC One "sudden death", confirmado con el cliente): se
// incrementa numeroDesempate y se limpia el corte de turno previo, sin
// tocar el estatus (sigue EN_CURSO) — el bracket no avanza hasta que haya un
// ganador real, sin importar cuántas rondas de desempate hagan falta. No se
// usa Originalidad ni ningún otro criterio de desempate.
async function intentarResolverEnfrentamiento(enfrentamientoId: string): Promise<ResultadoCalificacion> {
    const enfrentamiento = await prisma.enfrentamiento.findUnique({ where: { id: enfrentamientoId } });
    if (!enfrentamiento || !enfrentamiento.competidorAId || !enfrentamiento.competidorBId) {
        throw new Error("Enfrentamiento inválido para resolver por calificaciones");
    }

    const juecesActivos = await prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } });
    const calificaciones = await prisma.calificacionJuez.findMany({
        where: { enfrentamientoId, numeroDesempate: enfrentamiento.numeroDesempate },
    });

    if (calificaciones.length < juecesActivos) {
        return { completo: false, faltan: juecesActivos - calificaciones.length };
    }

    let totalA = 0;
    let totalB = 0;
    for (const c of calificaciones) {
        totalA += c.tecnicaA + c.ejecucionA + c.vocabularioA + c.musicalidadA + c.originalidadA;
        totalB += c.tecnicaB + c.ejecucionB + c.vocabularioB + c.musicalidadB + c.originalidadB;
    }

    if (totalA === totalB) {
        const nuevoNumero = enfrentamiento.numeroDesempate + 1;
        await prisma.enfrentamiento.update({
            where: { id: enfrentamientoId },
            data: { numeroDesempate: nuevoNumero, turnoACortadoEn: null, turnoBCortadoEn: null },
        });
        return { completo: true, empatado: true, numeroDesempate: nuevoNumero };
    }

    const ganadorId = totalA > totalB ? enfrentamiento.competidorAId : enfrentamiento.competidorBId;
    await prisma.enfrentamiento.update({
        where: { id: enfrentamientoId },
        data: { ganadorId, estatus: "FINALIZADO" },
    });
    await intentarAvanzarRonda(enfrentamiento.categoria, enfrentamiento.rondaNumero);

    return { completo: true, empatado: false, ganadorId };
}

// intentarResolverEnfrentamiento solo se dispara cuando un juez califica —
// si un admin desactiva a un juez DESPUÉS de que los demás ya calificaron
// (ej. "éramos 3 activos, calificaron 2, se desactivó al tercero"), esa
// batalla se queda congelada en EN_CURSO para siempre: ya nadie va a volver
// a calificarla, así que nada vuelve a llamar a intentarResolverEnfrentamiento
// para ella. Esto barre todas las batallas EN_CURSO con ambos competidores
// asignados e intenta resolverlas de nuevo con el conteo de jueces activos
// actual — se llama cada vez que cambia el estatus `activo` de un JUEZ (ver
// PATCH /admins/:id).
export async function reintentarResolucionesPendientes(): Promise<void> {
    const pendientes = await prisma.enfrentamiento.findMany({
        where: { estatus: "EN_CURSO", competidorAId: { not: null }, competidorBId: { not: null } },
        select: { id: true },
    });
    for (const { id } of pendientes) {
        await intentarResolverEnfrentamiento(id);
    }
}

// Mismo problema que reintentarResolucionesPendientes, pero para el repechaje
// de frontera de corte de Preselección: si se (des)activa un JUEZ mientras
// una categoría está en REPECHAJE_DESEMPATE, nada vuelve a revisar si eso ya
// completó la ronda vigente de los empatados (intentarResolverRepechaje solo
// se dispara al calificar). Se llama junto con reintentarResolucionesPendientes
// cada vez que cambia el estatus `activo` de un JUEZ (ver PATCH /admins/:id).
export async function reintentarRepechajesPendientes(): Promise<void> {
    const categorias = await prisma.estadoCategoria.findMany({
        where: { estatus: "REPECHAJE_DESEMPATE" },
        select: { categoria: true },
    });
    for (const { categoria } of categorias) {
        await intentarResolverRepechaje(categoria);
    }
}

// Suma de un competidor por criterio (Art. 35 del reglamento), entre todos
// los jueces que ya calificaron. Se manda a /pantalla para el desglose que
// aparece bajo cada competidor cuando termina la calificación.
export interface DesglosePuntaje {
    tecnica: number;
    ejecucion: number;
    vocabulario: number;
    musicalidad: number;
    originalidad: number;
}

// Suma los 5 criterios de todos los jueces por competidor, para mostrar el
// puntaje y su desglose en /pantalla. Si el enfrentamiento no tiene
// calificaciones (bye, o resuelto por respaldo manual) devuelve null en vez
// de 0, para no dar a entender que el puntaje fue cero.
async function conPuntajes<T extends { id: string; numeroDesempate: number }>(
    enfrentamientos: T[],
): Promise<(T & { puntajeA: number | null; puntajeB: number | null; desgloseA: DesglosePuntaje | null; desgloseB: DesglosePuntaje | null })[]> {
    const ids = enfrentamientos.map((e) => e.id);
    if (ids.length === 0) return [];

    // Agrupado también por numeroDesempate: si hubo una ronda de desempate,
    // las calificaciones del intento anterior (ya empatado) siguen en la
    // tabla para historial, pero no deben sumarse junto con las de la ronda
    // vigente — cada enfrentamiento busca su suma con la llave
    // `${id}:${numeroDesempate}` más abajo.
    const sumas = await prisma.calificacionJuez.groupBy({
        by: ["enfrentamientoId", "numeroDesempate"],
        where: { enfrentamientoId: { in: ids } },
        _sum: {
            tecnicaA: true,
            ejecucionA: true,
            vocabularioA: true,
            musicalidadA: true,
            originalidadA: true,
            tecnicaB: true,
            ejecucionB: true,
            vocabularioB: true,
            musicalidadB: true,
            originalidadB: true,
        },
    });
    const mapaSumas = new Map(sumas.map((s) => [`${s.enfrentamientoId}:${s.numeroDesempate}`, s._sum]));

    return enfrentamientos.map((e) => {
        const s = mapaSumas.get(`${e.id}:${e.numeroDesempate}`);
        if (!s) return { ...e, puntajeA: null, puntajeB: null, desgloseA: null, desgloseB: null };
        const desgloseA: DesglosePuntaje = {
            tecnica: s.tecnicaA ?? 0,
            ejecucion: s.ejecucionA ?? 0,
            vocabulario: s.vocabularioA ?? 0,
            musicalidad: s.musicalidadA ?? 0,
            originalidad: s.originalidadA ?? 0,
        };
        const desgloseB: DesglosePuntaje = {
            tecnica: s.tecnicaB ?? 0,
            ejecucion: s.ejecucionB ?? 0,
            vocabulario: s.vocabularioB ?? 0,
            musicalidad: s.musicalidadB ?? 0,
            originalidad: s.originalidadB ?? 0,
        };
        const puntajeA = desgloseA.tecnica + desgloseA.ejecucion + desgloseA.vocabulario + desgloseA.musicalidad + desgloseA.originalidad;
        const puntajeB = desgloseB.tecnica + desgloseB.ejecucion + desgloseB.vocabulario + desgloseB.musicalidad + desgloseB.originalidad;
        return { ...e, puntajeA, puntajeB, desgloseA, desgloseB };
    });
}

export const competenciaRouter = Router();

// Público: la pantalla del evento lee esto sin autenticarse.
competenciaRouter.get("/categorias", async (_req, res) => {
    const estados = await prisma.estadoCategoria.findMany();
    const porCategoria = new Map(estados.map((e) => [e.categoria, e]));

    const categorias = TODAS_LAS_CATEGORIAS.map((categoria) => ({
        categoria,
        label: CATEGORIAS_LABEL[categoria],
        estatus: porCategoria.get(categoria)?.estatus ?? "NO_INICIADA",
    }));

    return res.json({ categorias });
});

competenciaRouter.patch(
    "/categorias/:categoria",
    requireRole("SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const categoria = req.params.categoria as Categoria;
        if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
            return res.status(404).json({ error: "Categoría desconocida" });
        }

        const parsed = patchCategoriaSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ errors: parsed.error.flatten() });
        }

        // Entrar a PRESELECCION requiere repartir a los competidores entre
        // escenarios — eso solo lo hace POST .../preseleccion/iniciar, no
        // esta PATCH genérica (que no sabría con qué escenarios armar la cola).
        if (parsed.data.estatus === "PRESELECCION") {
            return res.status(400).json({
                error: "Usa POST /categorias/:categoria/preseleccion/iniciar para arrancar la preselección.",
            });
        }

        // No dejar que un cambio de estatus a mano regrese a NO_INICIADA si ya
        // existen enfrentamientos: el panel de admin decide qué mostrar
        // (ranking de preselección vs. lista de enfrentamientos) según este
        // campo, así que "retroceder" con un bracket ya armado le esconde al
        // admin el panel de enfrentamientos por completo — incluso con
        // batallas ya EN_CURSO. Para regenerar un bracket hay que borrar los
        // enfrentamientos primero (mismo requisito que ya exigen
        // generar-bracket / generar-top-bracket).
        if (parsed.data.estatus === "NO_INICIADA") {
            const existentes = await prisma.enfrentamiento.count({ where: { categoria } });
            if (existentes > 0) {
                return res.status(409).json({
                    error: "Ya existen enfrentamientos para esta categoría. Bórralos antes de regresarla a este estatus.",
                });
            }
        }

        // Cualquier destino desde esta PATCH deja de ser PRESELECCION o
        // REPECHAJE_DESEMPATE (ninguno de los dos es un destino válido acá),
        // así que se limpia toda la cola por escenario y se cancelan los
        // avances automáticos pendientes de esta categoría, para no dejar un
        // competidor "fantasma" marcado en ningún escenario.
        cancelarTodosLosAvancesAutomaticos(categoria);
        await prisma.turnoPreseleccionEscenario.deleteMany({ where: { categoria } });

        const estado = await prisma.estadoCategoria.upsert({
            where: { categoria },
            create: { categoria, estatus: parsed.data.estatus },
            update: { estatus: parsed.data.estatus },
        });

        return res.json({ estado });
    },
);

// Arranca la fase de Preselección de una categoría: reparte a los
// competidores pagados en lotes proporcionales por orden de registro entre
// los escenarios que tengan al menos un juez activo asignado, y crea la cola
// de turno de cada uno (ver Preselección Paralela Multiescenario). Bloqueado
// si ya hay enfrentamientos, si la categoría no está en NO_INICIADA, o si ya
// hay alguna calificación de preselección registrada (evita reordenar a
// alguien a medio calificar).
competenciaRouter.post(
    "/categorias/:categoria/preseleccion/iniciar",
    requireRole("SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const categoria = req.params.categoria as Categoria;
        if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
            return res.status(404).json({ error: "Categoría desconocida" });
        }
        if (categoria === "PUBLICO_GENERAL") {
            return res.status(400).json({ error: "Público general no compite, no aplica preselección" });
        }

        const estadoActual = await prisma.estadoCategoria.findUnique({ where: { categoria } });
        if (estadoActual && estadoActual.estatus !== "NO_INICIADA") {
            return res.status(409).json({
                error: "Esta categoría ya no está en 'No iniciada'. Regrésala a ese estatus antes de reiniciar la preselección.",
            });
        }
        const existentes = await prisma.enfrentamiento.count({ where: { categoria } });
        if (existentes > 0) {
            return res.status(409).json({ error: "Ya existen enfrentamientos para esta categoría." });
        }
        const yaCalificado = await prisma.puntuacionPreseleccion.count({ where: { registration: { categoria } } });
        if (yaCalificado > 0) {
            return res.status(409).json({
                error: "Ya hay calificaciones de preselección registradas para esta categoría; no se puede rehacer el reparto.",
            });
        }

        const escenariosActivos = await prisma.escenario.findMany({
            where: { activo: true, jueces: { some: { rol: "JUEZ", activo: true } } },
            orderBy: { orden: "asc" },
        });
        if (escenariosActivos.length === 0) {
            return res.status(400).json({ error: "No hay escenarios activos con al menos un juez activo asignado." });
        }

        const juecesSinEscenario = await prisma.adminUser.count({ where: { rol: "JUEZ", activo: true, escenarioId: null } });
        if (juecesSinEscenario > 0) {
            return res.status(400).json({
                error: `Hay ${juecesSinEscenario} juez(es) activo(s) sin escenario asignado. Asígnales un escenario antes de iniciar la preselección.`,
            });
        }

        const competidores = await prisma.registration.findMany({
            where: { categoria, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
            select: { id: true },
            orderBy: { createdAt: "asc" },
        });
        if (competidores.length === 0) {
            return res.status(400).json({ error: "No hay competidores con pago confirmado en esta categoría" });
        }

        const lotes = repartirEnLotes(
            competidores.map((c) => c.id),
            escenariosActivos.length,
        );

        await prisma.$transaction([
            ...escenariosActivos
                .map((esc, i) => ({ esc, idsLote: lotes[i] ?? [] }))
                .filter(({ idsLote }) => idsLote.length > 0)
                .map(({ esc, idsLote }) =>
                    prisma.registration.updateMany({
                        where: { id: { in: idsLote } },
                        data: { preseleccionEscenarioId: esc.id, preseleccionNumeroDesempate: 0 },
                    }),
                ),
            ...escenariosActivos.map((esc) =>
                prisma.turnoPreseleccionEscenario.upsert({
                    where: { categoria_escenarioId: { categoria, escenarioId: esc.id } },
                    create: { categoria, escenarioId: esc.id },
                    update: { turnoActualId: null, turnoIniciadoEn: null, turnoCompletadoEn: null },
                }),
            ),
            prisma.estadoCategoria.upsert({
                where: { categoria },
                create: { categoria, estatus: "PRESELECCION" },
                update: { estatus: "PRESELECCION" },
            }),
        ]);

        const reparto = escenariosActivos.map((esc, i) => ({
            escenarioId: esc.id,
            escenarioNombre: esc.nombre,
            cantidad: (lotes[i] ?? []).length,
        }));

        return res.status(201).json({ estatus: "PRESELECCION", reparto });
    },
);

// Público: qué escenarios están participando en la Preselección/Repechaje de
// esta categoría ahora mismo — uno por cada TurnoPreseleccionEscenario creado
// al iniciar (ver arriba). El panel de admin lo usa para saber cuántos
// sub-paneles de turno mostrar.
competenciaRouter.get("/categorias/:categoria/preseleccion/escenarios", async (req, res) => {
    const categoria = req.params.categoria as Categoria;
    if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
        return res.status(404).json({ error: "Categoría desconocida" });
    }

    const turnos = await prisma.turnoPreseleccionEscenario.findMany({
        where: { categoria },
        include: { escenario: { select: { id: true, nombre: true, orden: true } } },
        orderBy: { escenario: { orden: "asc" } },
    });

    return res.json({ escenarios: turnos.map((t) => t.escenario) });
});

// Solo staff: roster de competidores con pago confirmado de una categoría,
// para elegir a quién enfrentar al capturar un Enfrentamiento.
competenciaRouter.get("/competidores", requireRole("SUPER_ADMIN", "STAFF_JUECEO"), async (req, res) => {
    const rawCategoria = req.query.categoria;
    if (typeof rawCategoria !== "string" || !TODAS_LAS_CATEGORIAS.includes(rawCategoria as Categoria)) {
        return res.status(400).json({ error: "Falta o es inválida la categoría" });
    }

    const competidores = await prisma.registration.findMany({
        where: { categoria: rawCategoria as Categoria, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
        select: { id: true, nombreArtistico: true, nombres: true, apellidos: true, competidorId: true },
        orderBy: { nombreArtistico: "asc" },
    });

    return res.json({ competidores });
});

// Solo staff/jueces: competidores pagados de la categoría con su avance de
// calificación de Preselección (cuántos jueces ya lo puntuaron, puntaje total
// acumulado, y si el juez que pregunta ya lo calificó). Se usa tanto para el
// ranking del panel de admin como para la lista de pendientes del juez.
competenciaRouter.get(
    "/preseleccion/participantes",
    requireRole("JUEZ", "SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const rawCategoria = req.query.categoria;
        if (typeof rawCategoria !== "string" || !TODAS_LAS_CATEGORIAS.includes(rawCategoria as Categoria)) {
            return res.status(400).json({ error: "Falta o es inválida la categoría" });
        }
        const categoria = rawCategoria as Categoria;
        const escenarioId = req.query.escenarioId;
        if (typeof escenarioId !== "string") {
            return res.status(400).json({ error: "Falta escenarioId" });
        }

        const participantes = await prisma.registration.findMany({
            where: { categoria, preseleccionEscenarioId: escenarioId, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
            select: {
                id: true,
                nombreArtistico: true,
                nombres: true,
                apellidos: true,
                competidorId: true,
                fotoUrl: true,
                preseleccionNumeroDesempate: true,
            },
            orderBy: { createdAt: "asc" },
        });
        const ids = participantes.map((p) => p.id);

        const [conteos, juecesActivos, misPuntuaciones] = await Promise.all([
            prisma.puntuacionPreseleccion.groupBy({
                by: ["registrationId", "numeroDesempate"],
                where: { registrationId: { in: ids } },
                _count: { id: true },
                _sum: { tecnica: true, ejecucion: true, vocabulario: true, musicalidad: true, originalidad: true },
            }),
            juecesActivosEnEscenario(escenarioId),
            req.admin!.rol === "JUEZ"
                ? prisma.puntuacionPreseleccion.findMany({
                      where: { juezId: req.admin!.id, registrationId: { in: ids } },
                      select: { registrationId: true, numeroDesempate: true },
                  })
                : Promise.resolve([]),
        ]);

        // Todo escopado a la ronda VIGENTE de cada participante
        // (preseleccionNumeroDesempate): si hubo repechaje, las calificaciones
        // de la ronda anterior (ya resuelta) siguen en la tabla para
        // historial, pero no cuentan para "ya califiqué"/puntaje actual.
        const conteoPorLlave = new Map(conteos.map((c) => [`${c.registrationId}:${c.numeroDesempate}`, c]));
        const numeroDesempatePorId = new Map(participantes.map((p) => [p.id, p.preseleccionNumeroDesempate]));
        const yaCalifique = new Set(
            misPuntuaciones
                .filter((c) => c.numeroDesempate === numeroDesempatePorId.get(c.registrationId))
                .map((c) => c.registrationId),
        );

        const resultado = participantes.map((p) => {
            const c = conteoPorLlave.get(`${p.id}:${p.preseleccionNumeroDesempate}`);
            const s = c?._sum;
            const puntajeTotal = s
                ? (s.tecnica ?? 0) + (s.ejecucion ?? 0) + (s.vocabulario ?? 0) + (s.musicalidad ?? 0) + (s.originalidad ?? 0)
                : null;
            return {
                id: p.id,
                nombreArtistico: p.nombreArtistico,
                nombres: p.nombres,
                apellidos: p.apellidos,
                competidorId: p.competidorId,
                fotoUrl: p.fotoUrl,
                calificacionesRecibidas: c?._count.id ?? 0,
                puntajeTotal,
                yaCalifique: yaCalifique.has(p.id),
            };
        });

        return res.json({ participantes: resultado, juecesActivos });
    },
);

// Solo jueces: puntuar individualmente a un participante durante la fase de
// Preselección. No compara A vs B — cada juez puntúa a cada participante una
// sola vez (@@unique en PuntuacionPreseleccion).
competenciaRouter.post("/preseleccion/:registrationId/calificar", requireRole("JUEZ"), async (req, res) => {
    const { registrationId } = req.params;
    if (typeof registrationId !== "string") {
        return res.status(400).json({ error: "Falta registrationId" });
    }

    const registro = await prisma.registration.findUnique({ where: { id: registrationId } });
    if (!registro) {
        return res.status(404).json({ error: "Competidor no encontrado" });
    }
    if (registro.estatusPago !== "PAGADO") {
        return res.status(400).json({ error: "Este competidor no tiene pago confirmado" });
    }
    // findUnique solo admite el id, así que el filtro por modo se hace acá:
    // si el registro no corresponde al modo activo (prueba vs real), se
    // trata igual que "no encontrado" — no se puede calificar a alguien del
    // otro modo.
    if (registro.esPrueba !== (await modoPruebaActivo())) {
        return res.status(400).json({ error: "Este competidor no tiene pago confirmado" });
    }
    // Un juez solo puede calificar a competidores de SU propio escenario
    // (ver AdminUser.escenarioId) — refuerza a nivel API lo que el frontend
    // ya filtra al no mostrarle competidores de otros escenarios.
    if (!registro.preseleccionEscenarioId || registro.preseleccionEscenarioId !== req.admin!.escenarioId) {
        return res.status(403).json({ error: "Este competidor no pertenece a tu escenario" });
    }

    const estado = await prisma.estadoCategoria.findUnique({ where: { categoria: registro.categoria } });
    if (estado?.estatus !== "PRESELECCION" && estado?.estatus !== "REPECHAJE_DESEMPATE") {
        return res.status(400).json({ error: "Esta categoría no está en fase de preselección" });
    }

    const parsed = puntuacionPreseleccionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    // La calificación se guarda bajo la ronda VIGENTE del competidor: 0 en
    // preselección normal, o la ronda de repechaje en curso si quedó
    // empatado en la frontera de corte (ver preseleccionNumeroDesempate).
    const numeroDesempate = registro.preseleccionNumeroDesempate;
    try {
        await prisma.puntuacionPreseleccion.create({
            data: { registrationId, juezId: req.admin!.id, numeroDesempate, ...parsed.data },
        });
    } catch (error: any) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Ya calificaste a este participante" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo guardar la calificación" });
    }

    const escenarioId = registro.preseleccionEscenarioId;

    // Si esta calificación fue la última que faltaba (todos los jueces
    // activos DE ESTE ESCENARIO ya puntuaron) Y es justo quien está en
    // tarima ahora mismo, agenda el avance automático al siguiente:
    // /pantalla?escenario= se queda DURACION_RESULTADOS_PRESELECCION_MS
    // mostrando nombre+puntaje+desglose antes de pasar solo (ver
    // avanzarTurnoPreseleccion). El `esperado` evita saltarse a alguien si
    // el staff ya avanzó a mano mientras tanto.
    //
    // turnoCompletadoEn se guarda en la base (no solo en el setTimeout en
    // memoria) para que turnoActualDeEscenario pueda autocurarse si el
    // proceso se reinicia en esa ventana de espera (ej. hot-reload de
    // ts-node-dev en desarrollo) y el timer se pierde — sin esto la cola de
    // ese escenario se queda pegada en un turno ya calificado para siempre.
    const turnoEscenario = await prisma.turnoPreseleccionEscenario.findUnique({
        where: { categoria_escenarioId: { categoria: registro.categoria, escenarioId } },
    });
    if (turnoEscenario?.turnoActualId === registrationId) {
        const [juecesActivos, { calificacionesRecibidas }] = await Promise.all([
            juecesActivosEnEscenario(escenarioId),
            puntajePreseleccion(registrationId, numeroDesempate),
        ]);
        if (juecesActivos > 0 && calificacionesRecibidas >= juecesActivos) {
            await prisma.turnoPreseleccionEscenario.update({
                where: { categoria_escenarioId: { categoria: registro.categoria, escenarioId } },
                data: { turnoCompletadoEn: new Date() },
            });
            cancelarAvanceAutomatico(registro.categoria, escenarioId);
            const timer = setTimeout(() => {
                avanzarTurnoPreseleccion(registro.categoria, escenarioId, registrationId).catch((error) => console.error(error));
            }, DURACION_RESULTADOS_PRESELECCION_MS);
            timersAvanceAutomatico.set(claveTimer(registro.categoria, escenarioId), timer);
        }
    }

    // Si la categoría está resolviendo un empate en la frontera de corte,
    // revisa si con esta calificación ya se completó la ronda vigente de
    // TODOS los empatados — de ser así, recorta de nuevo (puede resolverse,
    // o lanzar otra ronda extra si vuelve a empatar). Ver
    // resolverCorteOLanzarRepechaje / intentarResolverRepechaje.
    if (estado.estatus === "REPECHAJE_DESEMPATE") {
        await intentarResolverRepechaje(registro.categoria);
    }

    return res.status(201).json({ ok: true });
});

// Cuánto se calificó a un participante de Preselección en UNA ronda puntual
// (0 = preselección normal, N = ronda de repechaje N): suma por criterio
// entre todos los jueces (mismo desglose que ya usa /pantalla para las
// batallas 1v1, ver DesglosePuntaje) + total, o null si nadie lo ha
// calificado todavía en esa ronda.
async function puntajePreseleccion(
    registrationId: string,
    numeroDesempate: number,
): Promise<{ calificacionesRecibidas: number; puntajeTotal: number | null; desglose: DesglosePuntaje | null }> {
    const agg = await prisma.puntuacionPreseleccion.aggregate({
        where: { registrationId, numeroDesempate },
        _count: { id: true },
        _sum: { tecnica: true, ejecucion: true, vocabulario: true, musicalidad: true, originalidad: true },
    });
    if (agg._count.id === 0) {
        return { calificacionesRecibidas: 0, puntajeTotal: null, desglose: null };
    }
    const desglose: DesglosePuntaje = {
        tecnica: agg._sum.tecnica ?? 0,
        ejecucion: agg._sum.ejecucion ?? 0,
        vocabulario: agg._sum.vocabulario ?? 0,
        musicalidad: agg._sum.musicalidad ?? 0,
        originalidad: agg._sum.originalidad ?? 0,
    };
    const puntajeTotal =
        desglose.tecnica + desglose.ejecucion + desglose.vocabulario + desglose.musicalidad + desglose.originalidad;
    return { calificacionesRecibidas: agg._count.id, puntajeTotal, desglose };
}

// Anotado a mano (en vez de inferido) porque turnoActualDeEscenario y
// avanzarTurnoPreseleccion se llaman mutuamente (autocuración, ver abajo) —
// sin el tipo explícito, TS no puede inferir el tipo de retorno de ninguna
// de las dos.
interface TurnoPreseleccionActual {
    participante: {
        id: string;
        nombreArtistico: string;
        nombres: string;
        apellidos: string;
        competidorId: string | null;
        fotoUrl: string | null;
    };
    categoria: Categoria;
    escenarioId: string;
    iniciadoEn: Date;
    calificacionesRecibidas: number;
    juecesActivos: number;
    completo: boolean;
    puntajeTotal: number | null;
    desglose: DesglosePuntaje | null;
}

const TURNO_ACTUAL_SELECT = { ...COMPETIDOR_SELECT.select, preseleccionNumeroDesempate: true };

// Quién está en tarima ahora mismo en la fase de Preselección de UN
// escenario, con su avance de calificación — para /pantalla?escenario=
// (overlay con cronómetro + resultado, ver
// frontend/src/app/pantalla/SecuenciaPreseleccion.tsx) y admin/jueceo (a
// quién debe calificar un juez de ese escenario). Lo usan el GET público y
// las rutas de abajo.
async function turnoActualDeEscenario(categoria: Categoria, escenarioId: string): Promise<TurnoPreseleccionActual | null> {
    let turno = await prisma.turnoPreseleccionEscenario.findUnique({
        where: { categoria_escenarioId: { categoria, escenarioId } },
        include: { turnoActual: { select: TURNO_ACTUAL_SELECT } },
    });
    if (!turno?.turnoActual || !turno.turnoIniciadoEn) {
        return null;
    }

    // Autocuración: si este turno ya se completó hace rato pero nadie
    // avanzó a tiempo (el setTimeout en memoria se perdió, ej. el proceso se
    // reinició en esa ventana), cualquier consulta de turno-actual lo
    // detecta acá y avanza sola — /pantalla, admin/jueceo y el panel de
    // competencia hacen poll cada 3-4s, así que se autocorrige solo en unos
    // segundos sin que el staff tenga que intervenir a mano.
    if (
        turno.turnoCompletadoEn &&
        Date.now() - turno.turnoCompletadoEn.getTime() >= DURACION_RESULTADOS_PRESELECCION_MS
    ) {
        const avance = await avanzarTurnoPreseleccion(categoria, escenarioId, turno.turnoActualId ?? undefined);
        if (!("error" in avance)) {
            return avance.turno;
        }
        // Alguien más ya avanzó mientras tanto (ej. otro poll ganó la
        // carrera, o el staff avanzó a mano) — se relee el estado actual.
        turno = await prisma.turnoPreseleccionEscenario.findUnique({
            where: { categoria_escenarioId: { categoria, escenarioId } },
            include: { turnoActual: { select: TURNO_ACTUAL_SELECT } },
        });
        if (!turno?.turnoActual || !turno.turnoIniciadoEn) {
            return null;
        }
    }

    const { preseleccionNumeroDesempate, ...participante } = turno.turnoActual;
    const [juecesActivos, { calificacionesRecibidas, puntajeTotal, desglose }] = await Promise.all([
        juecesActivosEnEscenario(escenarioId),
        puntajePreseleccion(participante.id, preseleccionNumeroDesempate),
    ]);

    return {
        participante,
        categoria,
        escenarioId,
        iniciadoEn: turno.turnoIniciadoEn,
        calificacionesRecibidas,
        juecesActivos,
        completo: juecesActivos > 0 && calificacionesRecibidas >= juecesActivos,
        puntajeTotal,
        desglose,
    };
}

// Público: la pantalla del evento lee esto sin autenticarse, igual que
// /enfrentamientos y /categorias.
competenciaRouter.get("/categorias/:categoria/preseleccion/turno-actual", async (req, res) => {
    const categoria = req.params.categoria as Categoria;
    if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
        return res.status(404).json({ error: "Categoría desconocida" });
    }
    const escenarioId = req.query.escenarioId;
    if (typeof escenarioId !== "string") {
        return res.status(400).json({ error: "Falta escenarioId" });
    }

    const turno = await turnoActualDeEscenario(categoria, escenarioId);
    return res.json({ turno });
});

const MAXIMO_PROXIMOS_PRESELECCION = 5;

// Público: los siguientes en la fila de Preselección (mismo orden alfabético
// que usa avanzarTurnoPreseleccion), sin el que está en tarima ahora mismo y
// sin quienes ya terminaron de calificarse. Solo nombres, sin puntajes — lo
// consume el tablero secundario (frontend/src/app/pantalla/tablero/page.tsx)
// para mostrar "próximas presentaciones" igual que ya hace con las próximas
// batallas 1v1.
competenciaRouter.get("/categorias/:categoria/preseleccion/proximos", async (req, res) => {
    const categoria = req.params.categoria as Categoria;
    if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
        return res.status(404).json({ error: "Categoría desconocida" });
    }
    const escenarioId = req.query.escenarioId;
    if (typeof escenarioId !== "string") {
        return res.status(400).json({ error: "Falta escenarioId" });
    }

    const turnoEscenario = await prisma.turnoPreseleccionEscenario.findUnique({
        where: { categoria_escenarioId: { categoria, escenarioId } },
        select: { turnoActualId: true },
    });
    const participantes = await prisma.registration.findMany({
        where: { categoria, preseleccionEscenarioId: escenarioId, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
        select: {
            id: true,
            nombreArtistico: true,
            nombres: true,
            apellidos: true,
            competidorId: true,
            fotoUrl: true,
            preseleccionNumeroDesempate: true,
        },
        orderBy: { createdAt: "asc" },
    });
    const juecesActivos = await juecesActivosEnEscenario(escenarioId);
    const conteos = await prisma.puntuacionPreseleccion.groupBy({
        by: ["registrationId", "numeroDesempate"],
        where: { registrationId: { in: participantes.map((p) => p.id) } },
        _count: { id: true },
    });
    const conteoPorLlave = new Map(conteos.map((c) => [`${c.registrationId}:${c.numeroDesempate}`, c._count.id]));

    const proximos = participantes
        .filter(
            (p) =>
                p.id !== turnoEscenario?.turnoActualId &&
                (conteoPorLlave.get(`${p.id}:${p.preseleccionNumeroDesempate}`) ?? 0) < juecesActivos,
        )
        .slice(0, MAXIMO_PROXIMOS_PRESELECCION)
        .map(({ preseleccionNumeroDesempate, ...resto }) => resto);

    return res.json({ proximos });
});

// Público: ranking completo (todos los pagados, aunque no hayan sido
// calificados todavía) de la fase de Preselección. Lo consume /pantalla para
// el recorrido de resultados uno por uno, mejor puntaje primero, una vez que
// se acabó la fila de turnos (ver useRecapPreseleccion en
// frontend/src/app/pantalla/SecuenciaPreseleccion.tsx). Mismo cálculo de
// puntaje que generar-top-bracket, pero sin cortar ni exigir que esté
// completo — acá "completo" es solo un dato más por fila.
competenciaRouter.get("/categorias/:categoria/preseleccion/resultados", async (req, res) => {
    const categoria = req.params.categoria as Categoria;
    if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
        return res.status(404).json({ error: "Categoría desconocida" });
    }

    const participantes = await prisma.registration.findMany({
        where: { categoria, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
        select: {
            id: true,
            nombreArtistico: true,
            nombres: true,
            apellidos: true,
            competidorId: true,
            fotoUrl: true,
            preseleccionNumeroDesempate: true,
            preseleccionEscenario: { select: { id: true, nombre: true } },
        },
    });
    const ids = participantes.map((p) => p.id);
    const sumas = await prisma.puntuacionPreseleccion.groupBy({
        by: ["registrationId", "numeroDesempate"],
        where: { registrationId: { in: ids } },
        _count: { id: true },
        _sum: { tecnica: true, ejecucion: true, vocabulario: true, musicalidad: true, originalidad: true },
    });
    const sumaPorLlave = new Map(sumas.map((s) => [`${s.registrationId}:${s.numeroDesempate}`, s]));

    // "jueces activos" ya no es un solo número global: cada competidor
    // depende de cuántos jueces tiene activos SU escenario. Se cachea por
    // escenario para no repetir el conteo por cada fila.
    const juecesActivosPorEscenario = new Map<string, number>();
    for (const p of participantes) {
        const escenarioId = p.preseleccionEscenario?.id;
        if (escenarioId && !juecesActivosPorEscenario.has(escenarioId)) {
            juecesActivosPorEscenario.set(escenarioId, await juecesActivosEnEscenario(escenarioId));
        }
    }

    const resultados = participantes
        .map((p) => {
            const s = sumaPorLlave.get(`${p.id}:${p.preseleccionNumeroDesempate}`);
            const calificacionesRecibidas = s?._count.id ?? 0;
            const juecesActivos = p.preseleccionEscenario ? juecesActivosPorEscenario.get(p.preseleccionEscenario.id) ?? 0 : 0;
            const puntajeTotal = s
                ? (s._sum.tecnica ?? 0) +
                  (s._sum.ejecucion ?? 0) +
                  (s._sum.vocabulario ?? 0) +
                  (s._sum.musicalidad ?? 0) +
                  (s._sum.originalidad ?? 0)
                : null;
            return {
                id: p.id,
                nombreArtistico: p.nombreArtistico,
                nombres: p.nombres,
                apellidos: p.apellidos,
                competidorId: p.competidorId,
                fotoUrl: p.fotoUrl,
                escenarioId: p.preseleccionEscenario?.id ?? null,
                escenarioNombre: p.preseleccionEscenario?.nombre ?? null,
                numeroDesempate: p.preseleccionNumeroDesempate,
                calificacionesRecibidas,
                juecesActivos,
                puntajeTotal,
                completo: juecesActivos > 0 && calificacionesRecibidas >= juecesActivos,
            };
        })
        .sort((a, b) => (b.puntajeTotal ?? -1) - (a.puntajeTotal ?? -1));

    return res.json({ resultados });
});

// Cuánto se queda /pantalla mostrando nombre+categoría+puntaje+desglose de un
// participante antes de pasar solo al siguiente (ver avanzarTurnoPreseleccion
// y el timer que agenda POST /preseleccion/:registrationId/calificar).
const DURACION_RESULTADOS_PRESELECCION_MS = 7_000;

// Un timer pendiente de avance automático por categoría+escenario (se agenda
// cuando terminan de calificar al turno actual de ESE escenario; el staff
// puede adelantarse con el botón manual, por eso hay que poder cancelarlo).
// Vive en memoria del proceso: si el servidor se reinicia a mitad de una
// espera, ese avance en particular se pierde, pero el staff siempre puede
// apretar "Siguiente" a mano — no es una falla catastrófica, solo hay que
// saberlo.
const timersAvanceAutomatico = new Map<string, ReturnType<typeof setTimeout>>();

function claveTimer(categoria: Categoria, escenarioId: string): string {
    return `${categoria}:${escenarioId}`;
}

function cancelarAvanceAutomatico(categoria: Categoria, escenarioId: string) {
    const key = claveTimer(categoria, escenarioId);
    const timer = timersAvanceAutomatico.get(key);
    if (timer) {
        clearTimeout(timer);
        timersAvanceAutomatico.delete(key);
    }
}

// Cancela todos los timers pendientes de TODOS los escenarios de una
// categoría — se usa cuando la categoría sale de PRESELECCION/REPECHAJE_DESEMPATE
// por completo (PATCH manual de estatus, o al resolverse el Top Bracket).
function cancelarTodosLosAvancesAutomaticos(categoria: Categoria) {
    const prefijo = `${categoria}:`;
    for (const key of [...timersAvanceAutomatico.keys()]) {
        if (key.startsWith(prefijo)) {
            clearTimeout(timersAvanceAutomatico.get(key)!);
            timersAvanceAutomatico.delete(key);
        }
    }
}

// Núcleo compartido por el botón manual "Siguiente" (ver la ruta de abajo) y
// por el avance automático que se agenda al terminar de calificar (ver
// /preseleccion/:registrationId/calificar): avanza el turnoActualId de UN
// escenario al siguiente de su cola fija (orden de registro, createdAt —
// mismo orden que usa POST .../preseleccion/iniciar para repartir los
// lotes). Si el turno actual ya no está en la lista de pagados de ese
// escenario (ej. se le canceló el pago), se trata como si no hubiera turno y
// arranca desde el principio de la fila.
//
// El filtro "calificación completa en la ronda VIGENTE de cada quien"
// (preseleccionNumeroDesempate) sirve para preselección normal Y para
// repechaje sin ninguna rama especial: en preselección normal todos están en
// ronda 0, así que solo entran como candidatos los que aún no terminan; en
// repechaje, los no-empatados ya están completos en su ronda 0 (nunca vuelven
// a aparecer) y solo los empatados —recién subidos a una ronda nueva sin
// calificaciones todavía— entran como candidatos.
//
// `esperado`, si se pasa, es una guarda contra condición de carrera: si el
// turno actual ya cambió a otra persona (ej. el staff avanzó a mano mientras
// corría el timer automático), no hace nada — evita saltarse a alguien.
async function avanzarTurnoPreseleccion(
    categoria: Categoria,
    escenarioId: string,
    esperado?: string,
): Promise<{ turno: TurnoPreseleccionActual | null; terminado: boolean } | { error: string }> {
    const estadoCategoria = await prisma.estadoCategoria.findUnique({ where: { categoria } });
    if (estadoCategoria?.estatus !== "PRESELECCION" && estadoCategoria?.estatus !== "REPECHAJE_DESEMPATE") {
        return { error: "Esta categoría no está en fase de preselección" };
    }

    const turnoEscenario = await prisma.turnoPreseleccionEscenario.findUnique({
        where: { categoria_escenarioId: { categoria, escenarioId } },
    });
    if (!turnoEscenario) {
        return { error: "Este escenario no participa en la preselección de esta categoría" };
    }
    if (esperado !== undefined && turnoEscenario.turnoActualId !== esperado) {
        return { error: "IGNORADO_YA_AVANZO" };
    }

    const participantes = await prisma.registration.findMany({
        where: { categoria, preseleccionEscenarioId: escenarioId, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
        select: { id: true, preseleccionNumeroDesempate: true },
        orderBy: { createdAt: "asc" },
    });
    if (participantes.length === 0) {
        return { error: "No hay competidores asignados a este escenario" };
    }

    const juecesActivos = await juecesActivosEnEscenario(escenarioId);
    const puntuaciones = await prisma.puntuacionPreseleccion.groupBy({
        by: ["registrationId", "numeroDesempate"],
        where: { registrationId: { in: participantes.map((p) => p.id) } },
        _count: { id: true },
    });
    const conteoPorLlave = new Map(puntuaciones.map((p) => [`${p.registrationId}:${p.numeroDesempate}`, p._count.id]));
    const calificacionesVigentes = (id: string, numeroDesempate: number) => conteoPorLlave.get(`${id}:${numeroDesempate}`) ?? 0;

    // "Siguiente" nunca debe abandonar a quien está en tarima si todavía no
    // lo calificaron todos los jueces activos de este escenario — ni el
    // botón manual ni el avance automático (que solo llega hasta acá cuando
    // `esperado` sí coincide, y por diseño el turno esperado ya debería
    // estar completo en ese caso). Sin esta guarda, un click manual que
    // llega justo después de que el avance automático ya corrió por su
    // cuenta puede saltarse a la siguiente persona sin darle oportunidad de
    // ser calificada.
    if (turnoEscenario.turnoActualId) {
        const actual = participantes.find((p) => p.id === turnoEscenario.turnoActualId);
        if (actual && calificacionesVigentes(actual.id, actual.preseleccionNumeroDesempate) < juecesActivos) {
            return { error: "Todavía falta que algún juez califique al competidor que está en tarima." };
        }
    }

    const idxActual = turnoEscenario.turnoActualId
        ? participantes.findIndex((p) => p.id === turnoEscenario.turnoActualId)
        : -1;

    // Busca el siguiente SIN calificación completa (en su ronda vigente) a
    // partir de la posición actual — no solo "el que sigue en la lista" —
    // para que "Siguiente" nunca reaparezca a alguien que ya calificaron
    // todos los jueces. Esto también evita que, una vez que la fila ya se
    // acabó (turnoActualId en null, idxActual = -1), un click de más en
    // "Siguiente" reinicie la fila desde el principio: si ya no queda nadie
    // sin calificar, simplemente no encuentra a nadie y se queda terminado.
    const siguiente = participantes
        .slice(idxActual + 1)
        .find((p) => calificacionesVigentes(p.id, p.preseleccionNumeroDesempate) < juecesActivos);

    if (!siguiente) {
        await prisma.turnoPreseleccionEscenario.update({
            where: { categoria_escenarioId: { categoria, escenarioId } },
            data: { turnoActualId: null, turnoIniciadoEn: null, turnoCompletadoEn: null },
        });
        return { turno: null, terminado: true };
    }

    await prisma.turnoPreseleccionEscenario.update({
        where: { categoria_escenarioId: { categoria, escenarioId } },
        data: { turnoActualId: siguiente.id, turnoIniciadoEn: new Date(), turnoCompletadoEn: null },
    });

    return { turno: await turnoActualDeEscenario(categoria, escenarioId), terminado: false };
}

// Solo staff: avanza a mano al siguiente participante de la cola fija de UN
// escenario — arranca la fila (nadie sube a tarima solo) y también sirve
// para saltarse a mano la espera de DURACION_RESULTADOS_PRESELECCION_MS una
// vez que el turno actual ya quedó completo. No puede abandonar a alguien
// que todavía no terminó de calificarse (ver la guarda en
// avanzarTurnoPreseleccion) — no es una forma de saltarse a un competidor
// sin calificar. Mismo endpoint sirve durante REPECHAJE_DESEMPATE para
// arrancar la cola de los empatados de ese escenario.
competenciaRouter.post(
    "/categorias/:categoria/preseleccion/siguiente-turno",
    requireRole("SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const categoria = req.params.categoria as Categoria;
        if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
            return res.status(404).json({ error: "Categoría desconocida" });
        }
        const escenarioId = req.query.escenarioId;
        if (typeof escenarioId !== "string") {
            return res.status(400).json({ error: "Falta escenarioId" });
        }

        cancelarAvanceAutomatico(categoria, escenarioId);
        const resultado = await avanzarTurnoPreseleccion(categoria, escenarioId);
        if ("error" in resultado) {
            return res.status(400).json({ error: resultado.error });
        }
        return res.status(201).json(resultado);
    },
);

// Arma el bracket completo de la ronda 1 al azar a partir de los competidores
// pagados de la categoría. Se bloquea si ya existen enfrentamientos para esa
// categoría (para regenerar hay que borrarlos primero, no se hace aquí).
competenciaRouter.post(
    "/categorias/:categoria/generar-bracket",
    requireRole("SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const categoria = req.params.categoria as Categoria;
        if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
            return res.status(404).json({ error: "Categoría desconocida" });
        }
        if (categoria === "PUBLICO_GENERAL") {
            return res.status(400).json({ error: "Público general no compite, no aplica generar bracket" });
        }

        const estadoActual = await prisma.estadoCategoria.findUnique({ where: { categoria } });
        if (estadoActual?.estatus === "PRESELECCION" || estadoActual?.estatus === "REPECHAJE_DESEMPATE") {
            return res.status(400).json({
                error: "Esta categoría está en preselección. Usa 'Generar Top Bracket' en vez del sorteo directo.",
            });
        }

        const existentes = await prisma.enfrentamiento.count({ where: { categoria } });
        if (existentes > 0) {
            return res.status(409).json({
                error: "Ya existen enfrentamientos para esta categoría. Bórralos antes de regenerar el bracket.",
            });
        }

        const competidores = await prisma.registration.findMany({
            where: { categoria, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
            select: { id: true },
        });
        if (competidores.length < 2) {
            return res.status(400).json({ error: "Se necesitan al menos 2 competidores con pago confirmado" });
        }

        const totalRondas = totalRondasParaParticipantes(competidores.length);
        const filas = filasParaRonda(
            categoria,
            1,
            nombreRonda(1, totalRondas),
            competidores.map((c) => c.id),
            emparejarAleatorio,
        );

        // En una sola transacción: si el proceso se interrumpe entre las dos
        // escrituras (ej. crash, redeploy, hot-reload en dev), sin esto se
        // podían quedar los enfrentamientos creados pero la categoría
        // atascada en un estatus viejo — le pasó justo a BGIRLS en pruebas
        // (el bracket ya existía pero el estatus se quedó en PRESELECCION,
        // escondiéndole al admin el panel de enfrentamientos por completo).
        await prisma.$transaction([
            prisma.enfrentamiento.createMany({ data: filas }),
            prisma.estadoCategoria.upsert({
                where: { categoria },
                create: { categoria, estatus: "EN_CURSO", totalRondas },
                update: { estatus: "EN_CURSO", totalRondas },
            }),
        ]);

        const creados = await prisma.enfrentamiento.findMany({
            where: { categoria, rondaNumero: 1 },
            include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
            orderBy: { orden: "asc" },
        });

        return res.status(201).json({ enfrentamientos: creados });
    },
);

interface RankingPreseleccion {
    id: string;
    nombre: string;
    puntajeTotal: number;
    originalidadTotal: number;
    escenarioId: string | null;
}

interface FaltantePreseleccion {
    id: string;
    nombre: string;
    calificacionesRecibidas: number;
    juecesActivos: number;
}

// Rankea a los competidores pagados de una categoría por su puntaje
// acumulado en la ronda VIGENTE de cada quien (preseleccionNumeroDesempate —
// 0 en preselección normal, o su ronda de repechaje en curso). Devuelve
// también quiénes todavía no tienen calificación completa (de TODOS los
// jueces activos de SU escenario) — si un competidor quedó en un escenario
// sin ningún juez activo, cuenta como "faltante" (0 jueces activos nunca se
// puede completar).
async function calcularRankingPreseleccion(
    categoria: Categoria,
): Promise<{ ranking: RankingPreseleccion[]; faltantes: FaltantePreseleccion[] } | { error: string }> {
    const competidores = await prisma.registration.findMany({
        where: { categoria, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
        select: {
            id: true,
            nombreArtistico: true,
            nombres: true,
            apellidos: true,
            preseleccionEscenarioId: true,
            preseleccionNumeroDesempate: true,
        },
    });
    if (competidores.length < CORTES_PRESELECCION[0]!) {
        return {
            error: `Se necesitan al menos ${CORTES_PRESELECCION[0]} competidores con pago confirmado para usar preselección; para categorías más chicas usa "Generar bracket" directo.`,
        };
    }

    const ids = competidores.map((c) => c.id);
    const sumas = await prisma.puntuacionPreseleccion.groupBy({
        by: ["registrationId", "numeroDesempate"],
        where: { registrationId: { in: ids } },
        _count: { id: true },
        _sum: { tecnica: true, ejecucion: true, vocabulario: true, musicalidad: true, originalidad: true },
    });
    const sumaPorLlave = new Map(sumas.map((s) => [`${s.registrationId}:${s.numeroDesempate}`, s]));

    const juecesActivosPorEscenario = new Map<string, number>();
    for (const c of competidores) {
        if (c.preseleccionEscenarioId && !juecesActivosPorEscenario.has(c.preseleccionEscenarioId)) {
            juecesActivosPorEscenario.set(c.preseleccionEscenarioId, await juecesActivosEnEscenario(c.preseleccionEscenarioId));
        }
    }

    const faltantes: FaltantePreseleccion[] = [];
    const ranking: RankingPreseleccion[] = [];
    for (const c of competidores) {
        const nombre = c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
        const juecesActivos = c.preseleccionEscenarioId ? juecesActivosPorEscenario.get(c.preseleccionEscenarioId) ?? 0 : 0;
        const s = sumaPorLlave.get(`${c.id}:${c.preseleccionNumeroDesempate}`);
        const calificacionesRecibidas = s?._count.id ?? 0;
        if (juecesActivos === 0 || calificacionesRecibidas < juecesActivos) {
            faltantes.push({ id: c.id, nombre, calificacionesRecibidas, juecesActivos });
            continue;
        }
        const puntajeTotal =
            (s!._sum.tecnica ?? 0) + (s!._sum.ejecucion ?? 0) + (s!._sum.vocabulario ?? 0) + (s!._sum.musicalidad ?? 0) + (s!._sum.originalidad ?? 0);
        ranking.push({ id: c.id, nombre, puntajeTotal, originalidadTotal: s!._sum.originalidad ?? 0, escenarioId: c.preseleccionEscenarioId });
    }
    ranking.sort((a, b) => b.puntajeTotal - a.puntajeTotal || b.originalidadTotal - a.originalidadTotal);

    return { ranking, faltantes };
}

interface ResultadoCorte {
    topN: number;
    idsCorte: string[];
    empatados: { id: string; nombre: string; puntajeTotal: number }[];
}

// Corta el ranking ya ordenado al Top N (la potencia de 2 de
// CORTES_PRESELECCION más grande que no exceda el total calificado, ver
// potenciaDe2MasGrandeQueNoExceda). Si el último lugar que clasifica empata
// en puntaje+desempate con alguien fuera del corte, devuelve la lista de
// empatados sin cortar — el orden entre ellos sería arbitrario (orden de
// llegada, no del reglamento).
function calcularCorte(ranking: RankingPreseleccion[]): ResultadoCorte | { error: string } {
    const topN = potenciaDe2MasGrandeQueNoExceda(ranking.length, CORTES_PRESELECCION);
    if (!topN) {
        return { error: `Se necesitan al menos ${CORTES_PRESELECCION[0]} competidores calificados para cortar un Top Bracket` };
    }

    const limite = ranking[topN - 1]!;
    const empatados = ranking.filter(
        (r, i) => i >= topN - 1 && r.puntajeTotal === limite.puntajeTotal && r.originalidadTotal === limite.originalidadTotal,
    );

    if (empatados.length > 1) {
        return { topN, idsCorte: [], empatados: empatados.map((e) => ({ id: e.id, nombre: e.nombre, puntajeTotal: e.puntajeTotal })) };
    }
    return { topN, idsCorte: ranking.slice(0, topN).map((r) => r.id), empatados: [] };
}

type ResultadoRankingYCorte =
    | { tipo: "bracket"; enfrentamientos: unknown[]; ranking: (RankingPreseleccion & { clasificado: boolean })[]; cortadosEn: number; totalCalificados: number }
    | { tipo: "repechaje"; empatados: { id: string; nombre: string; puntajeTotal: number }[] }
    | { tipo: "error"; status: number; error: string; faltantes?: FaltantePreseleccion[] };

// Núcleo compartido por POST .../generar-top-bracket (primer intento) y por
// intentarResolverRepechaje (cuando se completa una ronda extra de
// desempate): calcula el ranking vigente y corta al Top N. Si hay empate en
// la frontera, lanza (o relanza) automáticamente la ronda extra —
// REPECHAJE_DESEMPATE — en vez de bloquear para que el admin elija a mano.
// Si no hay empate, arma el Top Bracket con seeding estándar de torneo
// (emparejarConSiembra) y pasa la categoría a EN_CURSO.
async function resolverCorteOLanzarRepechaje(categoria: Categoria): Promise<ResultadoRankingYCorte> {
    const resultadoRanking = await calcularRankingPreseleccion(categoria);
    if ("error" in resultadoRanking) {
        return { tipo: "error", status: 400, error: resultadoRanking.error };
    }
    if (resultadoRanking.faltantes.length > 0) {
        return {
            tipo: "error",
            status: 409,
            error: "Todavía faltan calificaciones de preselección para poder generar el Top Bracket",
            faltantes: resultadoRanking.faltantes,
        };
    }

    const corte = calcularCorte(resultadoRanking.ranking);
    if ("error" in corte) {
        return { tipo: "error", status: 400, error: corte.error };
    }

    if (corte.empatados.length > 0) {
        const idsEmpatados = corte.empatados.map((e) => e.id);
        const escenariosInvolucrados = new Set(
            resultadoRanking.ranking
                .filter((r) => idsEmpatados.includes(r.id))
                .map((r) => r.escenarioId)
                .filter((id): id is string => !!id),
        );

        await prisma.$transaction([
            prisma.registration.updateMany({
                where: { id: { in: idsEmpatados } },
                data: { preseleccionNumeroDesempate: { increment: 1 } },
            }),
            ...[...escenariosInvolucrados].map((escenarioId) =>
                prisma.turnoPreseleccionEscenario.update({
                    where: { categoria_escenarioId: { categoria, escenarioId } },
                    data: { turnoActualId: null, turnoIniciadoEn: null, turnoCompletadoEn: null },
                }),
            ),
            prisma.estadoCategoria.upsert({
                where: { categoria },
                create: { categoria, estatus: "REPECHAJE_DESEMPATE" },
                update: { estatus: "REPECHAJE_DESEMPATE" },
            }),
        ]);

        return { tipo: "repechaje", empatados: corte.empatados };
    }

    const totalRondas = totalRondasParaParticipantes(corte.topN);
    const filas = filasParaRonda(categoria, 1, nombreRonda(1, totalRondas), corte.idsCorte, emparejarConSiembra);

    cancelarTodosLosAvancesAutomaticos(categoria);
    // Misma razón que en /generar-bracket: una sola transacción evita que
    // una interrupción a mitad de camino deje los enfrentamientos creados
    // con la categoría atascada en PRESELECCION/REPECHAJE_DESEMPATE.
    await prisma.$transaction([
        prisma.enfrentamiento.createMany({ data: filas }),
        prisma.estadoCategoria.update({ where: { categoria }, data: { estatus: "EN_CURSO", totalRondas } }),
        prisma.turnoPreseleccionEscenario.deleteMany({ where: { categoria } }),
    ]);

    const creados = await prisma.enfrentamiento.findMany({
        where: { categoria, rondaNumero: 1 },
        include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
        orderBy: { orden: "asc" },
    });

    const idsCorteSet = new Set(corte.idsCorte);
    return {
        tipo: "bracket",
        enfrentamientos: creados,
        ranking: resultadoRanking.ranking.map((r) => ({ ...r, clasificado: idsCorteSet.has(r.id) })),
        cortadosEn: corte.topN,
        totalCalificados: resultadoRanking.ranking.length,
    };
}

// Se llama tras cada calificación de preselección mientras la categoría está
// en REPECHAJE_DESEMPATE (ver POST /preseleccion/:registrationId/calificar).
// Si TODOS los competidores actualmente empatados (preseleccionNumeroDesempate
// > 0) ya tienen su ronda vigente completa por los jueces de su propio
// escenario, vuelve a intentar el corte — automático, sin que el admin tenga
// que volver a apretar ningún botón. Si sigue empatado, resolverCorteOLanzarRepechaje
// ya se encarga de lanzar otra ronda extra ("hasta que desempaten", mismo
// patrón que la fase 1v1).
async function intentarResolverRepechaje(categoria: Categoria): Promise<void> {
    const empatados = await prisma.registration.findMany({
        where: { categoria, preseleccionNumeroDesempate: { gt: 0 }, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
        select: { id: true, preseleccionEscenarioId: true, preseleccionNumeroDesempate: true },
    });
    if (empatados.length === 0) return;

    for (const c of empatados) {
        const juecesActivos = c.preseleccionEscenarioId ? await juecesActivosEnEscenario(c.preseleccionEscenarioId) : 0;
        const { calificacionesRecibidas } = await puntajePreseleccion(c.id, c.preseleccionNumeroDesempate);
        if (juecesActivos === 0 || calificacionesRecibidas < juecesActivos) return;
    }

    const resultado = await resolverCorteOLanzarRepechaje(categoria);
    if (resultado.tipo === "error") {
        console.error(`No se pudo resolver el repechaje de preselección de ${categoria}: ${resultado.error}`);
    }
}

// Cierra la fase de Preselección: rankea a los competidores pagados por su
// puntaje acumulado entre jueces, corta automáticamente al Top N (la potencia
// de 2 de CORTES_PRESELECCION más grande que no exceda el total calificado,
// ver potenciaDe2MasGrandeQueNoExceda) y arma la ronda 1 con seeding estándar
// de torneo (mejor puntaje vs peor puntaje) usando emparejarConSiembra. Si
// hay empate exacto en la frontera del corte, lanza automáticamente una
// ronda extra de repechaje en vez de bloquear (ver resolverCorteOLanzarRepechaje).
competenciaRouter.post(
    "/categorias/:categoria/generar-top-bracket",
    requireRole("SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const categoria = req.params.categoria as Categoria;
        if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
            return res.status(404).json({ error: "Categoría desconocida" });
        }
        if (categoria === "PUBLICO_GENERAL") {
            return res.status(400).json({ error: "Público general no compite, no aplica generar bracket" });
        }

        const estado = await prisma.estadoCategoria.findUnique({ where: { categoria } });
        if (estado?.estatus !== "PRESELECCION") {
            return res.status(400).json({ error: "Esta categoría no está en fase de preselección" });
        }

        const existentes = await prisma.enfrentamiento.count({ where: { categoria } });
        if (existentes > 0) {
            return res.status(409).json({
                error: "Ya existen enfrentamientos para esta categoría. Bórralos antes de regenerar el bracket.",
            });
        }

        const resultado = await resolverCorteOLanzarRepechaje(categoria);
        if (resultado.tipo === "error") {
            return res.status(resultado.status).json({ error: resultado.error, faltantes: resultado.faltantes });
        }
        if (resultado.tipo === "repechaje") {
            return res.status(202).json({ estatus: "REPECHAJE_DESEMPATE", empatados: resultado.empatados });
        }
        return res.status(201).json({
            enfrentamientos: resultado.enfrentamientos,
            ranking: resultado.ranking,
            cortadosEn: resultado.cortadosEn,
            totalCalificados: resultado.totalCalificados,
        });
    },
);

// Público: la pantalla del evento lee esto sin autenticarse.
competenciaRouter.get("/enfrentamientos", async (req, res) => {
    const rawCategoria = req.query.categoria;
    if (rawCategoria !== undefined && typeof rawCategoria !== "string") {
        return res.status(400).json({ error: "Categoría inválida" });
    }
    const categoria = rawCategoria as Categoria | undefined;
    if (categoria && !TODAS_LAS_CATEGORIAS.includes(categoria)) {
        return res.status(400).json({ error: "Categoría desconocida" });
    }

    const enfrentamientos = await prisma.enfrentamiento.findMany({
        ...(categoria ? { where: { categoria } } : {}),
        include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
        orderBy: [{ categoria: "asc" }, { orden: "asc" }],
    });

    return res.json({ enfrentamientos: await conPuntajes(enfrentamientos) });
});

// Solo staff/jueces: las batallas activas ahora mismo (estatus EN_CURSO), con
// cuántos jueces ya calificaron cada una y si el juez que pregunta ya lo hizo
// — así su pantalla sabe si mostrar el formulario o "esperando a los demás".
competenciaRouter.get(
    "/enfrentamientos/en-curso",
    requireRole("JUEZ", "SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const enfrentamientos = await prisma.enfrentamiento.findMany({
            where: { estatus: "EN_CURSO" },
            include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
            orderBy: [{ categoria: "asc" }, { orden: "asc" }],
        });

        const ids = enfrentamientos.map((e) => e.id);
        const juezId = req.admin!.id;
        const numeroDesempatePorId = new Map(enfrentamientos.map((e) => [e.id, e.numeroDesempate]));

        const [misCalificaciones, conteos, juecesActivos] = await Promise.all([
            prisma.calificacionJuez.findMany({
                where: { juezId, enfrentamientoId: { in: ids } },
                select: { enfrentamientoId: true, numeroDesempate: true },
            }),
            prisma.calificacionJuez.groupBy({
                by: ["enfrentamientoId", "numeroDesempate"],
                where: { enfrentamientoId: { in: ids } },
                _count: { id: true },
            }),
            prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } }),
        ]);

        // Ambos filtrados a la ronda de desempate VIGENTE de cada
        // enfrentamiento — si hubo una ronda de desempate, un juez que ya
        // había calificado el intento anterior (ya empatado) debe volver a
        // ver el formulario, no "ya calificaste".
        const yaCalifique = new Set(
            misCalificaciones
                .filter((c) => c.numeroDesempate === numeroDesempatePorId.get(c.enfrentamientoId))
                .map((c) => c.enfrentamientoId),
        );
        const conteoPorId = new Map(
            conteos
                .filter((c) => c.numeroDesempate === numeroDesempatePorId.get(c.enfrentamientoId))
                .map((c) => [c.enfrentamientoId, c._count.id]),
        );

        const resultado = enfrentamientos.map((e) => ({
            ...e,
            yaCalifique: yaCalifique.has(e.id),
            calificacionesRecibidas: conteoPorId.get(e.id) ?? 0,
            juecesActivos,
        }));

        return res.json({ enfrentamientos: resultado });
    },
);

// Solo jueces: calificar una batalla en curso. Si con esta calificación ya
// respondieron todos los jueces activos, resuelve el ganador (o lanza una
// ronda de desempate si empatan, ver intentarResolverEnfrentamiento).
competenciaRouter.post("/enfrentamientos/:id/calificar", requireRole("JUEZ"), async (req, res) => {
    const { id } = req.params;
    if (typeof id !== "string") {
        return res.status(400).json({ error: "Falta id" });
    }

    const enfrentamiento = await prisma.enfrentamiento.findUnique({ where: { id } });
    if (!enfrentamiento) {
        return res.status(404).json({ error: "Enfrentamiento no encontrado" });
    }
    if (enfrentamiento.estatus !== "EN_CURSO") {
        return res.status(400).json({ error: "Esta batalla no está en curso" });
    }
    if (!enfrentamiento.competidorAId || !enfrentamiento.competidorBId) {
        return res.status(400).json({ error: "Esta batalla no tiene dos competidores (¿es un bye?)" });
    }

    const parsed = calificarSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    try {
        await prisma.calificacionJuez.create({
            data: {
                enfrentamientoId: id,
                juezId: req.admin!.id,
                numeroDesempate: enfrentamiento.numeroDesempate,
                ...parsed.data,
            },
        });
    } catch (error: any) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Ya calificaste esta batalla" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo guardar la calificación" });
    }

    const resultado = await intentarResolverEnfrentamiento(id);
    return res.status(201).json(resultado);
});

competenciaRouter.post("/enfrentamientos", requireRole("SUPER_ADMIN", "STAFF_JUECEO"), async (req, res) => {
    const parsed = crearEnfrentamientoSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const enfrentamiento = await prisma.enfrentamiento.create({
        data: sinIndefinidos(parsed.data),
        include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
    });

    return res.status(201).json({ enfrentamiento });
});

// Solo SUPER_ADMIN: es quien controla las pantallas en vivo durante el
// evento y puede cortar el turno de un competidor antes de que se agote el
// tiempo (ej. terminó a los 45s de un turno de 60s), para que pase el
// contrincante sin esperar el resto del cronómetro. Ver
// frontend/src/app/pantalla/SecuenciaBatalla.tsx para cómo se usa el timestamp.
competenciaRouter.post("/enfrentamientos/:id/cortar-turno", requireRole("SUPER_ADMIN"), async (req, res) => {
    const { id } = req.params;
    if (typeof id !== "string") {
        return res.status(400).json({ error: "Falta id" });
    }
    const turno = req.body?.turno;
    if (turno !== "A" && turno !== "B") {
        return res.status(400).json({ error: "turno debe ser 'A' o 'B'" });
    }

    const enfrentamiento = await prisma.enfrentamiento.findUnique({ where: { id } });
    if (!enfrentamiento) {
        return res.status(404).json({ error: "Enfrentamiento no encontrado" });
    }
    if (enfrentamiento.estatus !== "EN_CURSO") {
        return res.status(400).json({ error: "Esta batalla no está en curso" });
    }

    const campo = turno === "A" ? "turnoACortadoEn" : "turnoBCortadoEn";
    if (enfrentamiento[campo]) {
        return res.status(409).json({ error: "Ese turno ya fue cortado" });
    }

    const actualizado = await prisma.enfrentamiento.update({
        where: { id },
        data: { [campo]: new Date() },
        include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
    });

    return res.json({ enfrentamiento: actualizado });
});

competenciaRouter.patch("/enfrentamientos/:id", requireRole("SUPER_ADMIN", "STAFF_JUECEO"), async (req, res) => {
    const { id } = req.params;
    if (typeof id !== "string") {
        return res.status(400).json({ error: "Falta id" });
    }

    const parsed = editarEnfrentamientoSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    try {
        const enfrentamiento = await prisma.enfrentamiento.update({
            where: { id },
            data: sinIndefinidos(parsed.data),
            include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
        });

        if (enfrentamiento.estatus === "FINALIZADO" && enfrentamiento.ganadorId) {
            await intentarAvanzarRonda(enfrentamiento.categoria, enfrentamiento.rondaNumero);
        }

        return res.json({ enfrentamiento });
    } catch (error: any) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Enfrentamiento no encontrado" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo actualizar el enfrentamiento" });
    }
});
