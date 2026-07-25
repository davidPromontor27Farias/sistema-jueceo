import "dotenv/config";
import express from 'express';
import cors from 'cors';
import { registrationsRouter } from "./routes/registrations";
import { stripeWebhookRouter } from "./routes/stripeWebhook";
import { accessRouter } from "./routes/access";


const app = express();

// Railway (y la mayoría de PaaS) ponen la app detrás de un reverse proxy que
// agrega X-Forwarded-For. Sin esto, express-rate-limit no puede identificar
// la IP real del cliente y lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. Se
// confía solo en el primer proxy (el de Railway), no en toda la cadena.
app.set("trust proxy", 1);

app.use(cors({origin: process.env.FRONTEND_URL}));
app.use("/api/webhooks/stripe", stripeWebhookRouter)
app.use(express.json());
app.use("/api/registrations", registrationsRouter);
app.use("/api/access", accessRouter);

app.get("/health", (_req, res) =>  {
    res.json({status: "ok"});
})

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`Servidor escuchando en puerto ${port}`)
});