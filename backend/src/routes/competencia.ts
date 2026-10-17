import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/requireAuth";
import { sinIndefinidos } from "../lib/utils";
import { modoPruebaActivo } from "../lib/modoEvento";
import { miDesgloseLimiter } from "../lib/rateLimit";
import {
    emparejarAleatorio,
    emparejarConSiembra,
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
// siempre (1) para rondas tempranas, 2 en Semifinal y 3 en la Final — hasta
// ahí entran los jueces, sigue siendo una sola calificación por juez, sobre
// el total de todas las vueltas (ver rondasBaile en schema.prisma y
// calcularLimites en frontend/src/app/pantalla/SecuenciaBatalla.tsx).
function rondasBailePorNombre(nombreDeRonda: string): number {
    if (nombreDeRonda === "Final") return 3;
    if (nombreDeRonda === "Semifinal") return 2;
    return 1;
}

// Arma las filas de una ronda a partir de la lista de participantes (ya
// emparejados por `emparejador`, mejor seed primero dentro de cada pareja).
// Lado azul y lado rojo: `emparejador` entrega competidorA como el mejor
// sembrado/puntaje de la pareja — acá se invierte a propósito, porque en la
// base de datos competidorA = lado AZUL = quien siempre inicia la batalla, y
// la regla del reglamento es que inicia el más débil (menor puntaje), no el
// más fuerte. competidorB = lado ROJO = el más fuerte. En un bye no hay
// rival, así que no hay nada que invertir. El orden de la lista de slots ES
// el orden de posición en el árbol (campo `orden`).
function filasParaRonda(
    categoria: Categoria,
    rondaNumero: number,
    nombreDeRonda: string,
    participantes: string[],
    emparejador: (participantes: string[]) => EmparejamientoSlot<string>[],
): FilaRondaNueva[] {
    const slots = emparejador(participantes);
    const rondasBaile = rondasBailePorNombre(nombreDeRonda);

    return slots.map((slot, orden) => {
        const hayRival = slot.competidorB !== null;
        const competidorAId = hayRival ? slot.competidorB! : slot.competidorA;
        const competidorBId = hayRival ? slot.competidorA : null;
        return {
            categoria,
            ronda: nombreDeRonda,
            rondaNumero,
            orden,
            competidorAId,
            competidorBId,
            estatus: hayRival ? "PENDIENTE" : "FINALIZADO",
            ganadorId: hayRival ? null : competidorAId,
            rondasBaile,
        };
    });
}

interface PuntajeAcumulado {
    total: number;
    originalidad: number;
    presentadoEn: Date;
}

// Puntaje acumulado de un competidor a través de TODAS las fases jugadas
// hasta ahora en la categoría: su puntaje de Preselección (si aplica) más la
// suma de lo que recibió en cada batalla 1v1 que ya ganó (ronda decisiva de
// cada una, ver numeroDesempate). Se usa para el Reordenamiento dinámico del
// bracket (ver intentarAvanzarRonda): el mejor puntaje acumulado se enfrenta
// siempre al peor entre los que siguen vivos, no al que le tocó por posición
// fija del árbol.
async function puntajesAcumuladosBatalla(
    categoria: Categoria,
    competidorIds: string[],
): Promise<Map<string, PuntajeAcumulado>> {
    const registros = await prisma.registration.findMany({
        where: { id: { in: competidorIds } },
        select: { id: true, createdAt: true, preseleccionEscenarioId: true, preseleccionNumeroDesempate: true },
    });

    const acumulado = new Map<string, PuntajeAcumulado>();
    for (const r of registros) {
        let total = 0;
        let originalidad = 0;
        if (r.preseleccionEscenarioId) {
            const { desglose } = await puntajePreseleccion(r.id, r.preseleccionNumeroDesempate);
            if (desglose) {
                total += desglose.tecnica + desglose.ejecucion + desglose.vocabulario + desglose.musicalidad + desglose.originalidad;
                originalidad += desglose.originalidad;
            }
        }
        acumulado.set(r.id, { total, originalidad, presentadoEn: r.createdAt });
    }

    const enfrentamientosJugados = await prisma.enfrentamiento.findMany({
        where: {
            categoria,
            estatus: "FINALIZADO",
            OR: [{ competidorAId: { in: competidorIds } }, { competidorBId: { in: competidorIds } }],
        },
        select: { id: true, numeroDesempate: true, competidorAId: true, competidorBId: true },
    });
    const idsEnfrentamientos = enfrentamientosJugados.map((e) => e.id);
    const sumas = await prisma.calificacionJuez.groupBy({
        by: ["enfrentamientoId", "numeroDesempate"],
        where: { enfrentamientoId: { in: idsEnfrentamientos } },
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
    const sumaPorLlave = new Map(sumas.map((s) => [`${s.enfrentamientoId}:${s.numeroDesempate}`, s._sum]));

    for (const e of enfrentamientosJugados) {
        const s = sumaPorLlave.get(`${e.id}:${e.numeroDesempate}`);
        if (!s) continue;
        if (e.competidorAId && acumulado.has(e.competidorAId)) {
            const prev = acumulado.get(e.competidorAId)!;
            prev.total += (s.tecnicaA ?? 0) + (s.ejecucionA ?? 0) + (s.vocabularioA ?? 0) + (s.musicalidadA ?? 0) + (s.originalidadA ?? 0);
            prev.originalidad += s.originalidadA ?? 0;
        }
        if (e.competidorBId && acumulado.has(e.competidorBId)) {
            const prev = acumulado.get(e.competidorBId)!;
            prev.total += (s.tecnicaB ?? 0) + (s.ejecucionB ?? 0) + (s.vocabularioB ?? 0) + (s.musicalidadB ?? 0) + (s.originalidadB ?? 0);
            prev.originalidad += s.originalidadB ?? 0;
        }
    }

    return acumulado;
}

// Si todos los enfrentamientos de (categoria, rondaNumero) ya tienen ganador,
// arma la siguiente ronda con los ganadores, o marca la categoría FINALIZADA
// si ya solo queda un campeón. No hace nada si la ronda sigue incompleta.
async function intentarAvanzarRonda(categoria: Categoria, rondaNumero: number): Promise<void> {
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

    // Reordenamiento dinámico por puntaje acumulado: antes de armar la
    // siguiente ronda se recalcula quién va mejor (Preselección + batallas
    // ganadas hasta ahora) y se vuelve a sembrar con el mismo criterio de
    // torneo que el corte de Preselección (mejor vs peor, ver
    // emparejarConSiembra) — ya NO se conserva la posición fija del árbol de
    // la ronda 1. Empate exacto en puntaje total: desempata Originalidad
    // acumulada y, si también empatan ahí, el orden de presentación/registro
    // (mismo respaldo que usa calcularRankingPreseleccion).
    const puntajes = await puntajesAcumuladosBatalla(categoria, ganadores);
    const ganadoresOrdenados = [...ganadores].sort((a, b) => {
        const pa = puntajes.get(a)!;
        const pb = puntajes.get(b)!;
        return (
            pb.total - pa.total ||
            pb.originalidad - pa.originalidad ||
            pa.presentadoEn.getTime() - pb.presentadoEn.getTime()
        );
    });

    const filas = filasParaRonda(
        categoria,
        siguienteNumero,
        nombreRonda(siguienteNumero, totalRondas),
        ganadoresOrdenados,
        emparejarConSiembra,
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
            data: {
                numeroDesempate: nuevoNumero,
                turnoACortadoEn: null,
                turnoBCortadoEn: null,
                bailesFinalizadosEn: null,
                // Reinicia la referencia de tiempo para este nuevo intento —
                // calcularLimites en el frontend arranca de nuevo desde acá
                // (anuncio VS, presentaciones, vueltas), no desde la pelea
                // original que ya empató.
                iniciadoEn: new Date(),
            },
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
        // así que se limpia toda la cola por escenario, para no dejar un
        // competidor "fantasma" marcado en ningún escenario.
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
                    update: { turnoActualId: null, turnoIniciadoEn: null, turnoCortadoEn: null },
                }),
            ),
            prisma.estadoCategoria.upsert({
                where: { categoria },
                create: { categoria, estatus: "PRESELECCION" },
                update: { estatus: "PRESELECCION" },
            }),
        ]);

        // Sube automáticamente al primer competidor de cada escenario a
        // tarima — el staff ya no tiene que apretar "Siguiente" a mano para
        // arrancar cada cola (ver avanzarTurnoPreseleccion). Esta es la
        // ÚNICA vez que "arrancar" requiere una acción del admin (el botón
        // "Iniciar preselección" de la categoría); de ahí en adelante el
        // avance entre competidores es automático en cuanto califican todos
        // los jueces (ver POST /preseleccion/:registrationId/calificar). El
        // botón manual "Iniciar turno" (POST .../preseleccion/iniciar-turno)
        // sigue existiendo como respaldo manual, pero no hace falta usarlo
        // en el flujo normal.
        for (const esc of escenariosActivos) {
            await avanzarTurnoPreseleccion(categoria, esc.id);
        }

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

    const escenarioId = registro.preseleccionEscenarioId;

    // Sin cronómetro en Preselección: solo se puede calificar a quien el
    // staff tiene AHORA MISMO en tarima en este escenario, y solo después de
    // que corte su rutina con el botón "Cortar rutina" (ver POST
    // .../preseleccion/cortar-turno) — así se evita que un juez califique
    // antes de que termine la presentación, sin depender de ningún timer.
    const turnoEscenario = await prisma.turnoPreseleccionEscenario.findUnique({
        where: { categoria_escenarioId: { categoria: registro.categoria, escenarioId: escenarioId! } },
    });
    if (!turnoEscenario || turnoEscenario.turnoActualId !== registrationId) {
        return res.status(400).json({ error: "Este competidor no está en tarima en este momento" });
    }
    if (!turnoEscenario.turnoCortadoEn) {
        return res.status(400).json({ error: "El staff todavía no cierra la rutina de este competidor" });
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

    const [juecesActivos, { calificacionesRecibidas }] = await Promise.all([
        juecesActivosEnEscenario(escenarioId!),
        puntajePreseleccion(registrationId, numeroDesempate),
    ]);
    const turnoCompleto = juecesActivos > 0 && calificacionesRecibidas >= juecesActivos;

    // Si la categoría está resolviendo un empate en la frontera de corte,
    // revisa si con esta calificación ya se completó la ronda vigente de
    // TODOS los empatados — de ser así, recorta de nuevo (puede resolverse y
    // armar el Top Bracket, o lanzar otra ronda extra y reiniciarla). Se hace
    // ANTES de avanzar el turno para que, si se lanza una ronda nueva, el
    // avance de abajo suba directo al primero de esa ronda nueva.
    if (estado.estatus === "REPECHAJE_DESEMPATE") {
        await intentarResolverRepechaje(registro.categoria);
    }

    // Avance automático: en cuanto todos los jueces activos de este
    // escenario califican, sube solo al siguiente competidor — no hace
    // falta ningún botón (el control manual del staff es "Cortar rutina",
    // que decide CUÁNDO termina cada presentación; una vez calificada por
    // todos, pasar al siguiente ya no requiere ninguna acción). Si la
    // categoría ya salió de Preselección/Repechaje (ej. esta calificación
    // resolvió el repechaje y ya se generó el bracket), avanzarTurnoPreseleccion
    // simplemente no hace nada — se ignora el error.
    if (turnoCompleto) {
        await avanzarTurnoPreseleccion(registro.categoria, escenarioId!).catch((error) => console.error(error));
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
    // true una vez que el staff cortó su rutina (ver POST
    // .../preseleccion/cortar-turno) — antes de eso ningún juez puede
    // calificarlo, y en pantalla solo se ve nombre+foto sin ningún
    // cronómetro (ver SecuenciaPreseleccion en el frontend).
    cortado: boolean;
    calificacionesRecibidas: number;
    juecesActivos: number;
    completo: boolean;
}

const TURNO_ACTUAL_SELECT = { ...COMPETIDOR_SELECT.select, preseleccionNumeroDesempate: true };

// Quién está en tarima ahora mismo en la fase de Preselección de UN
// escenario, con su avance de calificación — para /pantalla?escenario=
// (overlay con cronómetro + resultado, ver
// frontend/src/app/pantalla/SecuenciaPreseleccion.tsx) y admin/jueceo (a
// quién debe calificar un juez de ese escenario). Lo usan el GET público y
// las rutas de abajo.
async function turnoActualDeEscenario(categoria: Categoria, escenarioId: string): Promise<TurnoPreseleccionActual | null> {
    const turno = await prisma.turnoPreseleccionEscenario.findUnique({
        where: { categoria_escenarioId: { categoria, escenarioId } },
        include: { turnoActual: { select: TURNO_ACTUAL_SELECT } },
    });
    if (!turno?.turnoActual || !turno.turnoIniciadoEn) {
        return null;
    }

    const { preseleccionNumeroDesempate, ...participante } = turno.turnoActual;
    const [juecesActivos, { calificacionesRecibidas }] = await Promise.all([
        juecesActivosEnEscenario(escenarioId),
        puntajePreseleccion(participante.id, preseleccionNumeroDesempate),
    ]);

    return {
        participante,
        categoria,
        escenarioId,
        iniciadoEn: turno.turnoIniciadoEn,
        cortado: !!turno.turnoCortadoEn,
        calificacionesRecibidas,
        juecesActivos,
        completo: juecesActivos > 0 && calificacionesRecibidas >= juecesActivos,
    };
}

// Si queda alguien en la cola de este escenario sin haber empezado su turno
// todavía (no cuenta a quien ya está en tarima ahora mismo, ver
// `excluirId`) — lo que decide si el panel de admin ofrece "Iniciar turno"
// o "Fila terminada", y si la pantalla pública debe quedarse en el estado
// "esperando" en vez de apagarse (ver Control manual de rutina).
async function hayPendientesEnEscenario(
    categoria: Categoria,
    escenarioId: string,
    excluirId: string | null,
): Promise<boolean> {
    const participantes = await prisma.registration.findMany({
        where: { categoria, preseleccionEscenarioId: escenarioId, estatusPago: "PAGADO", esPrueba: await modoPruebaActivo() },
        select: { id: true, preseleccionNumeroDesempate: true },
    });
    if (participantes.length === 0) return false;

    const juecesActivos = await juecesActivosEnEscenario(escenarioId);
    const puntuaciones = await prisma.puntuacionPreseleccion.groupBy({
        by: ["registrationId", "numeroDesempate"],
        where: { registrationId: { in: participantes.map((p) => p.id) } },
        _count: { id: true },
    });
    const conteoPorLlave = new Map(puntuaciones.map((p) => [`${p.registrationId}:${p.numeroDesempate}`, p._count.id]));

    return participantes.some(
        (p) => p.id !== excluirId && (conteoPorLlave.get(`${p.id}:${p.preseleccionNumeroDesempate}`) ?? 0) < juecesActivos,
    );
}

// Público: la pantalla del evento lee esto sin autenticarse, igual que
// /enfrentamientos y /categorias. `hayPendientes` le dice al admin si debe
// ofrecer "Iniciar turno" (ver POST .../preseleccion/iniciar-turno) y a la
// pantalla si debe mostrar "esperando al siguiente" en vez de apagarse.
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
    const hayPendientes = await hayPendientesEnEscenario(categoria, escenarioId, turno?.participante.id ?? null);
    return res.json({ turno, hayPendientes });
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

export interface ResultadoPreseleccionDetallado {
    id: string;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    competidorId: string | null;
    fotoUrl: string | null;
    escenarioId: string | null;
    escenarioNombre: string | null;
    numeroDesempate: number;
    calificacionesRecibidas: number;
    juecesActivos: number;
    puntajeTotal: number | null;
    completo: boolean;
}

// Calcula el ranking completo (todos los pagados, aunque no hayan sido
// calificados todavía) de la fase de Preselección — con puntaje real,
// siempre. Usado por el panel de staff (datos completos en todo momento) y,
// filtrado, por el endpoint público de abajo (ver
// PRIVACIDAD_PUNTAJES_PRESELECCION). Mismo cálculo de puntaje que
// generar-top-bracket, pero sin cortar ni exigir que esté completo — acá
// "completo" es solo un dato más por fila.
async function calcularResultadosPreseleccionDetallados(categoria: Categoria): Promise<ResultadoPreseleccionDetallado[]> {
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

    return resultados;
}

// Privacidad de calificaciones en filtros: los puntajes de Preselección solo
// se revelan (al público, en /mi-desglose, y en el recorrido de resultados
// de /pantalla) una vez que la categoría YA SALIÓ de PRESELECCION/
// REPECHAJE_DESEMPATE — es decir, que el admin ya generó el Top Bracket (ver
// POST .../generar-top-bracket y resolverCorteOLanzarRepechaje). No basta con
// que todos los jueces ya hayan calificado: si hay empate en la frontera del
// corte, "todos calificados" llega ANTES de que se resuelva el repechaje, y
// mostrar puntajes en esa ventana expondría quiénes están empatados antes de
// tiempo.
async function preseleccionRevelada(categoria: Categoria): Promise<boolean> {
    const estado = await prisma.estadoCategoria.findUnique({ where: { categoria } });
    const estatus = estado?.estatus ?? "NO_INICIADA";
    return estatus !== "PRESELECCION" && estatus !== "REPECHAJE_DESEMPATE";
}

function ocultarPuntajesSiNoRevelado(
    resultados: ResultadoPreseleccionDetallado[],
    revelado: boolean,
): ResultadoPreseleccionDetallado[] {
    if (revelado) return resultados;
    return resultados.map((r) => ({ ...r, puntajeTotal: null }));
}

// Público: la pantalla del evento lee esto sin autenticarse. Ver
// preseleccionRevelada — mientras la categoría sigue en Preselección/
// Repechaje, viaja sin puntajes.
competenciaRouter.get("/categorias/:categoria/preseleccion/resultados", async (req, res) => {
    const categoria = req.params.categoria as Categoria;
    if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
        return res.status(404).json({ error: "Categoría desconocida" });
    }

    const [resultados, revelado] = await Promise.all([
        calcularResultadosPreseleccionDetallados(categoria),
        preseleccionRevelada(categoria),
    ]);
    return res.json({ resultados: ocultarPuntajesSiNoRevelado(resultados, revelado) });
});

// Solo staff: mismo ranking que el endpoint público de arriba, pero SIEMPRE
// con los puntajes reales — lo necesita el panel de Admin > Competencia para
// que el staff pueda seguir el avance de la calificación en vivo y decidir
// cuándo ya está todo listo para generar el Top Bracket.
competenciaRouter.get(
    "/categorias/:categoria/preseleccion/resultados-staff",
    requireRole("SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const categoria = req.params.categoria as Categoria;
        if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
            return res.status(404).json({ error: "Categoría desconocida" });
        }

        const resultados = await calcularResultadosPreseleccionDetallados(categoria);
        return res.json({ resultados });
    },
);

// Avanza el turnoActualId de UN escenario al siguiente de su cola fija
// (orden de registro, createdAt — mismo orden que usa POST
// .../preseleccion/iniciar para repartir los lotes). Se llama sola, sin
// ningún botón: al iniciar la Preselección (sube al primero de cada
// escenario), al completarse la calificación de todos los jueces activos de
// un turno (ver POST /preseleccion/:registrationId/calificar), y al lanzar
// una nueva ronda de repechaje (ver resolverCorteOLanzarRepechaje). Si el
// turno actual ya no está en la lista de pagados de ese escenario (ej. se le
// canceló el pago), se trata como si no hubiera turno y arranca desde el
// principio de la fila.
//
// El filtro "calificación completa en la ronda VIGENTE de cada quien"
// (preseleccionNumeroDesempate) sirve para preselección normal Y para
// repechaje sin ninguna rama especial: en preselección normal todos están en
// ronda 0, así que solo entran como candidatos los que aún no terminan; en
// repechaje, los no-empatados ya están completos en su ronda 0 (nunca vuelven
// a aparecer) y solo los empatados —recién subidos a una ronda nueva sin
// calificaciones todavía— entran como candidatos.
async function avanzarTurnoPreseleccion(
    categoria: Categoria,
    escenarioId: string,
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

    // Nunca debe abandonar a quien está en tarima si todavía no lo
    // calificaron todos los jueces activos de este escenario — esta función
    // solo se llama automáticamente cuando el turno vigente ya se completó
    // (ver POST /preseleccion/:registrationId/calificar), pero esta guarda
    // se deja igual como respaldo defensivo.
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
    // para que nunca reaparezca a alguien que ya calificaron todos los
    // jueces. Si ya no queda nadie sin calificar, simplemente no encuentra a
    // nadie y la fila se queda terminada (turnoActualId en null).
    const siguiente = participantes
        .slice(idxActual + 1)
        .find((p) => calificacionesVigentes(p.id, p.preseleccionNumeroDesempate) < juecesActivos);

    if (!siguiente) {
        await prisma.turnoPreseleccionEscenario.update({
            where: { categoria_escenarioId: { categoria, escenarioId } },
            data: { turnoActualId: null, turnoIniciadoEn: null, turnoCortadoEn: null },
        });
        return { turno: null, terminado: true };
    }

    await prisma.turnoPreseleccionEscenario.update({
        where: { categoria_escenarioId: { categoria, escenarioId } },
        data: { turnoActualId: siguiente.id, turnoIniciadoEn: new Date(), turnoCortadoEn: null },
    });

    return { turno: await turnoActualDeEscenario(categoria, escenarioId), terminado: false };
}

// Solo staff: cierra la rutina del competidor que está en tarima ahora mismo
// en UN escenario — a partir de este clic los jueces de ese escenario pueden
// calificarlo (ver el gate en POST /preseleccion/:registrationId/calificar).
// No hay cronómetro en Preselección: el staff decide a ojo cuándo terminó la
// presentación, en vez de esperar una duración fija.
competenciaRouter.post(
    "/categorias/:categoria/preseleccion/cortar-turno",
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

        const turnoEscenario = await prisma.turnoPreseleccionEscenario.findUnique({
            where: { categoria_escenarioId: { categoria, escenarioId } },
        });
        if (!turnoEscenario || !turnoEscenario.turnoActualId) {
            return res.status(400).json({ error: "No hay nadie en tarima en este escenario" });
        }
        if (turnoEscenario.turnoCortadoEn) {
            return res.status(409).json({ error: "Ya se cortó la rutina de este competidor" });
        }

        await prisma.turnoPreseleccionEscenario.update({
            where: { categoria_escenarioId: { categoria, escenarioId } },
            data: { turnoCortadoEn: new Date() },
        });

        return res.status(201).json({ turno: await turnoActualDeEscenario(categoria, escenarioId) });
    },
);

// Solo staff: sube manualmente al siguiente competidor de la cola de UN
// escenario (Control manual de rutina) — reemplaza el avance automático que
// existía antes. Sirve tanto para subir al primero (nadie en tarima) como
// para reemplazar a quien ya terminó de calificarse; avanzarTurnoPreseleccion
// rechaza el intento si todavía falta algún juez por calificar al que sigue
// en tarima, así que nunca se abandona a alguien a medio calificar.
competenciaRouter.post(
    "/categorias/:categoria/preseleccion/iniciar-turno",
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

        const turnoEscenario = await prisma.turnoPreseleccionEscenario.findUnique({
            where: { categoria_escenarioId: { categoria, escenarioId } },
        });
        if (!turnoEscenario) {
            return res.status(404).json({ error: "Este escenario no participa en la preselección de esta categoría" });
        }

        // avanzarTurnoPreseleccion ya sirve tanto para subir al primero
        // (turnoActualId en null) como para reemplazar al que ya terminó de
        // calificarse (y rechaza el intento si todavía falta algún juez por
        // calificar al que sigue en tarima).
        const resultado = await avanzarTurnoPreseleccion(categoria, escenarioId);
        if ("error" in resultado) {
            return res.status(400).json({ error: resultado.error });
        }

        return res.status(201).json({ turno: resultado.turno });
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
    // Orden de registro = orden en que se presentaron en tarima (misma cola
    // fija que usa avanzarTurnoPreseleccion). Desempata cuando dos
    // competidores quedan exactamente iguales en puntaje total Y en
    // Originalidad, fuera de la frontera del corte (ahí sí se lanza
    // REPECHAJE_DESEMPATE, ver calcularCorte) — sin esto el orden entre
    // ellos sería arbitrario (orden de la consulta a la base).
    presentadoEn: Date;
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
            createdAt: true,
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
        ranking.push({
            id: c.id,
            nombre,
            puntajeTotal,
            originalidadTotal: s!._sum.originalidad ?? 0,
            escenarioId: c.preseleccionEscenarioId,
            presentadoEn: c.createdAt,
        });
    }
    ranking.sort(
        (a, b) =>
            b.puntajeTotal - a.puntajeTotal ||
            b.originalidadTotal - a.originalidadTotal ||
            a.presentadoEn.getTime() - b.presentadoEn.getTime(),
    );

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
        const escenariosInvolucrados = [
            ...new Set(
                resultadoRanking.ranking
                    .filter((r) => idsEmpatados.includes(r.id))
                    .map((r) => r.escenarioId)
                    .filter((id): id is string => !!id),
            ),
        ];

        // Escenarios en paralelo: consolida a TODOS los empatados en un solo
        // escenario (el de menor `orden` entre los escenarios de donde ya
        // venían) en vez de dejarlos repartidos entre 2-3 — los demás
        // escenarios involucrados se deshabilitan para esta ronda (se borra
        // su TurnoPreseleccionEscenario, así desaparecen tanto del panel de
        // admin como de la pantalla).
        const escenariosOrdenados = await prisma.escenario.findMany({
            where: { id: { in: escenariosInvolucrados } },
            orderBy: { orden: "asc" },
            select: { id: true },
        });
        const escenarioDestino = escenariosOrdenados[0]!.id;
        const escenariosADeshabilitar = escenariosInvolucrados.filter((id) => id !== escenarioDestino);

        await prisma.$transaction([
            prisma.registration.updateMany({
                where: { id: { in: idsEmpatados } },
                data: { preseleccionNumeroDesempate: { increment: 1 }, preseleccionEscenarioId: escenarioDestino },
            }),
            prisma.turnoPreseleccionEscenario.update({
                where: { categoria_escenarioId: { categoria, escenarioId: escenarioDestino } },
                data: { turnoActualId: null, turnoIniciadoEn: null, turnoCortadoEn: null },
            }),
            ...(escenariosADeshabilitar.length > 0
                ? [
                      prisma.turnoPreseleccionEscenario.deleteMany({
                          where: { categoria, escenarioId: { in: escenariosADeshabilitar } },
                      }),
                  ]
                : []),
            prisma.estadoCategoria.upsert({
                where: { categoria },
                create: { categoria, estatus: "REPECHAJE_DESEMPATE" },
                update: { estatus: "REPECHAJE_DESEMPATE" },
            }),
        ]);

        // Sube automáticamente al primer empatado en el único escenario
        // consolidado — mismo criterio que al iniciar la Preselección, el
        // staff no tiene que subirlo a mano.
        await avanzarTurnoPreseleccion(categoria, escenarioDestino);

        return { tipo: "repechaje", empatados: corte.empatados };
    }

    const totalRondas = totalRondasParaParticipantes(corte.topN);
    const filas = filasParaRonda(categoria, 1, nombreRonda(1, totalRondas), corte.idsCorte, emparejarConSiembra);

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

// Público: la pantalla del evento y /resultados leen esto sin autenticarse.
// Manda el puntaje TOTAL de cada lado (ej. 40 vs 45) pero NUNCA el desglose
// por rubro — ver Consulta individual de desglose: ese detalle es exclusivo
// de cada competidor desde /mi-desglose, no debe poder bajarse de ningún
// endpoint público, ni siquiera uno que la pantalla ya no renderiza.
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

    const conPuntaje = await conPuntajes(enfrentamientos);
    const sinDesglose = conPuntaje.map(({ desgloseA, desgloseB, ...resto }) => resto);
    return res.json({ enfrentamientos: sinDesglose });
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

// Solo SUPER_ADMIN: marca que YA terminaron de bailar las dos partes en
// TODAS las vueltas de este intento (una Final llega a tener hasta 3) y
// habilita de inmediato el envío de calificación de los jueces, sin esperar
// el tiempo nominal completo — arregla el error donde cortar un turno no
// acortaba la espera real de los jueces (ver iniciadoEn en schema.prisma).
// Si nunca se usa este botón, el sistema sigue funcionando igual que antes:
// los jueces pueden enviar en cuanto se agota el tiempo nominal de la última
// vuelta.
competenciaRouter.post("/enfrentamientos/:id/finalizar-baile", requireRole("SUPER_ADMIN"), async (req, res) => {
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
    if (enfrentamiento.bailesFinalizadosEn) {
        return res.status(409).json({ error: "Ya se marcaron las rondas de baile como finalizadas" });
    }

    const actualizado = await prisma.enfrentamiento.update({
        where: { id },
        data: { bailesFinalizadosEn: new Date() },
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
        // Referencia fija de tiempo para calcularLimites en el frontend — a
        // diferencia de updatedAt, no se mueve al cortar un turno después.
        const data = { ...sinIndefinidos(parsed.data), ...(parsed.data.estatus === "EN_CURSO" ? { iniciadoEn: new Date() } : {}) };

        const enfrentamiento = await prisma.enfrentamiento.update({
            where: { id },
            data,
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

const buscarMiDesgloseSchema = z.object({
    nombre: z.string().trim().min(1),
});

// Público: busca por nombre de competidor (Bboy/Bgirl name) — ya es
// información pública (aparece en el bracket, /resultados y la pantalla del
// evento), así que esto NO es una puerta de privacidad, solo encuentra el id
// interno para pedir el detalle (ver GET /mi-desglose de abajo). "Contiene"
// en vez de exacto para tolerar mayúsculas/espacios al escribir desde el
// celular; si hay coincidencias exactas se listan primero (puede haber más
// de un competidor con el mismo nombre artístico, sobre todo entre
// categorías distintas).
competenciaRouter.get("/mi-desglose/buscar", miDesgloseLimiter, async (req, res) => {
    const parsed = buscarMiDesgloseSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: "Falta el nombre de competidor" });
    }
    const { nombre } = parsed.data;

    const registros = await prisma.registration.findMany({
        where: {
            estatusPago: "PAGADO",
            esPrueba: await modoPruebaActivo(),
            nombreArtistico: { contains: nombre, mode: "insensitive" },
        },
        select: { id: true, nombreArtistico: true, nombres: true, apellidos: true, categoria: true, competidorId: true },
        orderBy: { nombreArtistico: "asc" },
        take: 10,
    });

    const nombreLower = nombre.toLowerCase();
    registros.sort((a, b) => {
        const aExacto = a.nombreArtistico.toLowerCase() === nombreLower ? 0 : 1;
        const bExacto = b.nombreArtistico.toLowerCase() === nombreLower ? 0 : 1;
        return aExacto - bExacto;
    });

    return res.json({
        resultados: registros.map((r) => ({
            id: r.id,
            nombre: r.nombreArtistico || `${r.nombres} ${r.apellidos}`,
            categoria: r.categoria,
            competidorId: r.competidorId,
        })),
    });
});

// Público: detalle de desglose de UN competidor por su id interno (ver
// GET /mi-desglose/buscar de arriba). El puntaje/desglose por rubro ya no
// se proyecta en la pantalla pública (ver Simplificación del resultado en
// pantalla principal) — se consulta acá desde el propio teléfono.
//
// TODO(privacidad): esto se busca solo por id (obtenido vía nombre artístico
// público en /mi-desglose/buscar), sin ninguna segunda credencial — pendiente
// a propósito por ahora, ver conversación del 2026-10-16.
competenciaRouter.get("/mi-desglose", miDesgloseLimiter, async (req, res) => {
    const idParam = req.query.id;
    if (typeof idParam !== "string" || idParam.length === 0) {
        return res.status(400).json({ error: "Falta el id del competidor" });
    }

    const registro = await prisma.registration.findFirst({
        where: {
            id: idParam,
            estatusPago: "PAGADO",
            esPrueba: await modoPruebaActivo(),
        },
    });
    if (!registro) {
        return res.status(404).json({ error: "No encontramos ese competidor" });
    }

    // Preselección (si esta categoría la usó): misma privacidad que el resto
    // del sistema — el desglose solo se revela una vez que la categoría ya
    // salió de Preselección/Repechaje (Top Bracket generado), no apenas
    // porque ya calificaron todos los jueces (ver preseleccionRevelada).
    let preseleccion: { puntajeTotal: number; desglose: DesglosePuntaje } | null = null;
    if (registro.preseleccionEscenarioId) {
        const revelado = await preseleccionRevelada(registro.categoria);
        if (revelado) {
            const { puntajeTotal, desglose } = await puntajePreseleccion(registro.id, registro.preseleccionNumeroDesempate);
            if (puntajeTotal != null && desglose) {
                preseleccion = { puntajeTotal, desglose };
            }
        }
    }

    const enfrentamientos = await prisma.enfrentamiento.findMany({
        where: {
            estatus: "FINALIZADO",
            OR: [{ competidorAId: registro.id }, { competidorBId: registro.id }],
        },
        include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT },
        orderBy: { rondaNumero: "asc" },
    });
    const conDesglose = await conPuntajes(enfrentamientos);

    const batallas = conDesglose.map((e) => {
        const soyA = e.competidorAId === registro.id;
        const rival = soyA ? e.competidorB : e.competidorA;
        return {
            id: e.id,
            ronda: e.ronda,
            rivalNombre: rival ? rival.nombreArtistico || `${rival.nombres} ${rival.apellidos}` : null,
            gane: e.ganadorId === registro.id,
            miPuntaje: soyA ? e.puntajeA : e.puntajeB,
            miDesglose: soyA ? e.desgloseA : e.desgloseB,
        };
    });

    return res.json({
        competidor: {
            nombre: registro.nombreArtistico || `${registro.nombres} ${registro.apellidos}`,
            competidorId: registro.competidorId,
            categoria: registro.categoria,
        },
        preseleccion,
        batallas,
    });
});
