"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getMe, logout as logoutRequest, type AdminInfo } from "@/lib/adminApi";

type SesionAdmin = { admin: AdminInfo | null; cargando: boolean; cerrarSesion: () => Promise<void> };

const AdminSessionContext = createContext<SesionAdmin | null>(null);

// Cada cuánto se vuelve a consultar /me mientras la pestaña sigue abierta —
// sin esto, si el staff reasigna a un juez a otro escenario (o lo activa/
// desactiva) MIENTRAS ese juez ya tiene la sesión abierta, su `escenarioId`
// se queda pegado con el valor de cuando inició sesión: seguía viendo "no
// tienes escenario asignado" (o el escenario viejo) hasta cerrar sesión y
// volver a entrar a mano. Mismo intervalo que ya usa el badge de Evento de
// Prueba en el layout.
const INTERVALO_REFRESCO_MS = 10_000;

// Envuelve todo el área /admin/(protected): consulta la sesión al montar y
// la refresca periódicamente, disponible a las páginas hijas vía
// useAdminSession().
export function AdminSessionProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [admin, setAdmin] = useState<AdminInfo | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let cancelado = false;

        const consultar = (esPrimeraVez: boolean) => {
            getMe().then((resultado) => {
                if (cancelado) return;
                if (resultado.ok) {
                    setAdmin(resultado.data.admin);
                } else if (esPrimeraVez) {
                    // Solo redirige a /login si NUNCA hubo sesión válida — un
                    // refresco periódico que falla por un bache de red no
                    // debe sacar de la pantalla a un juez a media calificación.
                    router.replace("/admin/login");
                }
                if (esPrimeraVez) setCargando(false);
            });
        };

        consultar(true);
        const id = setInterval(() => consultar(false), INTERVALO_REFRESCO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
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
