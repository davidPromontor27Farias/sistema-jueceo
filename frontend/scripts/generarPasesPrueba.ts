// Script de SOLO uso local: genera el PDF del pase oficial (mismo diseño que
// descarga el usuario real) para cada registro de backend/tickets-prueba/
// (creados con backend/src/scripts/generarRegistrosPrueba.ts). Sin fotos.
//
// Uso (parado en frontend/): npx tsx scripts/generarPasesPrueba.ts
import fs from "node:fs";
import path from "node:path";
import ReactPDF from "@react-pdf/renderer";
import { PaseDocument } from "../src/app/registro/exito/PaseDocument";

const CARPETA_TICKETS = path.join(__dirname, "..", "..", "backend", "tickets-prueba");
const CARPETA_SALIDA = path.join(CARPETA_TICKETS, "pases-pdf");

// Buffer crudo (SourceBuffer en @react-pdf/types): react-pdf en Node intenta
// resolver una ruta de archivo como URL primero ("fetch failed"), y un data
// URI del PNG completo le dio "Incomplete or corrupt PNG file". El Buffer
// directo evita cualquier parseo de string y es el que si funciona.
const LOGO_BUFFER = fs.readFileSync(path.join(__dirname, "..", "public", "the-boss-logo.png"));

const CATEGORIAS_LABEL: Record<string, string> = {
    KIDS_AMATEUR: "Kids Amateur",
    KIDS_BOYS: "Kids Boys",
    KIDS_GIRL: "Kids Girl",
    JUVENIL_BOYS: "Juvenil Boys",
    JUVENIL_GIRL: "Juvenil Girl",
    BGIRLS: "Bgirls",
    BBOYS: "Bboys",
    PUBLICO_GENERAL: "Público en general",
    OPEN_STYLE_1V1: "Especial: Open Style 1 vs 1",
};

type FilaManifest = {
    competidorId: string;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    categoria: string;
    sexo: string;
    edad: string;
    correo: string;
    tipoBoleto: string;
    qrToken: string;
    archivoQR: string;
};

function leerManifest(): FilaManifest[] {
    const contenido = fs.readFileSync(path.join(CARPETA_TICKETS, "manifest.csv"), "utf-8");
    const [encabezado, ...filas] = contenido.trim().split("\n");
    const columnas = encabezado.split(",");
    return filas.map((fila) => {
        const valores = fila.split(",");
        const registro = {} as Record<string, string>;
        columnas.forEach((columna, i) => {
            registro[columna] = valores[i] ?? "";
        });
        return registro as FilaManifest;
    });
}

function qrDataUrlDesdeArchivo(nombreArchivo: string): string {
    const buffer = fs.readFileSync(path.join(CARPETA_TICKETS, nombreArchivo));
    return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function main() {
    const manifestPath = path.join(CARPETA_TICKETS, "manifest.csv");
    if (!fs.existsSync(manifestPath)) {
        console.error(`No se encontró ${manifestPath}. Corre primero "npm run generar-registros-prueba" en backend/.`);
        process.exit(1);
    }

    fs.mkdirSync(CARPETA_SALIDA, { recursive: true });
    const registros = leerManifest();

    for (const registro of registros) {
        const esPublico = registro.tipoBoleto === "GENERAL";
        const elemento = PaseDocument({
            esPublico,
            nombreArtistico: registro.nombreArtistico,
            categoriaLabel: CATEGORIAS_LABEL[registro.categoria] ?? registro.categoria,
            competidorId: registro.competidorId || null,
            qrDataUrl: qrDataUrlDesdeArchivo(registro.archivoQR),
            fotoUrl: null,
            logoSrc: LOGO_BUFFER,
        });

        const archivoSalida = path.join(CARPETA_SALIDA, `${registro.competidorId}.pdf`);
        await ReactPDF.render(elemento, archivoSalida);
        console.log(`${registro.competidorId} -> ${path.basename(archivoSalida)}`);
    }

    console.log(`\nListo: ${registros.length} pases generados en ${CARPETA_SALIDA}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
