"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminSessionProvider, useAdminSession } from "../AdminSessionContext";
import type { RolAdmin } from "@/lib/adminApi";

const NAV_ITEMS: { href: string; label: string; roles: RolAdmin[] }[] = [
    { href: "/admin", label: "Panel", roles: ["SUPER_ADMIN", "STAFF_ACCESO", "STAFF_JUECEO"] },
    { href: "/admin/usuarios", label: "Usuarios", roles: ["SUPER_ADMIN"] },
    { href: "/admin/pantallas", label: "Pantallas", roles: ["SUPER_ADMIN"] },
    { href: "/admin/competencia", label: "Competencia", roles: ["SUPER_ADMIN", "STAFF_JUECEO"] },
    { href: "/admin/acceso", label: "Acceso", roles: ["SUPER_ADMIN", "STAFF_ACCESO"] },
];

const ROL_LABEL: Record<RolAdmin, string> = {
    SUPER_ADMIN: "Admin total",
    STAFF_ACCESO: "Staff de acceso",
    STAFF_JUECEO: "Staff de jueceo",
};

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
    return (
        <AdminSessionProvider>
            <AdminChrome>{children}</AdminChrome>
        </AdminSessionProvider>
    );
}

function AdminChrome({ children }: { children: React.ReactNode }) {
    const { admin, cargando, cerrarSesion } = useAdminSession();
    const pathname = usePathname();

    if (cargando || !admin) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-boss-black">
                <p className="text-boss-gray">Cargando sesión...</p>
            </main>
        );
    }

    const itemsVisibles = NAV_ITEMS.filter((item) => item.roles.includes(admin.rol));

    return (
        <div className="min-h-screen bg-boss-black">
            <header className="border-b border-boss-border bg-boss-panel/60">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-1">
                        {itemsVisibles.map((item) => {
                            const activo = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={[
                                        "rounded-md px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-colors",
                                        activo ? "bg-boss-red text-white" : "text-boss-gray hover:text-white",
                                    ].join(" ")}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-3 text-sm">
                        <div className="text-right">
                            <p className="font-medium text-white">{admin.nombre}</p>
                            <p className="text-xs uppercase tracking-widest text-boss-gray">{ROL_LABEL[admin.rol]}</p>
                        </div>
                        <button
                            type="button"
                            onClick={cerrarSesion}
                            className="rounded-md border border-boss-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-red hover:text-boss-red"
                        >
                            Salir
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </div>
    );
}

// Envuelve el contenido de una página con una verificación de rol adicional
// del lado cliente (el backend ya lo exige en cada endpoint; esto solo evita
// mostrar un formulario que de todas formas fallará al enviarse).
export function RequireRol({
    roles,
    children,
}: {
    roles: RolAdmin[];
    children: React.ReactNode;
}) {
    const { admin } = useAdminSession();
    if (!admin || !roles.includes(admin.rol)) {
        return <p className="text-boss-gray">No tienes permiso para ver esta sección.</p>;
    }
    return children;
}
