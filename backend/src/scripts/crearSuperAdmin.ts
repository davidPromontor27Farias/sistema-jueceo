// Script de una sola corrida para sembrar el primer SUPER_ADMIN: nadie puede
// crear el primer admin desde /admin/usuarios porque ese endpoint ya requiere
// estar autenticado como SUPER_ADMIN.
//
// Uso: npx ts-node src/scripts/crearSuperAdmin.ts "Nombre Apellido" correo@ejemplo.com "contraseñaSegura"
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";

async function main() {
    const [nombre, correo, password] = process.argv.slice(2);

    if (!nombre || !correo || !password) {
        console.error('Uso: npx ts-node src/scripts/crearSuperAdmin.ts "Nombre" correo@ejemplo.com contraseña');
        process.exit(1);
    }
    if (password.length < 8) {
        console.error("La contraseña debe tener al menos 8 caracteres");
        process.exit(1);
    }

    const admin = await prisma.adminUser.upsert({
        where: { correo },
        create: { nombre, correo, rol: "SUPER_ADMIN", passwordHash: await hashPassword(password) },
        update: { nombre, rol: "SUPER_ADMIN", activo: true, passwordHash: await hashPassword(password) },
    });

    console.log(`Listo: SUPER_ADMIN "${admin.nombre}" <${admin.correo}> (id ${admin.id})`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
