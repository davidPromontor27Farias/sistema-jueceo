import type { Categoria } from "@/config/catalog";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export type RolAdmin = "SUPER_ADMIN" | "STAFF_ACCESO" | "STAFF_JUECEO";
export type AdminInfo = {
    id: string;
    nombre: string;
    correo: string;
    rol: RolAdmin;
    activo?: boolean;
    createdAt?: string;
};

export type EstatusCompetencia = "NO_INICIADA" | "EN_CURSO" | "FINALIZADA";
export type CategoriaEstado = { categoria: Categoria; label: string; estatus: EstatusCompetencia };

export type EstatusEnfrentamiento = "PENDIENTE" | "EN_CURSO" | "FINALIZADO";
export type CompetidorResumen = {
    id: string;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    competidorId: string | null;
} | null;

export type Enfrentamiento = {
    id: string;
    categoria: Categoria;
    ronda: string;
    orden: number;
    competidorA: CompetidorResumen;
    competidorB: CompetidorResumen;
    ganador: CompetidorResumen;
    estatus: EstatusEnfrentamiento;
};

export type VistaPantalla = "APAGADA" | "BRACKETS" | "RESULTADOS" | "ENFRENTAMIENTOS" | "GANADORES" | "ACCESOS";
export type PantallaEstado = { id: number; vista: VistaPantalla; categoriaEnfocada: Categoria | null; updatedAt: string };

export type AccessVerifyResult =
    | {
          ok: true;
          nombres: string;
          apellidos: string;
          nombreArtistico: string;
          tipoBoleto: string;
          categoriaLabel: string;
          competidorId: string | null;
          fotoUrl: string | null;
      }
    | { ok: false; motivo: "QR_INVALIDO" }
    | {
          ok: false;
          motivo: "YA_USADO";
          escaneadoEn?: string;
          nombres?: string;
          apellidos?: string;
          nombreArtistico?: string;
          tipoBoleto?: string;
          categoriaLabel?: string;
          competidorId?: string | null;
          fotoUrl?: string | null;
      };

export type HistorialAccesoItem = {
    id: string;
    nombres: string;
    apellidos: string;
    nombreArtistico: string;
    tipoBoleto: string;
    categoriaLabel: string;
    competidorId: string | null;
    fotoUrl: string | null;
    qrEscaneadoEn: string;
};

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function parseJsonSafely(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    if (!API_URL) {
        console.error("NEXT_PUBLIC_API_URL no está configurada");
        return { ok: false, error: "El servidor no está disponible en este momento." };
    }

    try {
        const response = await fetch(`${API_URL}${path}`, {
            credentials: "include",
            headers: init?.body ? { "Content-Type": "application/json" } : undefined,
            ...init,
        });
        const data = await parseJsonSafely(response);

        if (!response.ok) {
            const error = (data as { error?: string } | null)?.error ?? "Ocurrió un error inesperado.";
            return { ok: false, error };
        }

        return { ok: true, data: data as T };
    } catch (error) {
        console.error(`Error al conectar con ${path}`, error);
        return { ok: false, error: "No se pudo conectar con el servidor." };
    }
}

export function login(correo: string, password: string) {
    return adminFetch<{ admin: AdminInfo }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ correo, password }),
    });
}

export function logout() {
    return adminFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function getMe() {
    return adminFetch<{ admin: AdminInfo }>("/api/auth/me");
}

export function listAdmins() {
    return adminFetch<{ admins: AdminInfo[] }>("/api/admins");
}

export function createAdmin(data: { nombre: string; correo: string; password: string; rol: RolAdmin }) {
    return adminFetch<{ admin: AdminInfo }>("/api/admins", { method: "POST", body: JSON.stringify(data) });
}

export function updateAdmin(
    id: string,
    data: Partial<{ nombre: string; rol: RolAdmin; activo: boolean; password: string }>,
) {
    return adminFetch<{ admin: AdminInfo }>(`/api/admins/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function getCategoriasEstado() {
    return adminFetch<{ categorias: CategoriaEstado[] }>("/api/competencia/categorias");
}

export function patchCategoriaEstado(categoria: Categoria, estatus: EstatusCompetencia) {
    return adminFetch<{ estado: { categoria: Categoria; estatus: EstatusCompetencia } }>(
        `/api/competencia/categorias/${categoria}`,
        { method: "PATCH", body: JSON.stringify({ estatus }) },
    );
}

export function getCompetidoresPorCategoria(categoria: Categoria) {
    return adminFetch<{ competidores: NonNullable<CompetidorResumen>[] }>(
        `/api/competencia/competidores?categoria=${categoria}`,
    );
}

export function getEnfrentamientos(categoria?: Categoria) {
    const query = categoria ? `?categoria=${categoria}` : "";
    return adminFetch<{ enfrentamientos: Enfrentamiento[] }>(`/api/competencia/enfrentamientos${query}`);
}

export function createEnfrentamiento(data: {
    categoria: Categoria;
    ronda: string;
    orden?: number;
    competidorAId?: string;
    competidorBId?: string;
}) {
    return adminFetch<{ enfrentamiento: Enfrentamiento }>("/api/competencia/enfrentamientos", {
        method: "POST",
        body: JSON.stringify(data),
    });
}

export function updateEnfrentamiento(
    id: string,
    data: Partial<{
        ronda: string;
        orden: number;
        competidorAId: string | null;
        competidorBId: string | null;
        ganadorId: string | null;
        estatus: EstatusEnfrentamiento;
    }>,
) {
    return adminFetch<{ enfrentamiento: Enfrentamiento }>(`/api/competencia/enfrentamientos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
    });
}

export function getPantallaEstado() {
    return adminFetch<{ estado: PantallaEstado }>("/api/pantalla");
}

export function patchPantallaEstado(data: { vista: VistaPantalla; categoriaEnfocada?: Categoria | null }) {
    return adminFetch<{ estado: PantallaEstado }>("/api/pantalla", { method: "PATCH", body: JSON.stringify(data) });
}

// /api/access/verify usa 200/404/409 con cuerpos propios (ok/motivo), no el
// patrón error genérico del resto de la API admin, así que no reutiliza
// adminFetch (que trataría 404/409 como error genérico y perdería el motivo).
export async function verificarAcceso(
    qrToken: string,
): Promise<{ ok: true; data: AccessVerifyResult } | { ok: false; error: string }> {
    if (!API_URL) {
        console.error("NEXT_PUBLIC_API_URL no está configurada");
        return { ok: false, error: "El servidor no está disponible en este momento." };
    }

    try {
        const response = await fetch(`${API_URL}/api/access/verify`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qrToken }),
        });

        if (response.status === 401 || response.status === 403) {
            return { ok: false, error: "No tienes permiso para escanear accesos." };
        }

        const data = (await parseJsonSafely(response)) as AccessVerifyResult | null;
        if (!data) {
            return { ok: false, error: "No se pudo leer la respuesta del servidor." };
        }

        return { ok: true, data };
    } catch (error) {
        console.error("Error al conectar con /api/access/verify", error);
        return { ok: false, error: "No se pudo conectar con el servidor." };
    }
}

export function getHistorialAcceso() {
    return adminFetch<{ historial: HistorialAccesoItem[] }>("/api/access/historial");
}

// Público (sin sesión) — lo consume /pantalla para la vista "Accesos".
export function getRecientesAcceso() {
    return adminFetch<{ recientes: HistorialAccesoItem[] }>("/api/access/recientes");
}
