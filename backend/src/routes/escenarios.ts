import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/requireAuth";
import { sinIndefinidos } from "../lib/utils";

const crearEscenarioSchema = z.object({
    nombre: z.string().trim().min(1),
    orden: z.number().int().default(0),
    activo: z.boolean().default(true),
});

const editarEscenarioSchema = z.object({
    nombre: z.string().trim().min(1).optional(),
    orden: z.number().int().optional(),
    activo: z.boolean().optional(),
});

export const escenariosRouter = Router();

escenariosRouter.get("/", requireRole("SUPER_ADMIN", "STAFF_JUECEO"), async (_req, res) => {
    const escenarios = await prisma.escenario.findMany({ orderBy: { orden: "asc" } });
    return res.json({ escenarios });
});

escenariosRouter.post("/", requireRole("SUPER_ADMIN"), async (req, res) => {
    const parsed = crearEscenarioSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    try {
        const escenario = await prisma.escenario.create({ data: parsed.data });
        return res.status(201).json({ escenario });
    } catch (error: any) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Ya existe un escenario con ese nombre" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo crear el escenario" });
    }
});

escenariosRouter.patch("/:id", requireRole("SUPER_ADMIN"), async (req, res) => {
    const { id } = req.params;
    if (typeof id !== "string") {
        return res.status(400).json({ error: "Falta id" });
    }

    const parsed = editarEscenarioSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    try {
        const escenario = await prisma.escenario.update({
            where: { id },
            data: sinIndefinidos(parsed.data),
        });
        return res.json({ escenario });
    } catch (error: any) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Escenario no encontrado" });
        }
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Ya existe un escenario con ese nombre" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo actualizar el escenario" });
    }
});
