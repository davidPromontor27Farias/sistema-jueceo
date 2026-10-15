import type { RegistrationFormValues } from "@/types/registrationForm";
import type { Categoria } from "@/config/catalog";
import { resolveApiUrl } from "./apiUrl";

const API_URL = resolveApiUrl();

export type RegistrationPayload = Omit<RegistrationFormValues, "fechaNacimiento"> & {
    fechaNacimiento: string;
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function parseJsonSafely(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export async function postRegistration(
    payload: RegistrationPayload,
): Promise<ApiResult<{ checkoutUrl: string }>> {
    try {
        const response = await fetch(`${API_URL}/api/registrations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = (await parseJsonSafely(response)) as { checkoutUrl?: string; error?: string } | null;

        if (!response.ok || !data) {
            return { ok: false, error: data?.error ?? "No se pudo completar el registro, revisa tus datos." };
        }

        if (!data.checkoutUrl) {
            console.error("Respuesta de /api/registrations sin checkoutUrl", data);
            return { ok: false, error: "No se pudo iniciar el pago, intenta de nuevo." };
        }

        return { ok: true, data: { checkoutUrl: data.checkoutUrl } };
    } catch (error) {
        console.error("Error al conectar con /api/registrations", error);
        return { ok: false, error: "No se pudo conectar con el servidor. Intenta de nuevo." };
    }
}

// Confirmación del Evento de Prueba (/evento-prueba): sin Stripe de por
// medio, el backend crea el registro y devuelve de una vez todo lo que la
// tarjeta de confirmación necesita (mismo shape que RegistrationBySession
// cuando estatusPago === "PAGADO", ver PaseConfirmado.tsx).
export type RegistrationPruebaConfirmacion = {
    nombreArtistico: string;
    nombreCompleto: string;
    categoriaLabel: string;
    tipoBoleto: string;
    competidorId: string | null;
    qrDataUrl: string;
    fotoUrl: string | null;
};

export async function postRegistrationPrueba(
    payload: RegistrationPayload,
): Promise<ApiResult<RegistrationPruebaConfirmacion>> {
    try {
        const response = await fetch(`${API_URL}/api/registrations-prueba`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = (await parseJsonSafely(response)) as (RegistrationPruebaConfirmacion & { error?: string }) | null;

        if (!response.ok || !data) {
            return { ok: false, error: data?.error ?? "No se pudo completar el registro, revisa tus datos." };
        }

        return { ok: true, data };
    } catch (error) {
        console.error("Error al conectar con /api/registrations-prueba", error);
        return { ok: false, error: "No se pudo conectar con el servidor. Intenta de nuevo." };
    }
}

export type PreventaEstado = { activa: boolean; lugaresRestantes: number };

export async function getPreventaEstado(): Promise<PreventaEstado> {
    try {
        const response = await fetch(`${API_URL}/api/registrations/preventa-estado`);
        const data = (await parseJsonSafely(response)) as Partial<PreventaEstado> | null;

        if (!response.ok || !data) {
            return { activa: false, lugaresRestantes: 0 };
        }

        return { activa: Boolean(data.activa), lugaresRestantes: Number(data.lugaresRestantes ?? 0) };
    } catch (error) {
        console.error("Error al conectar con /api/registrations/preventa-estado", error);
        return { activa: false, lugaresRestantes: 0 };
    }
}

export type RegistrationBySession = {
    estatusPago?: "PENDIENTE" | "PAGADO" | "FALLIDO" | "REEMBOLSADO";
    nombres?: string;
    apellidos?: string;
    nombreArtistico?: string;
    tipoBoleto?: string;
    categoriaLabel?: string;
    competidorId?: string | null;
    qrDataUrl?: string;
    fotoUrl?: string | null;
    error?: string;
};

export async function getRegistrationBySession(sessionId: string): Promise<ApiResult<RegistrationBySession>> {
    try {
        const response = await fetch(`${API_URL}/api/registrations/by-session/${sessionId}`);
        const data = (await parseJsonSafely(response)) as RegistrationBySession | null;

        if (!response.ok || !data) {
            return { ok: false, error: data?.error ?? "No se encontró tu registro." };
        }

        return { ok: true, data };
    } catch (error) {
        console.error("Error al conectar con /api/registrations/by-session", error);
        return { ok: false, error: "No se pudo conectar con el servidor." };
    }
}

export type CompetidorVista = {
    id: string;
    competidorId: string | null;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    fotoUrl: string | null;
} | null;

export type EnfrentamientoVista = {
    id: string;
    categoria: Categoria;
    ronda: string;
    rondaNumero: number;
    orden: number;
    competidorA: CompetidorVista;
    competidorB: CompetidorVista;
};

export type CategoriaVistaRegistros = {
    categoria: Categoria;
    label: string;
    totalInscritos: number;
    enfrentamientos: EnfrentamientoVista[];
};

export type VistaRegistros = {
    categorias: CategoriaVistaRegistros[];
    generadoEn: string;
};

export async function getVistaRegistros(token: string): Promise<ApiResult<VistaRegistros>> {
    try {
        const response = await fetch(`${API_URL}/api/vista-registros?token=${encodeURIComponent(token)}`);
        const data = (await parseJsonSafely(response)) as (VistaRegistros & { error?: string }) | null;

        if (!response.ok || !data) {
            return { ok: false, error: data?.error ?? "No se pudo cargar la información." };
        }

        return { ok: true, data };
    } catch (error) {
        console.error("Error al conectar con /api/vista-registros", error);
        return { ok: false, error: "No se pudo conectar con el servidor." };
    }
}

export type DesglosePuntajeVista = {
    tecnica: number;
    ejecucion: number;
    vocabulario: number;
    musicalidad: number;
    originalidad: number;
};

export type MiDesgloseBatalla = {
    id: string;
    ronda: string;
    rivalNombre: string | null;
    gane: boolean;
    miPuntaje: number | null;
    miDesglose: DesglosePuntajeVista | null;
};

export type MiDesglose = {
    competidor: { nombre: string; competidorId: string | null; categoria: Categoria };
    preseleccion: { puntajeTotal: number; desglose: DesglosePuntajeVista } | null;
    batallas: MiDesgloseBatalla[];
};

export type MiDesgloseResultadoBusqueda = {
    id: string;
    nombre: string;
    categoria: Categoria;
    competidorId: string | null;
};

// Busca por nombre de competidor (Bboy/Bgirl name) — devuelve candidatos
// para desambiguar si hay más de uno con nombre parecido (ver
// Consulta individual de desglose).
export async function buscarMiDesglose(nombre: string): Promise<ApiResult<{ resultados: MiDesgloseResultadoBusqueda[] }>> {
    try {
        const params = new URLSearchParams({ nombre });
        const response = await fetch(`${API_URL}/api/competencia/mi-desglose/buscar?${params.toString()}`);
        const data = (await parseJsonSafely(response)) as ({ resultados: MiDesgloseResultadoBusqueda[] } & { error?: string }) | null;

        if (!response.ok || !data) {
            return { ok: false, error: data?.error ?? "No se pudo buscar." };
        }

        return { ok: true, data };
    } catch (error) {
        console.error("Error al conectar con /api/competencia/mi-desglose/buscar", error);
        return { ok: false, error: "No se pudo conectar con el servidor." };
    }
}

// Consulta pública (sin login) del desglose detallado de un competidor por
// su id (obtenido con buscarMiDesglose) — ver Consulta individual de
// desglose: el detalle por rubro ya no se proyecta en la pantalla pública,
// se ve acá desde el teléfono.
export async function getMiDesglose(id: string): Promise<ApiResult<MiDesglose>> {
    try {
        const params = new URLSearchParams({ id });
        const response = await fetch(`${API_URL}/api/competencia/mi-desglose?${params.toString()}`);
        const data = (await parseJsonSafely(response)) as (MiDesglose & { error?: string }) | null;

        if (!response.ok || !data) {
            return { ok: false, error: data?.error ?? "No se pudo consultar el desglose." };
        }

        return { ok: true, data };
    } catch (error) {
        console.error("Error al conectar con /api/competencia/mi-desglose", error);
        return { ok: false, error: "No se pudo conectar con el servidor." };
    }
}
