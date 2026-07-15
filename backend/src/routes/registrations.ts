import { Router } from "express";
import { registrationSchema } from "../types/registration";
import {
    calcularPrecioTotal,
    tipoBoletoPorCategoria,
    preventaVigentePorFecha,
    PAQUETES_CON_PREVENTA,
    PREVENTA_CUPO_MAXIMO,
    CATEGORIAS_LABEL,
    PAQUETES_BASE_LABEL,
} from "../config/catalog";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { generarQrDataUrl } from "../lib/qr";
import { registrationCreateLimiter, registrationStatusLimiter } from "../lib/rateLimit";

// La preventa Fundadores está vigente si estamos dentro de la ventana de fechas
// Y aún quedan lugares entre los primeros PREVENTA_CUPO_MAXIMO (contando solo
// registros con pago confirmado en los paquetes que aplican).
async function calcularPreventaActiva(): Promise<boolean> {
    if (!preventaVigentePorFecha()) return false;

    const inscritosPreventa = await prisma.registration.count({
        where: {
            paqueteBase: { in: PAQUETES_CON_PREVENTA },
            estatusPago: "PAGADO",
        },
    });

    return inscritosPreventa < PREVENTA_CUPO_MAXIMO;
}


export const registrationsRouter = Router();

registrationsRouter.get("/by-session/:sessionId", registrationStatusLimiter, async (req, res) => {
    const { sessionId } = req.params;
    if (typeof sessionId !== "string") {
        return res.status(400).json({ error: "Falta sessionId" });
    }

    const registration = await prisma.registration.findUnique({
        where: { stripeSessionId: sessionId },
        select: {
            nombreArtistico: true,
            tipoBoleto: true,
            categoria: true,
            competidorId: true,
            estatusPago: true,
            qrToken: true,
            fotoUrl: true,
        },
    });

    if (!registration) {
        return res.status(404).json({ error: "Registro no encontrado" });
    }

    if (registration.estatusPago !== "PAGADO" || !registration.qrToken) {
        return res.json({ estatusPago: registration.estatusPago });
    }

    const qrDataUrl = await generarQrDataUrl(registration.qrToken);

    return res.json({
        estatusPago: registration.estatusPago,
        nombreArtistico: registration.nombreArtistico,
        tipoBoleto: registration.tipoBoleto,
        categoria: registration.categoria,
        categoriaLabel: CATEGORIAS_LABEL[registration.categoria],
        fotoUrl: registration.fotoUrl,
        competidorId: registration.competidorId,
        qrDataUrl,
    });
});

registrationsRouter.post("/", registrationCreateLimiter, async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);

    if(!parsed.success){
        return res.status(400).json({
            errors: parsed.error.flatten()
        })
    }

    const data = parsed.data;
    const tipoBoleto = tipoBoletoPorCategoria(data.categoria);
    // Público en general no captura Bboy/Bgirl name; usamos su nombre completo como respaldo.
    const nombreArtistico = data.nombreArtistico || `${data.nombres} ${data.apellidos}`.trim();
    const preventaActiva = await calcularPreventaActiva();
    const precioMXNCentavos = calcularPrecioTotal(data.paqueteBase, data.workshopsSeleccionados, {
        agregarOpenStyle: data.agregarOpenStyle,
        preventaActiva,
    });

    let registrationId: string;
    try{
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
                precioMXNCentavos,
            },
        });
        registrationId = registration.id;
    }catch(error: any){
        if(error.code === 'P2002'){
            return res.status(409).json({error: "Ese correo ya esta registrado"})
        };

        console.error(error);
        return res.status(500).json({error: "No se puedo crear el registro"});
    }

    try{
        const nombreProducto = `${PAQUETES_BASE_LABEL[data.paqueteBase]} — ${CATEGORIAS_LABEL[data.categoria]}${data.agregarOpenStyle ? " + Open Style 1 vs 1" : ""}`;
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer_email: data.correo,
            line_items: [
                {
                    price_data: {
                        currency: "mxn",
                        unit_amount: precioMXNCentavos,
                        product_data: {
                            name: nombreProducto,
                        },
                    },
                    quantity: 1,
                }
            ],
            metadata: {registrationId},
            success_url: `${process.env.FRONTEND_URL}/registro/exito?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/registro/cancelado`,
        });

        await prisma.registration.update({
            where: {id: registrationId},
            data: {stripeSessionId: session.id},
        });

        return res.status(201).json({checkoutUrl: session.url})
    } catch(error){
        console.error(error);
        await prisma.registration.delete({where: {id: registrationId}});
        return res.status(502).json({error: 'No se pudo iniciar el pago, intenta de nuevo'});
    }
})