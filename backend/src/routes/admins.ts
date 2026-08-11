import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { requireRole } from "../middleware/requireAuth";
import { sinIndefinidos } from "../lib/utils";

const ROLES = ["SUPER_ADMIN", "STAFF_ACCESO", "STAFF_JUECEO"] as const;

const crearAdminSchema = z.object({
    nombre: z.string().trim().min(1),
    correo: z.string().trim().email(),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    rol: z.enum(ROLES),
});

const editarAdminSchema = z.object({
    nombre: z.string().trim().min(1).optional(),
    rol: z.enum(ROLES).optional(),
    activo: z.boolean().optional(),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").optional(),
});

export const adminsRouter = Router();

adminsRouter.use(requireRole("SUPER_ADMIN"));

adminsRouter.get("/", async (_req, res) => {
    const admins = await prisma.adminUser.findMany({
        select: { id: true, nombre: true, correo: true, rol: true, activo: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    });
    return res.json({ admins });
});

adminsRouter.post("/", async (req, res) => {
    const parsed = crearAdminSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const { nombre, correo, password, rol } = parsed.data;
    try {
        const admin = await prisma.adminUser.create({
            data: { nombre, correo, rol, passwordHash: await hashPassword(password) },
            select: { id: true, nombre: true, correo: true, rol: true, activo: true, createdAt: true },
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
            select: { id: true, nombre: true, correo: true, rol: true, activo: true, createdAt: true },
        });
        return res.json({ admin });
    } catch (error: any) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Cuenta no encontrada" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo actualizar la cuenta" });
    }
});
