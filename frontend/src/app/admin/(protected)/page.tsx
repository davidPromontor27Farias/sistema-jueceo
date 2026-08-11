"use client";

import Link from "next/link";
import { useAdminSession } from "../AdminSessionContext";
import type { RolAdmin } from "@/lib/adminApi";

const TARJETAS: { href: string; titulo: string; descripcion: string; roles: RolAdmin[] }[] = [
    {
        href: "/admin/usuarios",
        titulo: "Usuarios",
        descripcion: "Crea y administra las cuentas de staff de acceso y de jueceo.",
        roles: ["SUPER_ADMIN"],
    },
    {
        href: "/admin/pantallas",
        titulo: "Pantallas",
        descripcion: "Controla qué se proyecta en las pantallas del evento.",
        roles: ["SUPER_ADMIN"],
    },
    {
        href: "/admin/competencia",
        titulo: "Competencia",
        descripcion: "Arranca categorías y captura enfrentamientos/resultados.",
        roles: ["SUPER_ADMIN", "STAFF_JUECEO"],
    },
    {
        href: "/admin/acceso",
        titulo: "Acceso",
        descripcion: "Escanea el QR de los boletos en la entrada.",
        roles: ["SUPER_ADMIN", "STAFF_ACCESO"],
    },
];

export default function AdminDashboardPage() {
    const { admin } = useAdminSession();
    if (!admin) return null;

    const tarjetasVisibles = TARJETAS.filter((tarjeta) => tarjeta.roles.includes(admin.rol));

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Panel de administración</h1>
            <p className="mt-1 text-boss-gray">Bienvenido, {admin.nombre}.</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {tarjetasVisibles.map((tarjeta) => (
                    <Link
                        key={tarjeta.href}
                        href={tarjeta.href}
                        className="rounded-lg border border-boss-border bg-boss-panel/60 p-5 transition-colors hover:border-boss-red"
                    >
                        <h2 className="font-display text-lg uppercase tracking-wide text-white">{tarjeta.titulo}</h2>
                        <p className="mt-1 text-sm text-boss-gray">{tarjeta.descripcion}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
