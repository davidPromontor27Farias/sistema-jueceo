import { Router } from "express";
import { prisma } from "../lib/prisma";
import { accessVerifyLimiter } from "../lib/rateLimit";
import { requireRole } from "../middleware/requireAuth";
import { modoPruebaActivo } from "../lib/modoEvento";
import { CATEGORIAS_LABEL, ESTADO_ACCESO_LABEL, PAQUETES_BASE_LABEL } from "../config/catalog";
import type { EstadoAcceso, Registration, TipoEventoAcceso } from "../generated/prisma/client";

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
    estadoAcceso: true,
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
        estadoAcceso: registro.estadoAcceso,
        estadoAccesoLabel: ESTADO_ACCESO_LABEL[registro.estadoAcceso],
        // El enum de Prisma conserva PRUEBA_PAGO (deprecado, ver schema.prisma)
        // por registros de prueba viejos; no tiene label en el catálogo actual.
        paqueteBaseLabel:
            (PAQUETES_BASE_LABEL as Record<string, string>)[registro.paqueteBase] ?? registro.paqueteBase,
        academiaCrew: registro.academiaCrew,
        workshopsSeleccionados: registro.workshopsSeleccionados,
        agregarOpenStyle: registro.agregarOpenStyle,
    };
}

// Debajo de esta ventana, un nuevo evento del mismo QR se marca como posible
// duplicado (ej. QR clonado/compartido usado en dos puntos de acceso casi al
// mismo tiempo) pero NO se bloquea: el staff decide a criterio, solo se
// avisa fuerte en pantalla y queda registrado para poder investigarlo después.
const VENTANA_DUPLICADO_MS = 2 * 60 * 1000;

// Transición automática según el estado actual: un solo botón de "escanear"
// alterna entre entrar/salir sin que el staff tenga que elegir la acción.
const SIGUIENTE_ESTADO: Record<Exclude<EstadoAcceso, "BLOQUEADO">, EstadoAcceso> = {
    NO_USADO: "DENTRO",
    DENTRO: "FUERA_TEMPORAL",
    FUERA_TEMPORAL: "REINGRESO",
    REINGRESO: "FUERA_TEMPORAL",
};

const TIPO_EVENTO_POR_ESTADO_ANTERIOR: Record<Exclude<EstadoAcceso, "BLOQUEADO">, TipoEventoAcceso> = {
    NO_USADO: "ENTRADA",
    DENTRO: "SALIDA_TEMPORAL",
    FUERA_TEMPORAL: "REINGRESO",
    REINGRESO: "SALIDA_TEMPORAL",
};

accessRouter.post("/verify", accessVerifyLimiter, requireRole("STAFF_ACCESO", "SUPER_ADMIN"), async (req, res) => {
    const qrToken = typeof req.body?.qrToken === "string" ? req.body.qrToken.trim() : "";
    if (!qrToken) {
        return res.status(400).json({ error: "Falta qrToken" });
    }

    const registration = await prisma.registration.findUnique({
        where: { qrToken },
        select: { ...CAMPOS_STAFF, esPrueba: true },
    });

    if (!registration || registration.estatusPago !== "PAGADO") {
        return res.status(404).json({ ok: false, motivo: "QR_INVALIDO" });
    }
    // No se puede escanear un pase real durante un ensayo, ni uno de prueba
    // el día real — se trata como QR inválido, igual que si no existiera.
    if (registration.esPrueba !== (await modoPruebaActivo())) {
        return res.status(404).json({ ok: false, motivo: "QR_INVALIDO" });
    }

    if (registration.estadoAcceso === "BLOQUEADO") {
        await prisma.accesoEvento.create({
            data: {
                registrationId: registration.id,
                tipo: "INTENTO_BLOQUEADO",
                estadoAnterior: "BLOQUEADO",
                estadoNuevo: "BLOQUEADO",
                staffId: req.admin?.id ?? null,
            },
        });
        return res.status(409).json({ ok: false, motivo: "BLOQUEADO", ...aItemStaff(registration) });
    }

    const estadoAnterior = registration.estadoAcceso;
    const estadoNuevo = SIGUIENTE_ESTADO[estadoAnterior];
    const tipoEvento = TIPO_EVENTO_POR_ESTADO_ANTERIOR[estadoAnterior];

    const ultimoEvento = await prisma.accesoEvento.findFirst({
        where: { registrationId: registration.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
    });
    const ahora = new Date();
    const segundosDesdeUltimoEvento = ultimoEvento
        ? Math.round((ahora.getTime() - ultimoEvento.createdAt.getTime()) / 1000)
        : null;
    const posibleDuplicado = ultimoEvento !== null && ahora.getTime() - ultimoEvento.createdAt.getTime() < VENTANA_DUPLICADO_MS;

    // Concurrencia: solo aplica el cambio si el estado no cambió entre el
    // findUnique y este update (dos escaneos casi simultáneos del mismo QR).
    const actualizado = await prisma.registration.updateMany({
        where: { id: registration.id, estadoAcceso: estadoAnterior },
        data: {
            estadoAcceso: estadoNuevo,
            qrEscaneadoEn: registration.qrEscaneadoEn ?? ahora,
        },
    });

    if (actualizado.count === 0) {
        return res.status(409).json({ ok: false, motivo: "CONFLICTO", ...aItemStaff(registration) });
    }

    await prisma.accesoEvento.create({
        data: {
            registrationId: registration.id,
            tipo: tipoEvento,
            estadoAnterior,
            estadoNuevo,
            posibleDuplicado,
            segundosDesdeUltimoEvento,
            staffId: req.admin?.id ?? null,
        },
    });

    return res.json({
        ok: true,
        tipoEvento,
        posibleDuplicado,
        segundosDesdeUltimoEvento,
        ...aItemStaff({ ...registration, estadoAcceso: estadoNuevo }),
    });
});

// Bloquea o desbloquea un QR a mano desde la misma pantalla de escaneo (ej.
// reporte de fraude o mal comportamiento en el evento). Al desbloquear se
// restaura el estado que tenía justo antes del bloqueo (buscándolo en el
// log de AccesoEvento), no siempre "no usado".
accessRouter.post("/bloquear", requireRole("STAFF_ACCESO", "SUPER_ADMIN"), async (req, res) => {
    const qrToken = typeof req.body?.qrToken === "string" ? req.body.qrToken.trim() : "";
    const bloquear = req.body?.bloquear === true;
    if (!qrToken) {
        return res.status(400).json({ error: "Falta qrToken" });
    }

    const registration = await prisma.registration.findUnique({
        where: { qrToken },
        select: { ...CAMPOS_STAFF, esPrueba: true },
    });
    if (!registration) {
        return res.status(404).json({ error: "QR no encontrado" });
    }
    if (registration.esPrueba !== (await modoPruebaActivo())) {
        return res.status(404).json({ error: "QR no encontrado" });
    }

    if (bloquear) {
        if (registration.estadoAcceso === "BLOQUEADO") {
            return res.status(409).json({ error: "Ese QR ya está bloqueado" });
        }

        await prisma.$transaction([
            prisma.registration.update({ where: { id: registration.id }, data: { estadoAcceso: "BLOQUEADO" } }),
            prisma.accesoEvento.create({
                data: {
                    registrationId: registration.id,
                    tipo: "BLOQUEO",
                    estadoAnterior: registration.estadoAcceso,
                    estadoNuevo: "BLOQUEADO",
                    staffId: req.admin?.id ?? null,
                },
            }),
        ]);

        return res.json({ ok: true, ...aItemStaff({ ...registration, estadoAcceso: "BLOQUEADO" }) });
    }

    if (registration.estadoAcceso !== "BLOQUEADO") {
        return res.status(409).json({ error: "Ese QR no está bloqueado" });
    }

    const ultimoBloqueo = await prisma.accesoEvento.findFirst({
        where: { registrationId: registration.id, tipo: "BLOQUEO" },
        orderBy: { createdAt: "desc" },
        select: { estadoAnterior: true },
    });
    const estadoRestaurado: EstadoAcceso = ultimoBloqueo?.estadoAnterior ?? "NO_USADO";

    await prisma.$transaction([
        prisma.registration.update({ where: { id: registration.id }, data: { estadoAcceso: estadoRestaurado } }),
        prisma.accesoEvento.create({
            data: {
                registrationId: registration.id,
                tipo: "DESBLOQUEO",
                estadoAnterior: "BLOQUEADO",
                estadoNuevo: estadoRestaurado,
                staffId: req.admin?.id ?? null,
            },
        }),
    ]);

    return res.json({ ok: true, ...aItemStaff({ ...registration, estadoAcceso: estadoRestaurado }) });
});

// Historial de check-ins: quiénes tienen actividad de acceso (ya entraron,
// salieron a comer, reingresaron o están bloqueados), ordenado por el
// movimiento más reciente. Compartido entre todos los dispositivos/staff que
// estén escaneando en la entrada. Solo staff: trae el detalle completo del
// paquete/academia para que el admin vea quién va entrando sin escanear él mismo.
accessRouter.get("/historial", requireRole("STAFF_ACCESO", "SUPER_ADMIN"), async (_req, res) => {
    const registros = await prisma.registration.findMany({
        where: { estadoAcceso: { not: "NO_USADO" }, esPrueba: await modoPruebaActivo() },
        select: CAMPOS_STAFF,
        orderBy: { updatedAt: "desc" },
        take: 50,
    });

    return res.json({ historial: registros.map(aItemStaff) });
});
