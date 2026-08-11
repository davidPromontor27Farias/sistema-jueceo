import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { RolAdmin } from "../generated/prisma/client";

if (!process.env.JWT_SECRET) {
    throw new Error("Falta JWT_SECRET en las variables de entorno");
}
const JWT_SECRET = process.env.JWT_SECRET;

export const ADMIN_COOKIE_NAME = "admin_token";
const JWT_EXPIRACION = "12h";

export interface AdminTokenPayload {
    adminId: string;
    rol: RolAdmin;
}

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export function verificarPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export function firmarTokenAdmin(payload: AdminTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRACION });
}

export function verificarTokenAdmin(token: string): AdminTokenPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as AdminTokenPayload;
    } catch {
        return null;
    }
}
