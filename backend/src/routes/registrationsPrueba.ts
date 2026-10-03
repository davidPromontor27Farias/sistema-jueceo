import { Router } from "express";
import { randomUUID } from "node:crypto";
import { registrationSchema } from "../types/registration";
import { CATEGORIAS_LABEL, PREFIJO_ID_COMPETIDOR_PRUEBA, tipoBoletoPorCategoria } from "../config/catalog";
import { prisma } from "../lib/prisma";
import { generarQrDataUrl } from "../lib/qr";
import { registrationPruebaCreateLimiter } from "../lib/rateLimit";

const MAX_INTENTOS_ID = 5;

export const registrationsPruebaRouter = Router();

// Asigna un folio propio del Evento de Prueba (ej. "PRB-005"), scoped a
// esPrueba: true — nunca choca con los folios reales "THB-" (contador
// independiente). Sin el mapa de IDs fijos ni la reutilización entre
// ediciones de confirmarPagoYAsignarCompetidorId (backend/src/routes/stripeWebhook.ts):
// esas son reglas del evento real, no aplican a un ensayo.
async function asignarCompetidorIdPrueba(registrationId: string): Promise<string> {
    for (let intento = 0; intento < MAX_INTENTOS_ID; intento++) {
        const cantidadExistente = await prisma.registration.count({
            where: { esPrueba: true, competidorId: { startsWith: `${PREFIJO_ID_COMPETIDOR_PRUEBA}-` } },
        });
        const competidorId = `${PREFIJO_ID_COMPETIDOR_PRUEBA}-${String(cantidadExistente + 1 + intento).padStart(3, "0")}`;

        try {
            await prisma.registration.update({ where: { id: registrationId }, data: { competidorId } });
            return competidorId;
        } catch (error: any) {
            if (error.code === "P2002") continue;
            throw error;
        }
    }

    throw new Error(`No se pudo asignar competidorId de prueba tras ${MAX_INTENTOS_ID} intentos`);
}

// Registro del Evento de Prueba: mismos campos y validaciones que el
// formulario real (registrationSchema, sin nada específico de Stripe), pero
// sin pasarela de pago — se crea el registro directo, ya listo para que el
// resto del sistema (Preselección, Jueceo, Brackets, Pantalla, Control de
// Accesos) lo trate exactamente igual que uno real ya pagado, mientras el
// modo prueba esté activo (ver backend/src/lib/modoEvento.ts).
registrationsPruebaRouter.post("/", registrationPruebaCreateLimiter, async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ errors: parsed.error.flatten() });
    }

    const data = parsed.data;
    const tipoBoleto = tipoBoletoPorCategoria(data.categoria);
    // Público en general no captura Bboy/Bgirl name; usamos su nombre completo como respaldo.
    const nombreArtistico = data.nombreArtistico || `${data.nombres} ${data.apellidos}`.trim();

    let registrationId: string;
    try {
        const registration = await prisma.registration.create({
            data: {
                nombres: data.nombres,
                apellidos: data.apellidos,
                nombreArtistico,
                fechaNacimiento: data.fechaNacimiento,
                categoria: data.categoria,
                sexo: data.sexo,
                nacionalidad: data.nacionalidad,
                estado: data.estado,
                ciudad: data.ciudad,
                correo: data.correo,
                telefono: data.telefono,
                instagram: data.instagram ?? null,
                academiaCrew: data.academiaCrew ?? null,
                contactoEmergencia: data.contactoEmergencia ?? null,
                fotoUrl: data.fotoUrl ?? null,
                aceptaReglamento: data.aceptaReglamento,
                aceptaAvisoPrivacidad: data.aceptaAvisoPrivacidad,
                aceptaUsoImagen: data.aceptaAvisoPrivacidad,
                aceptaPoliticaCancelacion: data.aceptaPoliticaCancelacion,
                tipoBoleto,
                paqueteBase: data.paqueteBase,
                workshopsSeleccionados: data.workshopsSeleccionados,
                agregarOpenStyle: data.agregarOpenStyle,
                precioMXNCentavos: 0,
                esPrueba: true,
                estatusPago: "PAGADO",
                qrToken: randomUUID(),
            },
        });
        registrationId = registration.id;
    } catch (error: any) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Ese correo ya está registrado en el Evento de Prueba" });
        }
        console.error(error);
        return res.status(500).json({ error: "No se pudo crear el registro" });
    }

    const competidorId = await asignarCompetidorIdPrueba(registrationId);
    const registro = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    const qrDataUrl = await generarQrDataUrl(registro.qrToken!);

    return res.status(201).json({
        nombreArtistico: registro.nombreArtistico,
        nombreCompleto: `${registro.nombres} ${registro.apellidos}`,
        categoriaLabel: CATEGORIAS_LABEL[registro.categoria],
        tipoBoleto: registro.tipoBoleto,
        competidorId,
        qrDataUrl,
        fotoUrl: registro.fotoUrl,
    });
});
