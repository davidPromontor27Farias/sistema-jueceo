import { Router } from "express";
import { prisma } from "../lib/prisma";
import { vistaRegistrosLimiter } from "../lib/rateLimit";
import { nombreRonda } from "../lib/brackets";
import { CATEGORIAS_LABEL, type Categoria } from "../config/catalog";

export const vistaRegistrosRouter = Router();

// Todas las categorías de competencia (se excluye PUBLICO_GENERAL: quien se
// registra como espectador no entra a ningún bracket).
const CATEGORIAS_COMPETENCIA: Categoria[] = Object.keys(CATEGORIAS_LABEL).filter(
    (categoria) => categoria !== "PUBLICO_GENERAL",
) as Categoria[];

// El bracket se muestra siempre con la forma completa desde Dieciseisavos de
// Final (32 lugares), sin importar cuántos haya inscritos todavía — los
// lugares sin inscrito quedan como casillas vacías, y las rondas 2 en
// adelante siempre están vacías (nadie ha jugado nada aún).
const TAMANO_BRACKET = 32;
const TOTAL_RONDAS = 5;
const PARTIDOS_POR_RONDA = [16, 8, 4, 2, 1];

type CompetidorVista = {
    id: string;
    competidorId: string | null;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    fotoUrl: string | null;
};

type EnfrentamientoVista = {
    id: string;
    categoria: Categoria;
    ronda: string;
    rondaNumero: number;
    orden: number;
    competidorA: CompetidorVista | null;
    competidorB: CompetidorVista | null;
    ganador: null;
    estatus: "PENDIENTE";
    updatedAt: string;
    turnoACortadoEn: null;
    turnoBCortadoEn: null;
};

// Posiciones fijas: quien se inscribió primero ocupa el lugar 1, y así en
// orden — no se vuelve a barajar en cada consulta (si fuera al azar cada
// vez, la gente ya inscrita cambiaría de lugar solo con recargar la
// página).
function construirBracketFijo(categoria: Categoria, competidores: CompetidorVista[]): EnfrentamientoVista[] {
    const enfrentamientos: EnfrentamientoVista[] = [];

    for (let orden = 0; orden < PARTIDOS_POR_RONDA[0]!; orden++) {
        enfrentamientos.push({
            id: `${categoria}-1-${orden}`,
            categoria,
            ronda: nombreRonda(1, TOTAL_RONDAS),
            rondaNumero: 1,
            orden,
            competidorA: competidores[orden * 2] ?? null,
            competidorB: competidores[orden * 2 + 1] ?? null,
            ganador: null,
            estatus: "PENDIENTE",
            updatedAt: "",
            turnoACortadoEn: null,
            turnoBCortadoEn: null,
        });
    }

    for (let ronda = 2; ronda <= TOTAL_RONDAS; ronda++) {
        const cantidad = PARTIDOS_POR_RONDA[ronda - 1]!;
        for (let orden = 0; orden < cantidad; orden++) {
            enfrentamientos.push({
                id: `${categoria}-${ronda}-${orden}`,
                categoria,
                ronda: nombreRonda(ronda, TOTAL_RONDAS),
                rondaNumero: ronda,
                orden,
                competidorA: null,
                competidorB: null,
                ganador: null,
                estatus: "PENDIENTE",
                updatedAt: "",
                turnoACortadoEn: null,
                turnoBCortadoEn: null,
            });
        }
    }

    return enfrentamientos;
}

// Vista de solo lectura, sin login, para que el dueño del evento vea cómo
// van los registros pagados por categoría. NO son los enfrentamientos
// reales (esos se sortean cuando cierra el registro, ver POST
// /competencia/categorias/:categoria/generar-bracket) — aquí solo se
// acomoda a los ya inscritos y pagados en el bracket de 32 lugares, sin
// guardar nada en la base de datos.
vistaRegistrosRouter.get("/", vistaRegistrosLimiter, async (req, res) => {
    const tokenEsperado = process.env.VISTA_REGISTROS_TOKEN;
    const tokenRecibido = typeof req.query.token === "string" ? req.query.token : "";

    if (!tokenEsperado || tokenRecibido !== tokenEsperado) {
        return res.status(403).json({ error: "No autorizado" });
    }

    const registros = await prisma.registration.findMany({
        where: { estatusPago: "PAGADO", categoria: { in: CATEGORIAS_COMPETENCIA } },
        select: {
            id: true,
            competidorId: true,
            categoria: true,
            nombreArtistico: true,
            nombres: true,
            apellidos: true,
            fotoUrl: true,
            createdAt: true,
        },
        orderBy: { createdAt: "asc" },
    });

    const categorias = CATEGORIAS_COMPETENCIA.map((categoria) => {
        const competidores: CompetidorVista[] = registros
            .filter((r) => r.categoria === categoria)
            .map((r) => ({
                id: r.id,
                competidorId: r.competidorId,
                nombreArtistico: r.nombreArtistico,
                nombres: r.nombres,
                apellidos: r.apellidos,
                fotoUrl: r.fotoUrl,
            }))
            .slice(0, TAMANO_BRACKET);

        return {
            categoria,
            label: CATEGORIAS_LABEL[categoria],
            totalInscritos: competidores.length,
            enfrentamientos: construirBracketFijo(categoria, competidores),
        };
    });

    return res.json({ categorias, generadoEn: new Date().toISOString() });
});
