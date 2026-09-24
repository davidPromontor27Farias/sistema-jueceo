"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminSessionProvider, useAdminSession } from "../AdminSessionContext";
import type { RolAdmin } from "@/lib/adminApi";

const NAV_ITEMS: { href: string; label: string; abrev: string; roles: RolAdmin[] }[] = [
    { href: "/admin", label: "Panel", abrev: "PN", roles: ["SUPER_ADMIN", "STAFF_ACCESO", "STAFF_JUECEO", "JUEZ"] },
    { href: "/admin/usuarios", label: "Usuarios", abrev: "US", roles: ["SUPER_ADMIN"] },
    { href: "/admin/pantallas", label: "Pantallas", abrev: "PT", roles: ["SUPER_ADMIN"] },
    { href: "/admin/competencia", label: "Competencia", abrev: "CP", roles: ["SUPER_ADMIN", "STAFF_JUECEO"] },
    { href: "/admin/jueceo", label: "Jueceo", abrev: "JZ", roles: ["JUEZ"] },
    { href: "/admin/acceso", label: "Acceso", abrev: "AC", roles: ["SUPER_ADMIN", "STAFF_ACCESO"] },
];

const ROL_LABEL: Record<RolAdmin, string> = {
    SUPER_ADMIN: "Admin total",
    STAFF_ACCESO: "Staff de acceso",
    STAFF_JUECEO: "Staff de jueceo",
    JUEZ: "Juez",
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
    const [colapsado, setColapsado] = useState(false);

    if (cargando || !admin) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-boss-black">
                <p className="text-boss-gray">Cargando sesión...</p>
            </main>
        );
    }

    const itemsVisibles = NAV_ITEMS.filter((item) => item.roles.includes(admin.rol));

    return (
        <div className="flex h-screen overflow-hidden bg-boss-black">
            <aside
                className={[
                    "flex h-full shrink-0 flex-col overflow-y-auto border-r border-boss-border bg-boss-panel/60 transition-[width] duration-200",
                    colapsado ? "w-16" : "w-60",
                ].join(" ")}
            >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-boss-border px-3">
                    {!colapsado && (
                        <span className="truncate font-display text-sm uppercase tracking-widest text-white">
                            THE BOSS
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setColapsado((v) => !v)}
                        aria-label={colapsado ? "Expandir navegación" : "Contraer navegación"}
                        title={colapsado ? "Expandir" : "Contraer"}
                        className="ml-auto rounded-md p-1.5 text-boss-gray transition-colors hover:bg-boss-black hover:text-white"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path
                                d={colapsado ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto p-2">
                    {itemsVisibles.map((item) => {
                        const activo = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                title={item.label}
                                className={[
                                    "flex items-center rounded-md px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-colors",
                                    colapsado ? "justify-center" : "",
                                    activo ? "bg-boss-red text-white" : "text-boss-gray hover:bg-boss-black hover:text-white",
                                ].join(" ")}
                            >
                                {colapsado ? item.abrev : item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="shrink-0 border-t border-boss-border p-3">
                    {!colapsado && (
                        <div className="mb-2 truncate text-sm">
                            <p className="truncate font-medium text-white">{admin.nombre}</p>
                            <p className="text-xs uppercase tracking-widest text-boss-gray">{ROL_LABEL[admin.rol]}</p>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={cerrarSesion}
                        title="Salir"
                        className={[
                            "w-full rounded-md border border-boss-border py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-red hover:text-boss-red",
                            colapsado ? "px-0" : "px-3",
                        ].join(" ")}
                    >
                        {colapsado ? "⏻" : "Salir"}
                    </button>
                </div>
            </aside>

            <main className="h-full min-w-0 flex-1 overflow-y-auto px-4 py-8 md:px-8">
                <div className="mx-auto max-w-5xl">{children}</div>
            </main>
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
