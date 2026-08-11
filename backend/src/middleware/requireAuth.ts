import type { NextFunction, Request, Response } from "express";
import { ADMIN_COOKIE_NAME, verificarTokenAdmin } from "../lib/auth";
import { prisma } from "../lib/prisma";
import type { RolAdmin } from "../generated/prisma/client";

declare global {
    namespace Express {
        interface Request {
            admin?: { id: string; nombre: string; correo: string; rol: RolAdmin };
        }
    }
}

// Exige una sesión de admin válida (cookie httpOnly con JWT) y, si se pasan
// roles, que el admin tenga alguno de esos roles. Siempre revalida contra la
// base (no solo el JWT) para que desactivar a un admin lo bloquee de inmediato
// aunque su token todavía no haya expirado.
export function requireRole(...rolesPermitidos: RolAdmin[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const token = req.cookies?.[ADMIN_COOKIE_NAME];
        if (typeof token !== "string") {
            return res.status(401).json({ error: "No autenticado" });
        }

        const payload = verificarTokenAdmin(token);
        if (!payload) {
            return res.status(401).json({ error: "Sesión inválida o expirada" });
        }

        const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminId } });
        if (!admin || !admin.activo) {
            return res.status(401).json({ error: "Sesión inválida o expirada" });
        }

        if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(admin.rol)) {
            return res.status(403).json({ error: "No tienes permiso para esta acción" });
        }

        req.admin = { id: admin.id, nombre: admin.nombre, correo: admin.correo, rol: admin.rol };
        next();
    };
}
