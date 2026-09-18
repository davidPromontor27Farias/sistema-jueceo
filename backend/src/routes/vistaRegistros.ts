import { Router } from "express";
import { prisma } from "../lib/prisma";
import { vistaRegistrosLimiter } from "../lib/rateLimit";
import { emparejarAleatorio, nombreRonda, totalRondasParaParticipantes } from "../lib/brackets";
import { CATEGORIAS_LABEL, type Categoria } from "../config/catalog";

export const vistaRegistrosRouter = Router();

// Todas las categorías de competencia (se excluye PUBLICO_GENERAL: quien se
// registra como espectador no entra a ningún bracket).
const CATEGORIAS_COMPETENCIA: Categoria[] = Object.keys(CATEGORIAS_LABEL).filter(
    (categoria) => categoria !== "PUBLICO_GENERAL",
) as Categoria[];

type CompetidorVista = {
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    fotoUrl: string | null;
};

// Vista de solo lectura, sin login, para que el dueño del evento vea cómo van
// los registros pagados por categoría. NO son los enfrentamientos reales
// (esos se sortean cuando cierra el registro, ver POST
// /competencia/categorias/:categoria/generar-bracket) — aquí solo se arma un
// sorteo de primera ronda EN MEMORIA, sin guardar nada en la base de datos,
// que se recalcula cada vez que se abre el enlace.
vistaRegistrosRouter.get("/", vistaRegistrosLimiter, async (req, res) => {
    const tokenEsperado = process.env.VISTA_REGISTROS_TOKEN;
    const tokenRecibido = typeof req.query.token === "string" ? req.query.token : "";

    if (!tokenEsperado || tokenRecibido !== tokenEsperado) {
        return res.status(403).json({ error: "No autorizado" });
    }

    const registros = await prisma.registration.findMany({
        where: { estatusPago: "PAGADO", categoria: { in: CATEGORIAS_COMPETENCIA } },
        select: { categoria: true, nombreArtistico: true, nombres: true, apellidos: true, fotoUrl: true },
    });

    const categorias = CATEGORIAS_COMPETENCIA.map((categoria) => {
        const competidores: CompetidorVista[] = registros
            .filter((r) => r.categoria === categoria)
            .map((r) => ({
                nombreArtistico: r.nombreArtistico,
                nombres: r.nombres,
                apellidos: r.apellidos,
                fotoUrl: r.fotoUrl,
            }));

        if (competidores.length < 2) {
            return {
                categoria,
                label: CATEGORIAS_LABEL[categoria],
                totalInscritos: competidores.length,
                ronda: null,
                pares: [] as [CompetidorVista, CompetidorVista][],
                bye: null as CompetidorVista | null,
            };
        }

        const { pares, bye } = emparejarAleatorio(competidores);
        const ronda = nombreRonda(1, totalRondasParaParticipantes(competidores.length));

        return { categoria, label: CATEGORIAS_LABEL[categoria], totalInscritos: competidores.length, ronda, pares, bye };
    });

    return res.json({ categorias, generadoEn: new Date().toISOString() });
});
