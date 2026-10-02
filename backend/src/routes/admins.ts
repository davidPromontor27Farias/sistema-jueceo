import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { requireRole } from "../middleware/requireAuth";
import { sinIndefinidos } from "../lib/utils";
import { reintentarResolucionesPendientes, reintentarRepechajesPendientes } from "./competencia";

// STAFF_JUECEO no se ofrece para crear/editar cuentas: el SUPER_ADMIN ya
// tiene ese acceso incluido, así que no hace falta ese rol por separado. Se
// deja fuera de esta lista (no del enum de Prisma) para no tener que migrar
// nada si algún día vuelve a hacer falta.
const ROLES = ["SUPER_ADMIN", "STAFF_ACCESO", "JUEZ"] as const;

const crearAdminSchema = z.object({
    nombre: z.string().trim().min(1),
    correo: z.string().trim().email(),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    rol: z.enum(ROLES),
    // Solo tiene efecto para rol JUEZ (ver AdminUser.escenarioId en el schema).
    escenarioId: z.string().uuid().nullable().optional(),
});

const editarAdminSchema = z.object({
    nombre: z.string().trim().min(1).optional(),
    rol: z.enum(ROLES).optional(),
    activo: z.boolean().optional(),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
    escenarioId: z.string().uuid().nullable().optional(),
});

export const adminsRouter = Router();

adminsRouter.use(requireRole("SUPER_ADMIN"));

const ADMIN_SELECT = {
    id: true,
    nombre: true,
    correo: true,
    rol: true,
    activo: true,
    createdAt: true,
    escenarioId: true,
    escenario: { select: { id: true, nombre: true } },
} as const;

adminsRouter.get("/", async (_req, res) => {
    const admins = await prisma.adminUser.findMany({
        select: ADMIN_SELECT,
        orderBy: { createdAt: "asc" },
    });
    return res.json({ admins });
});

adminsRouter.post("/", async (req, res) => {
    const parsed = crearAdminSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const { nombre, correo, password, rol, escenarioId } = parsed.data;
    try {
        const admin = await prisma.adminUser.create({
            data: { nombre, correo, rol, passwordHash: await hashPassword(password), escenarioId: escenarioId ?? null },
            select: ADMIN_SELECT,
        });
        return res.status(201).json({ admin });
    } catch (error: any) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Ese correo ya tiene una cuenta" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo crear la cuenta" });
    }
});

adminsRouter.patch("/:id", async (req, res) => {
    const parsed = editarAdminSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const { id } = req.params;
    const { password, ...resto } = parsed.data;

    if (resto.activo === false && id === req.admin?.id) {
        return res.status(400).json({ error: "No puedes desactivar tu propia cuenta" });
    }

    try {
        const admin = await prisma.adminUser.update({
            where: { id },
            data: sinIndefinidos({ ...resto, passwordHash: password ? await hashPassword(password) : undefined }),
            select: ADMIN_SELECT,
        });

        // Si se (des)activó a un JUEZ, el número de jueces activos cambió: una
        // batalla que se quedó esperando una calificación de más (o de menos)
        // puede que ya esté completa con el conteo nuevo. Sin esto se queda
        // congelada en EN_CURSO para siempre, porque nada vuelve a revisarla
        // hasta que alguien califique de nuevo — y para entonces ya nadie va a
        // calificarla otra vez.
        if (admin.rol === "JUEZ" && resto.activo !== undefined) {
            await reintentarResolucionesPendientes();
            await reintentarRepechajesPendientes();
        }

        return res.json({ admin });
    } catch (error: any) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Cuenta no encontrada" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo actualizar la cuenta" });
    }
});

// Borrado físico de una cuenta. Solo es posible si la cuenta nunca dejó
// huella en el sistema (ningún CalificacionJuez, PuntuacionPreseleccion o
// AccesoEvento como staff) — esas tablas tienen la FK en modo RESTRICT a
// propósito, para no perder el historial de quién calificó o escaneó qué. Si
// la cuenta ya tiene actividad, se bloquea con un mensaje claro: para ese
// caso la vía correcta es desactivarla (PATCH activo:false), no borrarla.
adminsRouter.delete("/:id", async (req, res) => {
    const { id } = req.params;
    if (typeof id !== "string") {
        return res.status(400).json({ error: "Falta id" });
    }

    if (id === req.admin?.id) {
        return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
    }

    try {
        await prisma.adminUser.delete({ where: { id } });
        return res.json({ ok: true });
    } catch (error: any) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Cuenta no encontrada" });
        }
        if (error.code === "P2003") {
            return res.status(409).json({
                error:
                    "Esta cuenta ya tiene actividad registrada (calificaciones o escaneos de acceso) y no se puede eliminar sin perder ese historial. Desactívala en vez de eliminarla.",
            });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo eliminar la cuenta" });
    }
});
