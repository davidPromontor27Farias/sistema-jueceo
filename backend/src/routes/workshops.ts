import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/requireAuth";
import { modoPruebaActivo } from "../lib/modoEvento";
import { CATEGORIAS_LABEL } from "../config/catalog";

export const workshopsRouter = Router();

// Solo staff: a quién identificar en el evento porque compró al menos un
// Workshop (Breaking o Open Style) — sea que se haya registrado como
// competidor o como público en general (PUBLICO_GENERAL es una categoría más
// del enum, no un tipo aparte). El filtro por nombre lo hace el frontend
// sobre esta misma lista (son a lo más unos cientos de filas, no hace falta
// ida y vuelta al servidor por cada tecla).
workshopsRouter.get("/", requireRole("SUPER_ADMIN", "STAFF_ACCESO"), async (_req, res) => {
    const registros = await prisma.registration.findMany({
        where: {
            estatusPago: "PAGADO",
            esPrueba: await modoPruebaActivo(),
            OR: [{ workshopsSeleccionados: { isEmpty: false } }, { workshopsOpenStyleSeleccionados: { isEmpty: false } }],
        },
        select: {
            id: true,
            nombres: true,
            apellidos: true,
            nombreArtistico: true,
            categoria: true,
            competidorId: true,
            telefono: true,
            correo: true,
            workshopsSeleccionados: true,
            workshopsOpenStyleSeleccionados: true,
            estadoAcceso: true,
        },
        orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
    });

    const workshops = registros.map((r) => ({
        ...r,
        tipo: r.categoria === "PUBLICO_GENERAL" ? ("PUBLICO" as const) : ("COMPETIDOR" as const),
        categoriaLabel: CATEGORIAS_LABEL[r.categoria],
    }));

    return res.json({ workshops });
});
