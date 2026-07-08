import express, { Router } from "express";
import Stripe from "stripe";
import { stripe } from "../lib/stripe";
import { prisma } from "../lib/prisma";
import { randomUUID } from "node:crypto";

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
                await prisma.registration.update({
                    where: {id: registrationId},
                    data: {
                        estatusPago: "PAGADO",
                        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
                        qrToken: randomUUID(),
                    }
                })
            }
        }

        return res.json({received: true});

    }

)
