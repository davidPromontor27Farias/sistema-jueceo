import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ADMIN_COOKIE_NAME, firmarTokenAdmin, verificarPassword } from "../lib/auth";
import { adminLoginLimiter } from "../lib/rateLimit";
import { requireRole } from "../middleware/requireAuth";

const loginSchema = z.object({
    correo: z.string().trim().email(),
    password: z.string().min(1),
});

// En producción el frontend y el backend viven en dominios distintos de
// Railway (cross-site de verdad), así que la cookie necesita SameSite=None +
// Secure. En desarrollo local ambos son "localhost" (mismo site, distinto
// puerto), donde SameSite=Lax + Secure=false sí viaja en fetch con credentials.
const esProduccion = process.env.NODE_ENV === "production";
const COOKIE_OPTS = {
    httpOnly: true,
    secure: esProduccion,
    sameSite: (esProduccion ? "none" : "lax") as "none" | "lax",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
};

export const authRouter = Router();

authRouter.post("/login", adminLoginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Correo o contraseña inválidos" });
    }

    const { correo, password } = parsed.data;
    const admin = await prisma.adminUser.findUnique({ where: { correo } });

    if (!admin || !admin.activo || !(await verificarPassword(password, admin.passwordHash))) {
        return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }

    const token = firmarTokenAdmin({ adminId: admin.id, rol: admin.rol });
    res.cookie(ADMIN_COOKIE_NAME, token, COOKIE_OPTS);

    return res.json({
        admin: { id: admin.id, nombre: admin.nombre, correo: admin.correo, rol: admin.rol },
    });
});

authRouter.post("/logout", (_req, res) => {
    res.clearCookie(ADMIN_COOKIE_NAME, { ...COOKIE_OPTS, maxAge: undefined });
    return res.json({ ok: true });
});

authRouter.get("/me", requireRole(), (req, res) => {
    return res.json({ admin: req.admin });
});
