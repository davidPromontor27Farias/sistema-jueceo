import { Router } from "express";
import { prisma } from "../lib/prisma";
import { accessVerifyLimiter } from "../lib/rateLimit";
import { requireRole } from "../middleware/requireAuth";

export const accessRouter = Router();

accessRouter.post("/verify", accessVerifyLimiter, requireRole("STAFF_ACCESO", "SUPER_ADMIN"), async (req, res) => {
    const qrToken = typeof req.body?.qrToken === "string" ? req.body.qrToken.trim() : "";
    if (!qrToken) {
        return res.status(400).json({ error: "Falta qrToken" });
    }

    const registration = await prisma.registration.findUnique({
        where: { qrToken },
        select: {
            id: true,
            nombres: true,
            apellidos: true,
            nombreArtistico: true,
            tipoBoleto: true,
            estatusPago: true,
            qrEscaneadoEn: true,
        },
    });

    if (!registration || registration.estatusPago !== "PAGADO") {
        return res.status(404).json({ ok: false, motivo: "QR_INVALIDO" });
    }

    if (registration.qrEscaneadoEn) {
        return res.status(409).json({
            ok: false,
            motivo: "YA_USADO",
            escaneadoEn: registration.qrEscaneadoEn,
            nombreArtistico: registration.nombreArtistico,
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
    });
});
