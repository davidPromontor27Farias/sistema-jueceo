import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/requireAuth";
import { sinIndefinidos } from "../lib/utils";
import { CATEGORIAS_LABEL, type Categoria } from "../config/catalog";

const CATEGORIAS_ENUM = Object.keys(CATEGORIAS_LABEL) as [Categoria, ...Categoria[]];
const VISTAS = ["APAGADA", "BRACKETS", "RESULTADOS", "ENFRENTAMIENTOS", "GANADORES", "ACCESOS"] as const;

const patchPantallaSchema = z.object({
    vista: z.enum(VISTAS),
    categoriaEnfocada: z.enum(CATEGORIAS_ENUM).nullable().optional(),
});

export const pantallaRouter = Router();

// Público: la pantalla del venue hace poll de esto sin autenticarse.
pantallaRouter.get("/", async (_req, res) => {
    const estado = await prisma.pantallaEstado.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
    });
    return res.json({ estado });
});

pantallaRouter.patch("/", requireRole("SUPER_ADMIN"), async (req, res) => {
    const parsed = patchPantallaSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const datos = sinIndefinidos(parsed.data);
    const estado = await prisma.pantallaEstado.upsert({
        where: { id: 1 },
        create: { id: 1, ...datos },
        update: datos,
    });

    return res.json({ estado });
});
