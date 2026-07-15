import type { RegistrationFormValues } from "@/types/registrationForm";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
    if (!API_URL) {
        console.error("NEXT_PUBLIC_API_URL no está configurada");
        return { ok: false, error: "El servidor no está disponible en este momento." };
    }

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

export type RegistrationBySession = {
    estatusPago?: "PENDIENTE" | "PAGADO" | "FALLIDO" | "REEMBOLSADO";
    nombreArtistico?: string;
    tipoBoleto?: string;
    categoriaLabel?: string;
    competidorId?: string | null;
    qrDataUrl?: string;
    fotoUrl?: string | null;
    error?: string;
};

export async function getRegistrationBySession(sessionId: string): Promise<ApiResult<RegistrationBySession>> {
    if (!API_URL) {
        console.error("NEXT_PUBLIC_API_URL no está configurada");
        return { ok: false, error: "El servidor no está disponible en este momento." };
    }

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
