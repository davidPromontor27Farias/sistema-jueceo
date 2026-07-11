import express, { Router } from "express";
import Stripe from "stripe";
import { stripe } from "../lib/stripe";
import { prisma } from "../lib/prisma";
import { randomUUID } from "node:crypto";
import { PREFIJO_ID_POR_CATEGORIA, type Categoria } from "../config/catalog";

const MAX_INTENTOS_ID = 5;

// Asigna el ID fijo de competidor (ej. "BB-023") al confirmarse el pago.
// Si el correo ya tuvo un competidorId en un registro anterior (otro año), se
// reutiliza el mismo para que el ID se mantenga fijo entre ediciones.
async function confirmarPagoYAsignarCompetidorId(
    registrationId: string,
    correo: string,
    categoria: Categoria,
    paymentIntentId: string | null,
): Promise<void> {
    const registroPrevio = await prisma.registration.findFirst({
        where: { correo, competidorId: { not: null }, id: { not: registrationId } },
        select: { competidorId: true },
        orderBy: { createdAt: "asc" },
    });

    if (registroPrevio?.competidorId) {
        await prisma.registration.update({
            where: { id: registrationId },
            data: {
                estatusPago: "PAGADO",
                stripePaymentIntentId: paymentIntentId,
                qrToken: randomUUID(),
                competidorId: registroPrevio.competidorId,
            },
        });
        return;
    }

    const prefijo = PREFIJO_ID_POR_CATEGORIA[categoria];
    for (let intento = 0; intento < MAX_INTENTOS_ID; intento++) {
        const cantidadExistente = await prisma.registration.count({
            where: { competidorId: { startsWith: `${prefijo}-` } },
        });
        const competidorId = `${prefijo}-${String(cantidadExistente + 1 + intento).padStart(3, "0")}`;

        try {
            await prisma.registration.update({
                where: { id: registrationId },
                data: {
                    estatusPago: "PAGADO",
                    stripePaymentIntentId: paymentIntentId,
                    qrToken: randomUUID(),
                    competidorId,
                },
            });
            return;
        } catch (error: any) {
            // Otro webhook concurrente ya tomó ese competidorId; reintenta con el siguiente número.
            if (error.code === "P2002") continue;
            throw error;
        }
    }

    throw new Error(`No se pudo asignar competidorId para el prefijo ${prefijo} tras ${MAX_INTENTOS_ID} intentos`);
}

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
    "/",
    express.raw({type: "application/json"}),
    async (req, res) => {
        const signature = req.headers["stripe-signature"];
        if(!signature || !process.env.STRIPE_WEBHOOK_SECRET){
            return res.status(400).send("Falta firma o webhook secret");
        };


        let event: Stripe.Event;
        try{
            event = stripe.webhooks.constructEvent(
                req.body,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        }catch(error){
            console.error("Firma de webhook invalida:", error);
            return res.status(400).send("Firma invalida");
        };

        if(event.type === "checkout.session.completed"){
            const session = event.data.object as Stripe.Checkout.Session;
            const registrationId = session.metadata?.registrationId;
            if(!registrationId){
                console.error("Webhook sin registrationId en metadata");
                return res.status(400).send("Falta registrationId");
            };

            const registration = await prisma.registration.findUnique({
                where: {id: registrationId}
            });

            if(registration && registration.estatusPago !== "PAGADO"){
                const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
                await confirmarPagoYAsignarCompetidorId(registrationId, registration.correo, registration.categoria, paymentIntentId);
            }
        }

        return res.json({received: true});

    }

)
