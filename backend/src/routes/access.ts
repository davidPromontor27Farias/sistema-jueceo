import { Router } from "express";
import { prisma } from "../lib/prisma";
import { accessVerifyLimiter } from "../lib/rateLimit";
import { requireRole } from "../middleware/requireAuth";
import { CATEGORIAS_LABEL, PAQUETES_BASE_LABEL } from "../config/catalog";
import type { Registration } from "../generated/prisma/client";

export const accessRouter = Router();

// Datos de staff (check-in y su historial en /admin/acceso): paquete
// contratado, academia/crew y extras. Todo este router requiere sesión de
// STAFF_ACCESO o SUPER_ADMIN — quién entra al evento no se expone en ningún
// endpoint público.
const CAMPOS_STAFF = {
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
    paqueteBase: true,
    academiaCrew: true,
    workshopsSeleccionados: true,
    agregarOpenStyle: true,
};

type RegistroStaff = Pick<Registration, keyof typeof CAMPOS_STAFF>;

function aItemStaff(registro: RegistroStaff) {
    return {
        id: registro.id,
        nombres: registro.nombres,
        apellidos: registro.apellidos,
        nombreArtistico: registro.nombreArtistico,
        tipoBoleto: registro.tipoBoleto,
        categoriaLabel: CATEGORIAS_LABEL[registro.categoria],
        competidorId: registro.competidorId,
        fotoUrl: registro.fotoUrl,
        qrEscaneadoEn: registro.qrEscaneadoEn,
        // El enum de Prisma conserva PRUEBA_PAGO (deprecado, ver schema.prisma)
        // por registros de prueba viejos; no tiene label en el catálogo actual.
        paqueteBaseLabel:
            (PAQUETES_BASE_LABEL as Record<string, string>)[registro.paqueteBase] ?? registro.paqueteBase,
        academiaCrew: registro.academiaCrew,
        workshopsSeleccionados: registro.workshopsSeleccionados,
        agregarOpenStyle: registro.agregarOpenStyle,
    };
}

accessRouter.post("/verify", accessVerifyLimiter, requireRole("STAFF_ACCESO", "SUPER_ADMIN"), async (req, res) => {
    const qrToken = typeof req.body?.qrToken === "string" ? req.body.qrToken.trim() : "";
    if (!qrToken) {
        return res.status(400).json({ error: "Falta qrToken" });
    }

    const registration = await prisma.registration.findUnique({
        where: { qrToken },
        select: CAMPOS_STAFF,
    });

    if (!registration || registration.estatusPago !== "PAGADO") {
        return res.status(404).json({ ok: false, motivo: "QR_INVALIDO" });
    }

    if (registration.qrEscaneadoEn) {
        return res.status(409).json({
            ok: false,
            motivo: "YA_USADO",
            escaneadoEn: registration.qrEscaneadoEn,
            ...aItemStaff(registration),
        });
    }

    const actualizado = await prisma.registration.updateMany({
        where: { id: registration.id, qrEscaneadoEn: null },
        data: { qrEscaneadoEn: new Date() },
    });

    if (actualizado.count === 0) {
        return res.status(409).json({ ok: false, motivo: "YA_USADO" });
    }

    return res.json({ ok: true, ...aItemStaff(registration) });
});

// Historial de check-ins: reutiliza qrEscaneadoEn (ya es el timestamp de uso
// del QR, de un solo uso) en vez de una tabla aparte. Compartido entre todos
// los dispositivos/staff que estén escaneando en la entrada. Solo staff: trae
// el detalle completo del paquete/academia para que el admin vea quién va
// entrando sin tener que escanear él mismo.
accessRouter.get("/historial", requireRole("STAFF_ACCESO", "SUPER_ADMIN"), async (_req, res) => {
    const registros = await prisma.registration.findMany({
        where: { qrEscaneadoEn: { not: null } },
        select: CAMPOS_STAFF,
        orderBy: { qrEscaneadoEn: "desc" },
        take: 50,
    });

    return res.json({ historial: registros.map(aItemStaff) });
});
