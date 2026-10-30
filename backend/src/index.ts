import "dotenv/config";
import express from 'express';
import cors from 'cors';
import cookieParser from "cookie-parser";
import { registrationsRouter } from "./routes/registrations";
import { stripeWebhookRouter } from "./routes/stripeWebhook";
import { accessRouter } from "./routes/access";
import { authRouter } from "./routes/auth";
import { adminsRouter } from "./routes/admins";
import { competenciaRouter } from "./routes/competencia";
import { pantallaRouter } from "./routes/pantalla";
import { vistaRegistrosRouter } from "./routes/vistaRegistros";
import { configuracionEventoRouter } from "./routes/configuracionEvento";
import { registrationsPruebaRouter } from "./routes/registrationsPrueba";
import { escenariosRouter } from "./routes/escenarios";
import { workshopsRouter } from "./routes/workshops";
import { origenesFrontendPermitidos } from "./lib/origenes";


// Colchón final: Express 5 ya atrapa sola las excepciones de los handlers de
// ruta (async que truenan) y las convierte en 500 sin tumbar el proceso, y el
// adapter de Prisma ya maneja los errores de conexión de Postgres — pero si
// algo truena FUERA del ciclo de una petición (poco probable, pero no
// imposible), antes esto cerraba el proceso sin dejar rastro. Se loguea y se
// sale con código de error para que Railway lo reinicie solo (restart policy
// por defecto), en vez de quedarse corriendo en un estado posiblemente
// corrupto.
process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason);
    process.exit(1);
});
process.on("uncaughtException", (error) => {
    console.error("[uncaughtException]", error);
    process.exit(1);
});

const app = express();

// Railway (y la mayoría de PaaS) ponen la app detrás de un reverse proxy que
// agrega X-Forwarded-For. Sin esto, express-rate-limit no puede identificar
// la IP real del cliente y lanza ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. Se
// confía solo en el primer proxy (el de Railway), no en toda la cadena.
app.set("trust proxy", 1);

// credentials:true es necesario para que la cookie de sesión de admin viaje
// en las peticiones del frontend (dominio distinto en producción).
const origenesPermitidos = origenesFrontendPermitidos();

app.use(
    cors({
        origin(origen, callback) {
            if (!origen || origenesPermitidos.includes(origen)) {
                return callback(null, true);
            }
            callback(new Error("Origen no permitido por CORS"));
        },
        credentials: true,
    }),
);
app.use("/api/webhooks/stripe", stripeWebhookRouter)
app.use(express.json());
app.use(cookieParser());
app.use("/api/registrations", registrationsRouter);
app.use("/api/registrations-prueba", registrationsPruebaRouter);
app.use("/api/configuracion-evento", configuracionEventoRouter);
app.use("/api/access", accessRouter);
app.use("/api/auth", authRouter);
app.use("/api/admins", adminsRouter);
app.use("/api/escenarios", escenariosRouter);
app.use("/api/competencia", competenciaRouter);
app.use("/api/workshops", workshopsRouter);
app.use("/api/pantalla", pantallaRouter);
app.use("/api/vista-registros", vistaRegistrosRouter);

app.get("/health", (_req, res) =>  {
    res.json({status: "ok"});
})

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`Servidor escuchando en puerto ${port}`)
});