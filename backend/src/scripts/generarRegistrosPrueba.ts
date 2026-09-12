// Script de SOLO uso local: genera registros de prueba ya PAGADOS (sin pasar
// por Stripe) para tener QRs reales que escanear en pruebas del check-in.
// Se niega a correr si DATABASE_URL no apunta a localhost, por seguridad.
//
// Uso: npx ts-node src/scripts/generarRegistrosPrueba.ts [cantidadPorCategoria]
// Salida: backend/tickets-prueba/ (QR en PNG + manifest.csv), gitignoreado.
import "dotenv/config";
import { randomUUID, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import {
    CATEGORIAS_LABEL,
    ESTADOS_MEXICO,
    PREFIJO_ID_COMPETIDOR,
    tipoBoletoPorCategoria,
    calcularPrecioTotal,
    type Categoria,
    type Sexo,
} from "../config/catalog";

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
    console.error("DATABASE_URL no apunta a localhost — este script es solo para la base local. Abortando.");
    process.exit(1);
}

const CANTIDAD_POR_CATEGORIA = Number(process.argv[2] ?? 10);
const CARPETA_SALIDA = path.join(__dirname, "..", "..", "tickets-prueba");

const NOMBRES_M = ["Carlos", "Luis", "Diego", "Miguel", "Andrés", "Javier", "Ricardo", "Fernando", "Emilio", "Iker"];
const NOMBRES_F = ["María", "Sofía", "Valentina", "Camila", "Fernanda", "Ximena", "Regina", "Paola", "Renata", "Daniela"];
const APELLIDOS = [
    "García", "Martínez", "Hernández", "López", "González", "Pérez", "Sánchez", "Ramírez", "Torres", "Flores",
];
const ACADEMIAS = ["Axolobreak", "BDM", "Cerro del Poder", "DLC Crew", "Free Step Rockers", "Gravedad Zero", "Mexas", "Unik Breakers"];

type ConfigCategoria = { categoria: Categoria; edades: number[]; sexos: (Sexo | null)[] };

const CONFIG_CATEGORIAS: ConfigCategoria[] = [
    { categoria: "KIDS_AMATEUR", edades: [6, 7, 8, 9, 10, 11, 12, 6, 9, 12], sexos: null_alternado() },
    { categoria: "KIDS_BOYS", edades: [6, 7, 8, 9, 10, 11, 12, 13, 7, 10], sexos: todos("MASCULINO") },
    { categoria: "KIDS_GIRL", edades: [6, 7, 8, 9, 10, 11, 12, 13, 8, 11], sexos: todos("FEMENINO") },
    { categoria: "JUVENIL_BOYS", edades: [14, 15, 16, 17, 14, 15, 16, 17, 15, 16], sexos: todos("MASCULINO") },
    { categoria: "JUVENIL_GIRL", edades: [14, 15, 16, 17, 14, 15, 16, 17, 16, 15], sexos: todos("FEMENINO") },
    { categoria: "BGIRLS", edades: [18, 20, 22, 25, 28, 30, 33, 35, 38, 39], sexos: todos("FEMENINO") },
    { categoria: "BBOYS", edades: [18, 20, 22, 25, 28, 30, 33, 35, 38, 39], sexos: todos("MASCULINO") },
    { categoria: "PUBLICO_GENERAL", edades: [18, 20, 25, 30, 35, 40, 45, 50, 22, 28], sexos: null_alternado() },
    { categoria: "OPEN_STYLE_1V1", edades: [15, 17, 19, 21, 23, 25, 27, 29, 31, 33], sexos: null_alternado() },
];

function todos(sexo: Sexo): Sexo[] {
    return Array(10).fill(sexo);
}

function null_alternado(): Sexo[] {
    return Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? "MASCULINO" : "FEMENINO"));
}

// Nace un 1 de enero para asegurar que el cumpleaños de este año ya pasó
// (evita ambigüedad con la fecha de "hoy" al calcular la edad).
function fechaNacimientoParaEdad(edad: number): Date {
    const anioNacimiento = new Date().getFullYear() - edad;
    return new Date(`${anioNacimiento}-01-01T00:00:00-06:00`);
}

function elegir<T>(lista: T[], indice: number): T {
    const valor = lista[((indice % lista.length) + lista.length) % lista.length];
    if (valor === undefined) throw new Error("Lista vacía");
    return valor;
}

async function siguienteCompetidorId(usados: Set<string>): Promise<string> {
    const existentes = await prisma.registration.count({
        where: { competidorId: { startsWith: `${PREFIJO_ID_COMPETIDOR}-` } },
    });
    let n = existentes + 1;
    let id = `${PREFIJO_ID_COMPETIDOR}-${String(n).padStart(3, "0")}`;
    while (usados.has(id)) {
        n++;
        id = `${PREFIJO_ID_COMPETIDOR}-${String(n).padStart(3, "0")}`;
    }
    usados.add(id);
    return id;
}

const RANGO_DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

function normalizar(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(RANGO_DIACRITICOS, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
}

async function main() {
    fs.mkdirSync(CARPETA_SALIDA, { recursive: true });
    const usados = new Set<string>();
    const filasManifest: string[] = [
        "competidorId,nombreArtistico,nombres,apellidos,categoria,sexo,edad,correo,tipoBoleto,qrToken,archivoQR",
    ];

    let totalCreados = 0;

    for (const config of CONFIG_CATEGORIAS) {
        const label = CATEGORIAS_LABEL[config.categoria];
        console.log(`\n${label} (${config.categoria}):`);

        for (let i = 0; i < CANTIDAD_POR_CATEGORIA; i++) {
            const edad = elegir(config.edades, i);
            const sexo = elegir(config.sexos, i) as Sexo;
            const esNina = sexo === "FEMENINO";
            const nombres = elegir(esNina ? NOMBRES_F : NOMBRES_M, i + totalCreados);
            const apellidos = `${elegir(APELLIDOS, i + totalCreados)} ${elegir(APELLIDOS, i + totalCreados + 3)}`;
            const esPublico = config.categoria === "PUBLICO_GENERAL";
            const nombreArtistico = esPublico ? "" : `${esNina ? "Bgirl" : "Bboy"} ${nombres}`;
            const sufijo = randomBytes(3).toString("hex");
            const correo = `prueba.${normalizar(config.categoria)}.${i}.${sufijo}@thebossbreaking.com`;
            const paqueteBase = esPublico ? "PUBLICO_GENERAL" : "COMPETIDOR";
            const tipoBoleto = tipoBoletoPorCategoria(config.categoria);
            const precioMXNCentavos = calcularPrecioTotal(paqueteBase, [], { agregarOpenStyle: false, preventaActiva: false });
            const competidorId = await siguienteCompetidorId(usados);
            const qrToken = randomUUID();

            await prisma.registration.create({
                data: {
                    nombres,
                    apellidos,
                    nombreArtistico,
                    fechaNacimiento: fechaNacimientoParaEdad(edad),
                    categoria: config.categoria,
                    sexo,
                    estado: elegir([...ESTADOS_MEXICO], i),
                    ciudad: "Ciudad de prueba",
                    correo,
                    telefono: `555${String(1000000 + totalCreados).slice(0, 7)}`,
                    academiaCrew: esPublico ? null : elegir(ACADEMIAS, i),
                    contactoEmergencia: edad < 18 ? "Contacto de prueba 5551234567" : null,
                    nacionalidad: "Mexicana",
                    fotoUrl: null,
                    aceptaReglamento: true,
                    aceptaAvisoPrivacidad: true,
                    aceptaUsoImagen: true,
                    aceptaPoliticaCancelacion: true,
                    tipoBoleto,
                    paqueteBase,
                    workshopsSeleccionados: [],
                    agregarOpenStyle: false,
                    precioMXNCentavos,
                    estatusPago: "PAGADO",
                    stripeSessionId: `test_${qrToken}`,
                    qrToken,
                    competidorId,
                },
            });

            const nombreArchivo = `${competidorId}_${normalizar(`${nombres}-${apellidos}`)}.png`;
            await QRCode.toFile(path.join(CARPETA_SALIDA, nombreArchivo), qrToken, {
                errorCorrectionLevel: "M",
                margin: 2,
                width: 320,
            });

            filasManifest.push(
                [
                    competidorId,
                    nombreArtistico || `${nombres} ${apellidos}`,
                    nombres,
                    apellidos,
                    config.categoria,
                    sexo,
                    edad,
                    correo,
                    tipoBoleto,
                    qrToken,
                    nombreArchivo,
                ].join(","),
            );

            totalCreados++;
        }
        console.log(`  ${CANTIDAD_POR_CATEGORIA} registros creados.`);
    }

    fs.writeFileSync(path.join(CARPETA_SALIDA, "manifest.csv"), filasManifest.join("\n"), "utf-8");

    console.log(`\nListo: ${totalCreados} registros de prueba creados y pagados.`);
    console.log(`QRs y manifest.csv guardados en: ${CARPETA_SALIDA}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
