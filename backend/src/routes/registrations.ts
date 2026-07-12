import { Router } from "express";
import { registrationSchema } from "../types/registration";
import {
    calcularPrecioTotal,
    tipoBoletoPorCategoria,
    CATEGORIAS_LABEL,
    PAQUETES_BASE_LABEL,
} from "../config/catalog";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { generarQrDataUrl } from "../lib/qr";


export const registrationsRouter = Router();

registrationsRouter.get("/by-session/:sessionId", async (req, res) => {
    const { sessionId } = req.params;

    const registration = await prisma.registration.findUnique({
        where: { stripeSessionId: sessionId },
        select: {
            nombreArtistico: true,
            tipoBoleto: true,
            categoria: true,
            competidorId: true,
            estatusPago: true,
            qrToken: true,
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
        competidorId: registration.competidorId,
        qrDataUrl,
    });
});

registrationsRouter.post("/", async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);

    if(!parsed.success){
        return res.status(400).json({
            errors: parsed.error.flatten()
        })
    }

    const data = parsed.data;
    const tipoBoleto = tipoBoletoPorCategoria(data.categoria);
    const precioMXNCentavos = calcularPrecioTotal(data.paqueteBase, data.workshopsSeleccionados);

    let registrationId: string;
    try{
        const registration = await prisma.registration.create({
            data: {
                nombres: data.nombres,
                apellidos: data.apellidos,
                nombreArtistico: data.nombreArtistico,
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
        const nombreProducto = `${PAQUETES_BASE_LABEL[data.paqueteBase]} — ${CATEGORIAS_LABEL[data.categoria]}`;
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