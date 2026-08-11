import { Router } from "express";
import { prisma } from "../lib/prisma";
import { accessVerifyLimiter } from "../lib/rateLimit";
import { requireRole } from "../middleware/requireAuth";
import { CATEGORIAS_LABEL } from "../config/catalog";

export const accessRouter = Router();

const REGISTRO_SELECT = {
    id: true,
    nombres: true,
    apellidos: true,
    nombreArtistico: true,
    tipoBoleto: true,
    categoria: true,
    competidorId: true,
    fotoUrl: true,
    estatusPago: true,
    qrEscaneadoEn: true,
};

accessRouter.post("/verify", accessVerifyLimiter, requireRole("STAFF_ACCESO", "SUPER_ADMIN"), async (req, res) => {
    const qrToken = typeof req.body?.qrToken === "string" ? req.body.qrToken.trim() : "";
    if (!qrToken) {
        return res.status(400).json({ error: "Falta qrToken" });
    }

    const registration = await prisma.registration.findUnique({
        where: { qrToken },
        select: REGISTRO_SELECT,
    });

    if (!registration || registration.estatusPago !== "PAGADO") {
        return res.status(404).json({ ok: false, motivo: "QR_INVALIDO" });
    }

    if (registration.qrEscaneadoEn) {
        return res.status(409).json({
            ok: false,
            motivo: "YA_USADO",
            escaneadoEn: registration.qrEscaneadoEn,
            nombres: registration.nombres,
            apellidos: registration.apellidos,
            nombreArtistico: registration.nombreArtistico,
            tipoBoleto: registration.tipoBoleto,
            categoriaLabel: CATEGORIAS_LABEL[registration.categoria],
            competidorId: registration.competidorId,
            fotoUrl: registration.fotoUrl,
        });
    }

    const actualizado = await prisma.registration.updateMany({
        where: { id: registration.id, qrEscaneadoEn: null },
        data: { qrEscaneadoEn: new Date() },
    });

    if (actualizado.count === 0) {
        return res.status(409).json({ ok: false, motivo: "YA_USADO" });
    }

    return res.json({
        ok: true,
        nombres: registration.nombres,
        apellidos: registration.apellidos,
        nombreArtistico: registration.nombreArtistico,
        tipoBoleto: registration.tipoBoleto,
        categoriaLabel: CATEGORIAS_LABEL[registration.categoria],
        competidorId: registration.competidorId,
        fotoUrl: registration.fotoUrl,
    });
});

// Historial de check-ins: reutiliza qrEscaneadoEn (ya es el timestamp de uso
// del QR, de un solo uso) en vez de una tabla aparte. Compartido entre todos
// los dispositivos/staff que estén escaneando en la entrada.
accessRouter.get("/historial", requireRole("STAFF_ACCESO", "SUPER_ADMIN"), async (_req, res) => {
    const registros = await prisma.registration.findMany({
        where: { qrEscaneadoEn: { not: null } },
        select: REGISTRO_SELECT,
        orderBy: { qrEscaneadoEn: "desc" },
        take: 50,
    });

    const historial = registros.map((registro) => ({
        id: registro.id,
        nombres: registro.nombres,
        apellidos: registro.apellidos,
        nombreArtistico: registro.nombreArtistico,
        tipoBoleto: registro.tipoBoleto,
        categoriaLabel: CATEGORIAS_LABEL[registro.categoria],
        competidorId: registro.competidorId,
        fotoUrl: registro.fotoUrl,
        qrEscaneadoEn: registro.qrEscaneadoEn,
    }));

    return res.json({ historial });
});
