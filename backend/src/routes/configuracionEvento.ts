import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireRole } from "../middleware/requireAuth";

const patchConfiguracionSchema = z.object({ modoPrueba: z.boolean() });

export const configuracionEventoRouter = Router();

// Público: lo consumen tanto el panel de admin (franja de aviso) como las
// pantallas públicas (/pantalla, /pantalla/tablero), igual criterio que
// /api/competencia/categorias.
configuracionEventoRouter.get("/", async (_req, res) => {
    const config = await prisma.configuracionEvento.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
    });
    return res.json({ modoPrueba: config.modoPrueba });
});

// Solo SUPER_ADMIN: es el interruptor global que decide si Preselección,
// Jueceo, Brackets, Pantalla, Tablero y Control de Accesos operan sobre los
// registros del Evento de Prueba o sobre los reales — ver
// backend/src/lib/modoEvento.ts.
configuracionEventoRouter.patch("/", requireRole("SUPER_ADMIN"), async (req, res) => {
    const parsed = patchConfiguracionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const config = await prisma.configuracionEvento.upsert({
        where: { id: 1 },
        create: { id: 1, modoPrueba: parsed.data.modoPrueba },
        update: { modoPrueba: parsed.data.modoPrueba },
    });

    return res.json({ modoPrueba: config.modoPrueba });
});
