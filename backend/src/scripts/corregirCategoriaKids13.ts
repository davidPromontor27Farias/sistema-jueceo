// Corrección puntual, de una sola corrida: dos competidores de 13 años
// quedaron mal clasificados en Juvenil Boys por el bug de reglas de edad ya
// corregido en config/catalog.ts (ver revisarCategoriasEdad.ts, 2026-08-11).
// Reclasifica SOLO estos dos competidorId a Kids Boys. No toca ningún otro
// campo (precio, boleto, foto, QR, etc.), y verifica que sigan en
// JUVENIL_BOYS antes de escribir, por si algo cambió desde la auditoría.
import "dotenv/config";
import { prisma } from "../lib/prisma";

const COMPETIDOR_IDS_A_CORREGIR = ["THB-009", "THB-010"];

async function main() {
    for (const competidorId of COMPETIDOR_IDS_A_CORREGIR) {
        const registro = await prisma.registration.findUnique({ where: { competidorId } });

        if (!registro) {
            console.log(`${competidorId}: no encontrado, se omite.`);
            continue;
        }
        if (registro.categoria !== "JUVENIL_BOYS") {
            console.log(`${competidorId}: ya no está en JUVENIL_BOYS (está en ${registro.categoria}), se omite por seguridad.`);
            continue;
        }

        await prisma.registration.update({
            where: { competidorId },
            data: { categoria: "KIDS_BOYS" },
        });
        console.log(`${competidorId} (${registro.nombreArtistico}): JUVENIL_BOYS -> KIDS_BOYS actualizado.`);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
