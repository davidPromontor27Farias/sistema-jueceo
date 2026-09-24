// Solo para preview local: le pone una foto de placeholder (avatar aleatorio
// de i.pravatar.cc) al ganador de cada categoría ya finalizada, para ver cómo
// se ven las tarjetas de campeones en /pantalla con foto real en vez del
// círculo de iniciales. No debe correr contra producción.
import "dotenv/config";

if (!(process.env.DATABASE_URL ?? "").includes("localhost")) {
    throw new Error("Este script solo debe correr contra la base de datos local.");
}

import { prisma } from "../lib/prisma";

async function main() {
    const campeones = await prisma.enfrentamiento.findMany({
        where: { ronda: "Final", estatus: "FINALIZADO", ganadorId: { not: null } },
        select: { categoria: true, ganadorId: true },
    });

    let contador = 1;
    for (const c of campeones) {
        if (!c.ganadorId) continue;
        const fotoUrl = `https://i.pravatar.cc/300?img=${contador}`;
        await prisma.registration.update({
            where: { id: c.ganadorId },
            data: { fotoUrl },
        });
        console.log(c.categoria, "->", fotoUrl);
        contador += 1;
    }

    await prisma.$disconnect();
}

main();
