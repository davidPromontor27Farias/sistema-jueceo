import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/requireAuth";
import { sinIndefinidos } from "../lib/utils";
import { CATEGORIAS_LABEL, type Categoria } from "../config/catalog";

const TODAS_LAS_CATEGORIAS = Object.keys(CATEGORIAS_LABEL) as Categoria[];
const CATEGORIAS_ENUM = TODAS_LAS_CATEGORIAS as [Categoria, ...Categoria[]];

const ESTATUS_COMPETENCIA = ["NO_INICIADA", "EN_CURSO", "FINALIZADA"] as const;
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

const COMPETIDOR_SELECT = {
    select: { id: true, nombreArtistico: true, nombres: true, apellidos: true, competidorId: true },
};

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

        const estado = await prisma.estadoCategoria.upsert({
            where: { categoria },
            create: { categoria, estatus: parsed.data.estatus },
            update: { estatus: parsed.data.estatus },
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

    return res.json({ enfrentamientos });
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
        return res.json({ enfrentamiento });
    } catch (error: any) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Enfrentamiento no encontrado" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo actualizar el enfrentamiento" });
    }
});
