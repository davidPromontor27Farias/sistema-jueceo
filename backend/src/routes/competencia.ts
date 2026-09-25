import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/requireAuth";
import { sinIndefinidos } from "../lib/utils";
import {
    emparejarAleatorio,
    emparejarConSiembra,
    emparejarPorPosicion,
    nombreRonda,
    potenciaDe2MasGrandeQueNoExceda,
    totalRondasParaParticipantes,
    type EmparejamientoSlot,
} from "../lib/brackets";
import { CATEGORIAS_LABEL, type Categoria } from "../config/catalog";

const TODAS_LAS_CATEGORIAS = Object.keys(CATEGORIAS_LABEL) as Categoria[];
const CATEGORIAS_ENUM = TODAS_LAS_CATEGORIAS as [Categoria, ...Categoria[]];

// Tamaños de corte permitidos para el Top N automático de la fase de
// Preselección (Filtro/Cypher estilo Red Bull BC One), ver generar-top-bracket.
const CORTES_PRESELECCION = [4, 8, 16, 32, 64];

const ESTATUS_COMPETENCIA = ["NO_INICIADA", "PRESELECCION", "EN_CURSO", "FINALIZADA"] as const;
const ESTATUS_ENFRENTAMIENTO = ["PENDIENTE", "EN_CURSO", "FINALIZADO"] as const;

const patchCategoriaSchema = z.object({ estatus: z.enum(ESTATUS_COMPETENCIA) });

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

const generarTopBracketSchema = z.object({
    // IDs de registro que el admin eligió a mano entre los `empatados` que
    // reportó un intento anterior con 409 EMPATE_EN_CORTE (ver esa ruta).
    desempatePreseleccionIds: z.array(z.string().uuid()).optional(),
});

const COMPETIDOR_SELECT = {
    select: { id: true, nombreArtistico: true, nombres: true, apellidos: true, competidorId: true, fotoUrl: true },
};

interface FilaRondaNueva {
    categoria: Categoria;
    ronda: string;
    rondaNumero: number;
    orden: number;
    competidorAId: string;
    competidorBId: string | null;
    estatus: "PENDIENTE" | "FINALIZADO";
    ganadorId: string | null;
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

    return slots.map((slot, orden) => ({
        categoria,
        ronda: nombreDeRonda,
        rondaNumero,
        orden,
        competidorAId: slot.competidorA,
        competidorBId: slot.competidorB,
        estatus: slot.competidorB ? "PENDIENTE" : "FINALIZADO",
        ganadorId: slot.competidorB ? null : slot.competidorA,
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
    | { completo: true; empatado: true }
    | { completo: true; empatado: false; ganadorId: string };

// Se llama después de guardar cada CalificacionJuez. Si ya calificaron todos
// los jueces activos, suma los 5 criterios de cada uno por competidor; el que
// tenga más gana. Si empatan, desempata la suma de Originalidad entre jueces
// (confirmado con el cliente). Si sigue empatado, se deja EN_CURSO para que
// el SUPER_ADMIN/STAFF_JUECEO lo resuelva a mano (respaldo manual, Art. 40
// del reglamento) — no se inventa un segundo criterio de desempate.
async function intentarResolverEnfrentamiento(enfrentamientoId: string): Promise<ResultadoCalificacion> {
    const enfrentamiento = await prisma.enfrentamiento.findUnique({ where: { id: enfrentamientoId } });
    if (!enfrentamiento || !enfrentamiento.competidorAId || !enfrentamiento.competidorBId) {
        throw new Error("Enfrentamiento inválido para resolver por calificaciones");
    }

    const juecesActivos = await prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } });
    const calificaciones = await prisma.calificacionJuez.findMany({ where: { enfrentamientoId } });

    if (calificaciones.length < juecesActivos) {
        return { completo: false, faltan: juecesActivos - calificaciones.length };
    }

    let totalA = 0;
    let totalB = 0;
    let originalidadTotalA = 0;
    let originalidadTotalB = 0;
    for (const c of calificaciones) {
        totalA += c.tecnicaA + c.ejecucionA + c.vocabularioA + c.musicalidadA + c.originalidadA;
        totalB += c.tecnicaB + c.ejecucionB + c.vocabularioB + c.musicalidadB + c.originalidadB;
        originalidadTotalA += c.originalidadA;
        originalidadTotalB += c.originalidadB;
    }

    let ganadorId: string | null = null;
    if (totalA !== totalB) {
        ganadorId = totalA > totalB ? enfrentamiento.competidorAId : enfrentamiento.competidorBId;
    } else if (originalidadTotalA !== originalidadTotalB) {
        ganadorId = originalidadTotalA > originalidadTotalB ? enfrentamiento.competidorAId : enfrentamiento.competidorBId;
    }

    if (!ganadorId) {
        return { completo: true, empatado: true };
    }

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
async function conPuntajes<T extends { id: string }>(
    enfrentamientos: T[],
): Promise<(T & { puntajeA: number | null; puntajeB: number | null; desgloseA: DesglosePuntaje | null; desgloseB: DesglosePuntaje | null })[]> {
    const ids = enfrentamientos.map((e) => e.id);
    if (ids.length === 0) return [];

    const sumas = await prisma.calificacionJuez.groupBy({
        by: ["enfrentamientoId"],
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
    const mapaSumas = new Map(sumas.map((s) => [s.enfrentamientoId, s._sum]));

    return enfrentamientos.map((e) => {
        const s = mapaSumas.get(e.id);
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

        // Si el estatus deja de ser PRESELECCION (a mano, sin pasar por
        // generar-top-bracket), se limpia el turno en tarima para no dejar un
        // competidor "fantasma" marcado, y se cancela cualquier avance
        // automático pendiente (ver turnoActualDeCategoria / avanzarTurnoPreseleccion).
        const limpiarTurno =
            parsed.data.estatus !== "PRESELECCION"
                ? { turnoPreseleccionActualId: null, turnoPreseleccionIniciadoEn: null, turnoPreseleccionCompletadoEn: null }
                : {};
        if (parsed.data.estatus !== "PRESELECCION") {
            cancelarAvanceAutomatico(categoria);
        }

        const estado = await prisma.estadoCategoria.upsert({
            where: { categoria },
            create: { categoria, estatus: parsed.data.estatus },
            update: { estatus: parsed.data.estatus, ...limpiarTurno },
        });

        return res.json({ estado });
    },
);

// Solo staff: roster de competidores con pago confirmado de una categoría,
// para elegir a quién enfrentar al capturar un Enfrentamiento.
competenciaRouter.get("/competidores", requireRole("SUPER_ADMIN", "STAFF_JUECEO"), async (req, res) => {
    const rawCategoria = req.query.categoria;
    if (typeof rawCategoria !== "string" || !TODAS_LAS_CATEGORIAS.includes(rawCategoria as Categoria)) {
        return res.status(400).json({ error: "Falta o es inválida la categoría" });
    }

    const competidores = await prisma.registration.findMany({
        where: { categoria: rawCategoria as Categoria, estatusPago: "PAGADO" },
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

        const participantes = await prisma.registration.findMany({
            where: { categoria, estatusPago: "PAGADO" },
            select: { id: true, nombreArtistico: true, nombres: true, apellidos: true, competidorId: true, fotoUrl: true },
            orderBy: { nombreArtistico: "asc" },
        });
        const ids = participantes.map((p) => p.id);

        const [conteos, juecesActivos, misPuntuaciones] = await Promise.all([
            prisma.puntuacionPreseleccion.groupBy({
                by: ["registrationId"],
                where: { registrationId: { in: ids } },
                _count: { id: true },
                _sum: { tecnica: true, ejecucion: true, vocabulario: true, musicalidad: true, originalidad: true },
            }),
            prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } }),
            req.admin!.rol === "JUEZ"
                ? prisma.puntuacionPreseleccion.findMany({
                      where: { juezId: req.admin!.id, registrationId: { in: ids } },
                      select: { registrationId: true },
                  })
                : Promise.resolve([]),
        ]);

        const conteoPorId = new Map(conteos.map((c) => [c.registrationId, c]));
        const yaCalifique = new Set(misPuntuaciones.map((c) => c.registrationId));

        const resultado = participantes.map((p) => {
            const c = conteoPorId.get(p.id);
            const s = c?._sum;
            const puntajeTotal = s
                ? (s.tecnica ?? 0) + (s.ejecucion ?? 0) + (s.vocabulario ?? 0) + (s.musicalidad ?? 0) + (s.originalidad ?? 0)
                : null;
            return {
                ...p,
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

    const estado = await prisma.estadoCategoria.findUnique({ where: { categoria: registro.categoria } });
    if (estado?.estatus !== "PRESELECCION") {
        return res.status(400).json({ error: "Esta categoría no está en fase de preselección" });
    }

    const parsed = puntuacionPreseleccionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    try {
        await prisma.puntuacionPreseleccion.create({
            data: { registrationId, juezId: req.admin!.id, ...parsed.data },
        });
    } catch (error: any) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Ya calificaste a este participante" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo guardar la calificación" });
    }

    // Si esta calificación fue la última que faltaba (todos los jueces
    // activos ya puntuaron) Y es justo quien está en tarima ahora mismo,
    // agenda el avance automático al siguiente: /pantalla se queda
    // DURACION_RESULTADOS_PRESELECCION_MS mostrando nombre+puntaje+desglose
    // antes de pasar solo (ver avanzarTurnoPreseleccion). El `esperado` evita
    // saltarse a alguien si el staff ya avanzó a mano mientras tanto.
    //
    // turnoPreseleccionCompletadoEn se guarda en la base (no solo en el
    // setTimeout en memoria) para que turnoActualDeCategoria pueda
    // autocurarse si el proceso se reinicia en esa ventana de espera (ej.
    // hot-reload de ts-node-dev en desarrollo) y el timer se pierde — sin
    // esto la categoría se queda pegada en un turno ya calificado para
    // siempre, sin avanzar al que realmente falta.
    if (estado.turnoPreseleccionActualId === registrationId) {
        const { calificacionesRecibidas } = await puntajePreseleccion(registrationId);
        const juecesActivos = await prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } });
        if (juecesActivos > 0 && calificacionesRecibidas >= juecesActivos) {
            await prisma.estadoCategoria.update({
                where: { categoria: registro.categoria },
                data: { turnoPreseleccionCompletadoEn: new Date() },
            });
            cancelarAvanceAutomatico(registro.categoria);
            const timer = setTimeout(() => {
                avanzarTurnoPreseleccion(registro.categoria, registrationId).catch((error) => console.error(error));
            }, DURACION_RESULTADOS_PRESELECCION_MS);
            timersAvanceAutomatico.set(registro.categoria, timer);
        }
    }

    return res.status(201).json({ ok: true });
});

// Cuánto se calificó a un participante de Preselección hasta ahora: suma por
// criterio entre todos los jueces (mismo desglose que ya usa /pantalla para
// las batallas 1v1, ver DesglosePuntaje) + total, o null si nadie lo ha
// calificado todavía.
async function puntajePreseleccion(
    registrationId: string,
): Promise<{ calificacionesRecibidas: number; puntajeTotal: number | null; desglose: DesglosePuntaje | null }> {
    const agg = await prisma.puntuacionPreseleccion.aggregate({
        where: { registrationId },
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

// Anotado a mano (en vez de inferido) porque turnoActualDeCategoria y
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
    iniciadoEn: Date;
    calificacionesRecibidas: number;
    juecesActivos: number;
    completo: boolean;
    puntajeTotal: number | null;
    desglose: DesglosePuntaje | null;
}

// Quién está en tarima ahora mismo en la fase de Preselección de una
// categoría, con su avance de calificación — para /pantalla (overlay con
// cronómetro + resultado, ver frontend/src/app/pantalla/SecuenciaPreseleccion.tsx)
// y admin/jueceo (a quién calificar). Lo usan el GET público y las rutas de
// abajo.
async function turnoActualDeCategoria(categoria: Categoria): Promise<TurnoPreseleccionActual | null> {
    let estado = await prisma.estadoCategoria.findUnique({
        where: { categoria },
        include: { turnoPreseleccionActual: COMPETIDOR_SELECT },
    });
    if (!estado?.turnoPreseleccionActual || !estado.turnoPreseleccionIniciadoEn) {
        return null;
    }

    // Autocuración: si este turno ya se completó hace rato pero nadie
    // avanzó a tiempo (el setTimeout en memoria se perdió, ej. el proceso se
    // reinició en esa ventana), cualquier consulta de turno-actual lo
    // detecta acá y avanza sola — /pantalla, admin/jueceo y el panel de
    // competencia hacen poll cada 3-4s, así que se autocorrige solo en unos
    // segundos sin que el staff tenga que intervenir a mano.
    if (
        estado.turnoPreseleccionCompletadoEn &&
        Date.now() - estado.turnoPreseleccionCompletadoEn.getTime() >= DURACION_RESULTADOS_PRESELECCION_MS
    ) {
        const avance = await avanzarTurnoPreseleccion(categoria, estado.turnoPreseleccionActualId ?? undefined);
        if (!("error" in avance)) {
            return avance.turno;
        }
        // Alguien más ya avanzó mientras tanto (ej. otro poll ganó la
        // carrera, o el staff avanzó a mano) — se relee el estado actual.
        estado = await prisma.estadoCategoria.findUnique({
            where: { categoria },
            include: { turnoPreseleccionActual: COMPETIDOR_SELECT },
        });
        if (!estado?.turnoPreseleccionActual || !estado.turnoPreseleccionIniciadoEn) {
            return null;
        }
    }

    const [juecesActivos, { calificacionesRecibidas, puntajeTotal, desglose }] = await Promise.all([
        prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } }),
        puntajePreseleccion(estado.turnoPreseleccionActual.id),
    ]);

    return {
        participante: estado.turnoPreseleccionActual,
        categoria,
        iniciadoEn: estado.turnoPreseleccionIniciadoEn,
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

    const turno = await turnoActualDeCategoria(categoria);
    return res.json({ turno });
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
        where: { categoria, estatusPago: "PAGADO" },
        select: { id: true, nombreArtistico: true, nombres: true, apellidos: true, competidorId: true, fotoUrl: true },
    });
    const ids = participantes.map((p) => p.id);
    const juecesActivos = await prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } });
    const sumas = await prisma.puntuacionPreseleccion.groupBy({
        by: ["registrationId"],
        where: { registrationId: { in: ids } },
        _count: { id: true },
        _sum: { tecnica: true, ejecucion: true, vocabulario: true, musicalidad: true, originalidad: true },
    });
    const sumaPorId = new Map(sumas.map((s) => [s.registrationId, s]));

    const resultados = participantes
        .map((p) => {
            const s = sumaPorId.get(p.id);
            const calificacionesRecibidas = s?._count.id ?? 0;
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
                calificacionesRecibidas,
                puntajeTotal,
                completo: juecesActivos > 0 && calificacionesRecibidas >= juecesActivos,
            };
        })
        .sort((a, b) => (b.puntajeTotal ?? -1) - (a.puntajeTotal ?? -1));

    return res.json({ resultados, juecesActivos });
});

// Cuánto se queda /pantalla mostrando nombre+categoría+puntaje+desglose de un
// participante antes de pasar solo al siguiente (ver avanzarTurnoPreseleccion
// y el timer que agenda POST /preseleccion/:registrationId/calificar).
const DURACION_RESULTADOS_PRESELECCION_MS = 7_000;

// Un timer pendiente de avance automático por categoría (se agenda cuando
// terminan de calificar al turno actual; el staff puede adelantarse con el
// botón manual, por eso hay que poder cancelarlo). Vive en memoria del
// proceso: si el servidor se reinicia a mitad de una espera, ese avance en
// particular se pierde, pero el staff siempre puede apretar "Siguiente" a
// mano — no es una falla catastrófica, solo hay que saberlo.
const timersAvanceAutomatico = new Map<Categoria, ReturnType<typeof setTimeout>>();

function cancelarAvanceAutomatico(categoria: Categoria) {
    const timer = timersAvanceAutomatico.get(categoria);
    if (timer) {
        clearTimeout(timer);
        timersAvanceAutomatico.delete(categoria);
    }
}

// Núcleo compartido por el botón manual "Siguiente" (ver la ruta de abajo) y
// por el avance automático que se agenda al terminar de calificar (ver
// /preseleccion/:registrationId/calificar): avanza turnoPreseleccionActualId
// al siguiente de la cola fija (mismo orden alfabético que GET
// /preseleccion/participantes). Si el turno actual ya no está en la lista de
// pagados (ej. se le canceló el pago), se trata como si no hubiera turno y
// arranca desde el principio de la fila.
//
// `esperado`, si se pasa, es una guarda contra condición de carrera: si el
// turno actual ya cambió a otra persona (ej. el staff avanzó a mano mientras
// corría el timer automático), no hace nada — evita saltarse a alguien.
async function avanzarTurnoPreseleccion(
    categoria: Categoria,
    esperado?: string,
): Promise<{ turno: TurnoPreseleccionActual | null; terminado: boolean } | { error: string }> {
    const estado = await prisma.estadoCategoria.findUnique({ where: { categoria } });
    if (estado?.estatus !== "PRESELECCION") {
        return { error: "Esta categoría no está en fase de preselección" };
    }
    if (esperado !== undefined && estado.turnoPreseleccionActualId !== esperado) {
        return { error: "IGNORADO_YA_AVANZO" };
    }

    const participantes = await prisma.registration.findMany({
        where: { categoria, estatusPago: "PAGADO" },
        select: { id: true },
        orderBy: { nombreArtistico: "asc" },
    });
    if (participantes.length === 0) {
        return { error: "No hay competidores con pago confirmado en esta categoría" };
    }

    const juecesActivos = await prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } });
    const puntuaciones = await prisma.puntuacionPreseleccion.groupBy({
        by: ["registrationId"],
        where: { registrationId: { in: participantes.map((p) => p.id) } },
        _count: { id: true },
    });
    const conteoPorId = new Map(puntuaciones.map((p) => [p.registrationId, p._count.id]));

    const idxActual = estado.turnoPreseleccionActualId
        ? participantes.findIndex((p) => p.id === estado.turnoPreseleccionActualId)
        : -1;

    // Busca el siguiente SIN calificación completa a partir de la posición
    // actual — no solo "el que sigue en la lista" — para que "Siguiente"
    // nunca reaparezca a alguien que ya calificaron todos los jueces. Esto
    // también evita que, una vez que la fila ya se acabó
    // (turnoPreseleccionActualId en null, idxActual = -1), un click de más
    // en "Siguiente" reinicie la fila desde el principio: si ya no queda
    // nadie sin calificar, simplemente no encuentra a nadie y se queda
    // terminado.
    const siguiente = participantes
        .slice(idxActual + 1)
        .find((p) => (conteoPorId.get(p.id) ?? 0) < juecesActivos);

    if (!siguiente) {
        await prisma.estadoCategoria.update({
            where: { categoria },
            data: { turnoPreseleccionActualId: null, turnoPreseleccionIniciadoEn: null, turnoPreseleccionCompletadoEn: null },
        });
        return { turno: null, terminado: true };
    }

    await prisma.estadoCategoria.update({
        where: { categoria },
        data: {
            turnoPreseleccionActualId: siguiente.id,
            turnoPreseleccionIniciadoEn: new Date(),
            turnoPreseleccionCompletadoEn: null,
        },
    });

    return { turno: await turnoActualDeCategoria(categoria), terminado: false };
}

// Solo staff: avanza a mano al siguiente participante de la cola fija —
// arranca la fila (nadie sube a tarima solo) y sirve de respaldo/override si
// hace falta saltar el avance automático de más arriba.
competenciaRouter.post(
    "/categorias/:categoria/preseleccion/siguiente-turno",
    requireRole("SUPER_ADMIN", "STAFF_JUECEO"),
    async (req, res) => {
        const categoria = req.params.categoria as Categoria;
        if (!TODAS_LAS_CATEGORIAS.includes(categoria)) {
            return res.status(404).json({ error: "Categoría desconocida" });
        }

        cancelarAvanceAutomatico(categoria);
        const resultado = await avanzarTurnoPreseleccion(categoria);
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
        if (estadoActual?.estatus === "PRESELECCION") {
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
            where: { categoria, estatusPago: "PAGADO" },
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

        await prisma.enfrentamiento.createMany({ data: filas });
        await prisma.estadoCategoria.upsert({
            where: { categoria },
            create: { categoria, estatus: "EN_CURSO", totalRondas },
            update: { estatus: "EN_CURSO", totalRondas },
        });

        const creados = await prisma.enfrentamiento.findMany({
            where: { categoria, rondaNumero: 1 },
            include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
            orderBy: { orden: "asc" },
        });

        return res.status(201).json({ enfrentamientos: creados });
    },
);

// Cierra la fase de Preselección: rankea a los competidores pagados por su
// puntaje acumulado entre jueces, corta automáticamente al Top N (la potencia
// de 2 de CORTES_PRESELECCION más grande que no exceda el total calificado,
// ver potenciaDe2MasGrandeQueNoExceda) y arma la ronda 1 con seeding estándar
// de torneo (mejor puntaje vs peor puntaje) usando emparejarConSiembra.
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

        const parsedBody = generarTopBracketSchema.safeParse(req.body ?? {});
        if (!parsedBody.success) {
            return res.status(400).json({ errors: parsedBody.error.flatten() });
        }
        const desempateIds = new Set(parsedBody.data.desempatePreseleccionIds ?? []);

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

        const competidores = await prisma.registration.findMany({
            where: { categoria, estatusPago: "PAGADO" },
            select: { id: true, nombreArtistico: true, nombres: true, apellidos: true },
        });
        if (competidores.length < CORTES_PRESELECCION[0]!) {
            return res.status(400).json({
                error: `Se necesitan al menos ${CORTES_PRESELECCION[0]} competidores con pago confirmado para usar preselección; para categorías más chicas usa "Generar bracket" directo.`,
            });
        }

        const juecesActivos = await prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } });
        if (juecesActivos === 0) {
            return res.status(400).json({ error: "No hay jueces activos para calificar la preselección" });
        }

        const ids = competidores.map((c) => c.id);
        const sumas = await prisma.puntuacionPreseleccion.groupBy({
            by: ["registrationId"],
            where: { registrationId: { in: ids } },
            _count: { id: true },
            _sum: { tecnica: true, ejecucion: true, vocabulario: true, musicalidad: true, originalidad: true },
        });
        const sumaPorId = new Map(sumas.map((s) => [s.registrationId, s]));

        const faltantes = competidores
            .map((c) => ({ ...c, calificacionesRecibidas: sumaPorId.get(c.id)?._count.id ?? 0 }))
            .filter((c) => c.calificacionesRecibidas < juecesActivos);
        if (faltantes.length > 0) {
            return res.status(409).json({
                error: "Todavía faltan calificaciones de preselección para poder generar el Top Bracket",
                faltantes: faltantes.map((f) => ({
                    id: f.id,
                    nombre: f.nombreArtistico || `${f.nombres} ${f.apellidos}`,
                    calificacionesRecibidas: f.calificacionesRecibidas,
                    juecesActivos,
                })),
            });
        }

        const ranking = competidores
            .map((c) => {
                const s = sumaPorId.get(c.id)!._sum;
                const puntajeTotal =
                    (s.tecnica ?? 0) + (s.ejecucion ?? 0) + (s.vocabulario ?? 0) + (s.musicalidad ?? 0) + (s.originalidad ?? 0);
                return {
                    id: c.id,
                    nombre: c.nombreArtistico || `${c.nombres} ${c.apellidos}`,
                    puntajeTotal,
                    originalidadTotal: s.originalidad ?? 0,
                };
            })
            .sort((a, b) => b.puntajeTotal - a.puntajeTotal || b.originalidadTotal - a.originalidadTotal);

        const topN = potenciaDe2MasGrandeQueNoExceda(ranking.length, CORTES_PRESELECCION);
        if (!topN) {
            return res.status(400).json({
                error: `Se necesitan al menos ${CORTES_PRESELECCION[0]} competidores calificados para cortar un Top Bracket`,
            });
        }

        // Empate en la línea de corte: el último lugar que clasifica (topN)
        // comparte puntaje+desempate con alguien fuera del corte. El orden
        // entre ellos sería arbitrario (orden de llegada, no del reglamento),
        // así que se bloquea hasta que el admin elija a mano quién avanza.
        const limite = ranking[topN - 1]!;
        const empatados = ranking.filter(
            (r, i) => i >= topN - 1 && r.puntajeTotal === limite.puntajeTotal && r.originalidadTotal === limite.originalidadTotal,
        );

        let idsCorte: string[];
        if (empatados.length > 1) {
            const empatadosIds = new Set(empatados.map((e) => e.id));
            const seguros = ranking.slice(0, topN - 1).filter((r) => !empatadosIds.has(r.id));
            const cuposLibres = topN - seguros.length;
            const elegidos = empatados.filter((e) => desempateIds.has(e.id));

            if (elegidos.length !== cuposLibres) {
                return res.status(409).json({
                    error: "EMPATE_EN_CORTE",
                    cortePosicion: topN,
                    cuposLibres,
                    empatados: empatados.map((e) => ({ id: e.id, nombre: e.nombre, puntajeTotal: e.puntajeTotal })),
                });
            }

            const ordenPuntaje = new Map(ranking.map((r, i) => [r.id, i]));
            idsCorte = [...seguros, ...elegidos].map((r) => r.id).sort((a, b) => ordenPuntaje.get(a)! - ordenPuntaje.get(b)!);
        } else {
            idsCorte = ranking.slice(0, topN).map((r) => r.id);
        }

        const totalRondas = totalRondasParaParticipantes(topN);
        const filas = filasParaRonda(categoria, 1, nombreRonda(1, totalRondas), idsCorte, emparejarConSiembra);

        cancelarAvanceAutomatico(categoria);
        await prisma.enfrentamiento.createMany({ data: filas });
        await prisma.estadoCategoria.update({
            where: { categoria },
            data: {
                estatus: "EN_CURSO",
                totalRondas,
                turnoPreseleccionActualId: null,
                turnoPreseleccionIniciadoEn: null,
                turnoPreseleccionCompletadoEn: null,
            },
        });

        const creados = await prisma.enfrentamiento.findMany({
            where: { categoria, rondaNumero: 1 },
            include: { competidorA: COMPETIDOR_SELECT, competidorB: COMPETIDOR_SELECT, ganador: COMPETIDOR_SELECT },
            orderBy: { orden: "asc" },
        });

        const idsCorteSet = new Set(idsCorte);
        return res.status(201).json({
            enfrentamientos: creados,
            ranking: ranking.map((r) => ({ ...r, clasificado: idsCorteSet.has(r.id) })),
            cortadosEn: topN,
            totalCalificados: competidores.length,
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

        const [misCalificaciones, conteos, juecesActivos] = await Promise.all([
            prisma.calificacionJuez.findMany({
                where: { juezId, enfrentamientoId: { in: ids } },
                select: { enfrentamientoId: true },
            }),
            prisma.calificacionJuez.groupBy({
                by: ["enfrentamientoId"],
                where: { enfrentamientoId: { in: ids } },
                _count: { id: true },
            }),
            prisma.adminUser.count({ where: { rol: "JUEZ", activo: true } }),
        ]);

        const yaCalifique = new Set(misCalificaciones.map((c) => c.enfrentamientoId));
        const conteoPorId = new Map(conteos.map((c) => [c.enfrentamientoId, c._count.id]));

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
// respondieron todos los jueces activos, resuelve el ganador (o lo deja para
// respaldo manual si empata incluso en Originalidad).
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
            data: { enfrentamientoId: id, juezId: req.admin!.id, ...parsed.data },
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
