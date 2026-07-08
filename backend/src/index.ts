import "dotenv/config";
import express from 'express';
import cors from 'cors';
import { registrationsRouter } from "./routes/registrations";
import { stripeWebhookRouter } from "./routes/stripeWebhook";
import { accessRouter } from "./routes/access";


const app = express();

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