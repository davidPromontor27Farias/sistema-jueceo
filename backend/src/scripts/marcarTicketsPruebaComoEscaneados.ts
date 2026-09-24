// Script de SOLO uso local: marca los 100 registros de prueba (los del
// manifest.csv generado por generarRegistrosPrueba.ts) como si ya hubieran
// entrado al evento, con horarios escalonados la mañana del día 1
// (2026-10-31), para probar el historial de accesos con datos realistas.
// Se niega a correr si DATABASE_URL no apunta a localhost.
//
// Uso: npx ts-node src/scripts/marcarTicketsPruebaComoEscaneados.ts
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { prisma } from "../lib/prisma";

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
    console.error("DATABASE_URL no apunta a localhost — este script es solo para la base local. Abortando.");
    process.exit(1);
}

const MANIFEST = path.join(__dirname, "..", "..", "tickets-prueba", "manifest.csv");
const INICIO_CHECKIN = new Date("2026-10-31T10:00:00-06:00");
const MINUTOS_ENTRE_ESCANEOS = 2;

function leerQrTokens(): string[] {
    const contenido = fs.readFileSync(MANIFEST, "utf-8");
    const [encabezado, ...filas] = contenido.trim().split("\n");
    if (!encabezado) throw new Error("manifest.csv está vacío");
    const columnas = encabezado.split(",");
    const indiceQr = columnas.indexOf("qrToken");
    if (indiceQr === -1) throw new Error("manifest.csv no tiene columna qrToken");

    return filas.map((fila) => {
        const valor = fila.split(",")[indiceQr];
        if (!valor) throw new Error(`Fila sin qrToken: ${fila}`);
        return valor;
    });
}

async function main() {
    if (!fs.existsSync(MANIFEST)) {
        console.error(`No se encontró ${MANIFEST}. Corre primero "npm run generar-registros-prueba".`);
        process.exit(1);
    }

    const qrTokens = leerQrTokens();
    let actualizados = 0;

    for (let i = 0; i < qrTokens.length; i++) {
        const qrToken = qrTokens[i];
        if (!qrToken) continue;
        const escaneadoEn = new Date(INICIO_CHECKIN.getTime() + i * MINUTOS_ENTRE_ESCANEOS * 60_000);
        const resultado = await prisma.registration.updateMany({
            where: { qrToken },
            data: { qrEscaneadoEn: escaneadoEn, estadoAcceso: "DENTRO" },
        });
        actualizados += resultado.count;
    }

    console.log(
        `Listo: ${actualizados} de ${qrTokens.length} tickets de prueba marcados como escaneados, ` +
            `desde ${INICIO_CHECKIN.toLocaleString("es-MX")}.`,
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
