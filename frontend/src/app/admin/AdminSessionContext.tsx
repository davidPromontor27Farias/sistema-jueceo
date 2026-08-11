"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getMe, logout as logoutRequest, type AdminInfo } from "@/lib/adminApi";

type SesionAdmin = { admin: AdminInfo | null; cargando: boolean; cerrarSesion: () => Promise<void> };

const AdminSessionContext = createContext<SesionAdmin | null>(null);

// Envuelve todo el área /admin/(protected): consulta la sesión una vez al
// montar y la deja disponible a las páginas hijas vía useAdminSession().
export function AdminSessionProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [admin, setAdmin] = useState<AdminInfo | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let cancelado = false;
        getMe().then((resultado) => {
            if (cancelado) return;
            if (resultado.ok) {
                setAdmin(resultado.data.admin);
            } else {
                router.replace("/admin/login");
            }
            setCargando(false);
        });
        return () => {
            cancelado = true;
        };
    }, [router]);

    const cerrarSesion = async () => {
        await logoutRequest();
        router.replace("/admin/login");
    };

    return (
        <AdminSessionContext.Provider value={{ admin, cargando, cerrarSesion }}>
            {children}
        </AdminSessionContext.Provider>
    );
}

export function useAdminSession(): SesionAdmin {
    const context = useContext(AdminSessionContext);
    if (!context) {
        throw new Error("useAdminSession debe usarse dentro de AdminSessionProvider");
    }
    return context;
}
