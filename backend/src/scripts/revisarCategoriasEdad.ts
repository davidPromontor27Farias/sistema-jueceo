// Script de SOLO LECTURA: reporta registros pagados cuya categoría ya no
// encaja con la edad actual del competidor según las reglas corregidas en
// config/catalog.ts (ver bug de Kids/Juvenil/Adultos). No modifica nada.
//
// Uso: npx ts-node src/scripts/revisarCategoriasEdad.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { REGLAS_POR_CATEGORIA, CATEGORIAS_LABEL, type Categoria } from "../config/catalog";

function calcularEdad(fechaNacimiento: Date, referencia: Date): number {
    let edad = referencia.getFullYear() - fechaNacimiento.getFullYear();
    const noHaCumplidoAnios =
        referencia.getMonth() < fechaNacimiento.getMonth() ||
        (referencia.getMonth() === fechaNacimiento.getMonth() && referencia.getDate() < fechaNacimiento.getDate());
    if (noHaCumplidoAnios) edad--;
    return edad;
}

async function main() {
    const registros = await prisma.registration.findMany({
        where: { estatusPago: "PAGADO" },
        select: {
            id: true,
            nombres: true,
            apellidos: true,
            nombreArtistico: true,
            categoria: true,
            fechaNacimiento: true,
            competidorId: true,
            correo: true,
        },
        orderBy: { createdAt: "asc" },
    });

    const hoy = new Date();
    const inconsistentes = registros.filter((registro) => {
        const regla = REGLAS_POR_CATEGORIA[registro.categoria as Categoria];
        const edad = calcularEdad(registro.fechaNacimiento, hoy);
        if (regla.minEdad !== null && edad < regla.minEdad) return true;
        if (regla.maxEdad !== null && edad > regla.maxEdad) return true;
        return false;
    });

    console.log(`Total registros pagados: ${registros.length}`);
    console.log(`Con categoría inconsistente con la edad actual: ${inconsistentes.length}\n`);

    for (const registro of inconsistentes) {
        const edad = calcularEdad(registro.fechaNacimiento, hoy);
        const nombre = registro.nombreArtistico || `${registro.nombres} ${registro.apellidos}`;
        console.log(
            `- [${registro.competidorId ?? "sin ID"}] ${nombre} <${registro.correo}> — nació ` +
                `${registro.fechaNacimiento.toISOString().slice(0, 10)}, tiene ${edad} años, inscrito en ` +
                `${CATEGORIAS_LABEL[registro.categoria as Categoria]} (${registro.categoria})`,
        );
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
