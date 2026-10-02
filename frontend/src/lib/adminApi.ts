import type { Categoria, EstadoAcceso } from "@/config/catalog";
import { resolveApiUrl } from "./apiUrl";

const API_URL = resolveApiUrl();

export type RolAdmin = "SUPER_ADMIN" | "STAFF_ACCESO" | "STAFF_JUECEO" | "JUEZ";
export type AdminInfo = {
    id: string;
    nombre: string;
    correo: string;
    rol: RolAdmin;
    activo?: boolean;
    createdAt?: string;
    // Solo tiene sentido para rol JUEZ: a qué escenario físico pertenece
    // durante la fase de Preselección. Ver Escenario.
    escenarioId?: string | null;
    escenario?: { id: string; nombre: string } | null;
};

export type Escenario = {
    id: string;
    nombre: string;
    orden: number;
    activo: boolean;
    createdAt: string;
    updatedAt: string;
};

export type EstatusCompetencia = "NO_INICIADA" | "PRESELECCION" | "REPECHAJE_DESEMPATE" | "EN_CURSO" | "FINALIZADA";
export type CategoriaEstado = { categoria: Categoria; label: string; estatus: EstatusCompetencia };

export type EstatusEnfrentamiento = "PENDIENTE" | "EN_CURSO" | "FINALIZADO";
export type CompetidorResumen = {
    id: string;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    competidorId: string | null;
    fotoUrl: string | null;
} | null;

// Suma por criterio (Art. 35 del reglamento) entre todos los jueces que ya
// calificaron a ese competidor. Ver desgloseA/desgloseB en Enfrentamiento.
export type DesglosePuntaje = {
    tecnica: number;
    ejecucion: number;
    vocabulario: number;
    musicalidad: number;
    originalidad: number;
};

export type Enfrentamiento = {
    id: string;
    categoria: Categoria;
    ronda: string;
    rondaNumero: number;
    orden: number;
    competidorA: CompetidorResumen;
    competidorB: CompetidorResumen;
    ganador: CompetidorResumen;
    estatus: EstatusEnfrentamiento;
    updatedAt: string;
    // Si el SUPER_ADMIN cortó el turno de un competidor antes de tiempo, ver
    // POST /enfrentamientos/:id/cortar-turno y useSecuenciaBatalla.
    turnoACortadoEn: string | null;
    turnoBCortadoEn: string | null;
    // Cuántas veces se ha repetido esta pelea por empate (0 = todavía no
    // hubo empate). Ver useSecuenciaBatalla / fase "empate".
    numeroDesempate: number;
    // Solo vienen en GET /enfrentamientos (lo usa /pantalla); en-curso no las
    // manda porque una batalla activa todavía no tiene puntaje que mostrar.
    puntajeA?: number | null;
    puntajeB?: number | null;
    desgloseA?: DesglosePuntaje | null;
    desgloseB?: DesglosePuntaje | null;
};

export type VistaPantalla = "APAGADA" | "BRACKETS" | "RESULTADOS" | "ENFRENTAMIENTOS" | "GANADORES";
export type PantallaEstado = { id: number; vista: VistaPantalla; categoriaEnfocada: Categoria | null; updatedAt: string };

// paqueteBaseLabel/academiaCrew/workshopsSeleccionados/agregarOpenStyle solo
// vienen en las respuestas para staff (verify, historial); la vista pública
// de /pantalla (recientes) no las manda.
type DetallePaqueteStaff = {
    paqueteBaseLabel?: string;
    academiaCrew?: string | null;
    workshopsSeleccionados?: number[];
    agregarOpenStyle?: boolean;
};

export type TipoEventoAcceso = "ENTRADA" | "SALIDA_TEMPORAL" | "REINGRESO" | "INTENTO_BLOQUEADO" | "BLOQUEO" | "DESBLOQUEO";

type DatosPersonaStaff = {
    nombres: string;
    apellidos: string;
    nombreArtistico: string;
    tipoBoleto: string;
    categoriaLabel: string;
    competidorId: string | null;
    fotoUrl: string | null;
    estadoAcceso: EstadoAcceso;
    estadoAccesoLabel: string;
};

export type AccessVerifyResult =
    | ({
          ok: true;
          tipoEvento: TipoEventoAcceso;
          posibleDuplicado: boolean;
          segundosDesdeUltimoEvento: number | null;
      } & DatosPersonaStaff &
          DetallePaqueteStaff)
    | { ok: false; motivo: "QR_INVALIDO" }
    | ({ ok: false; motivo: "BLOQUEADO" } & DatosPersonaStaff & DetallePaqueteStaff)
    | ({ ok: false; motivo: "CONFLICTO" } & DatosPersonaStaff & DetallePaqueteStaff);

export type HistorialAccesoItem = {
    id: string;
    qrEscaneadoEn: string;
} & DatosPersonaStaff &
    DetallePaqueteStaff;

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

// Interruptor global: si el sistema completo (Preselección, Jueceo,
// Brackets, Pantalla, Tablero, Control de Accesos) opera sobre los registros
// del Evento de Prueba (/evento-prueba, sin pago) o sobre los reales pagados.
// GET es público (lo usan también /pantalla y /pantalla/tablero para avisar
// "MODO PRUEBA"); PATCH requiere SUPER_ADMIN.
export function getConfiguracionEvento() {
    return adminFetch<{ modoPrueba: boolean }>("/api/configuracion-evento");
}

export function patchConfiguracionEvento(modoPrueba: boolean) {
    return adminFetch<{ modoPrueba: boolean }>("/api/configuracion-evento", {
        method: "PATCH",
        body: JSON.stringify({ modoPrueba }),
    });
}

export function listAdmins() {
    return adminFetch<{ admins: AdminInfo[] }>("/api/admins");
}

export function createAdmin(data: {
    nombre: string;
    correo: string;
    password: string;
    rol: RolAdmin;
    escenarioId?: string | null;
}) {
    return adminFetch<{ admin: AdminInfo }>("/api/admins", { method: "POST", body: JSON.stringify(data) });
}

export function updateAdmin(
    id: string,
    data: Partial<{ nombre: string; rol: RolAdmin; activo: boolean; password: string; escenarioId: string | null }>,
) {
    return adminFetch<{ admin: AdminInfo }>(`/api/admins/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

// Borrado físico de una cuenta. Solo funciona si nunca calificó ni escaneó
// accesos (el backend lo bloquea con 409 si ya tiene historial) — para esos
// casos la vía correcta es desactivarla con updateAdmin(id, {activo:false}).
export function deleteAdmin(id: string) {
    return adminFetch<{ ok: true }>(`/api/admins/${id}`, { method: "DELETE" });
}

// Escenarios físicos (tarimas) donde se corre la Preselección en paralelo.
// GET lo usan SUPER_ADMIN y STAFF_JUECEO (para poblar selects y sub-paneles);
// POST/PATCH solo SUPER_ADMIN.
export function getEscenarios() {
    return adminFetch<{ escenarios: Escenario[] }>("/api/escenarios");
}

export function createEscenario(data: { nombre: string; orden?: number; activo?: boolean }) {
    return adminFetch<{ escenario: Escenario }>("/api/escenarios", { method: "POST", body: JSON.stringify(data) });
}

export function updateEscenario(id: string, data: Partial<{ nombre: string; orden: number; activo: boolean }>) {
    return adminFetch<{ escenario: Escenario }>(`/api/escenarios/${id}`, { method: "PATCH", body: JSON.stringify(data) });
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

export function generarBracket(categoria: Categoria) {
    return adminFetch<{ enfrentamientos: Enfrentamiento[] }>(`/api/competencia/categorias/${categoria}/generar-bracket`, {
        method: "POST",
    });
}

// Fase de Preselección (Filtro/Cypher estilo Red Bull BC One): cada juez
// puntúa individualmente a cada competidor pagado con los mismos 5 criterios
// del reglamento, sin comparar A vs B. Ver PanelPreseleccion en
// admin/competencia y la sección de preselección en admin/jueceo.
export type ParticipantePreseleccion = {
    id: string;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    competidorId: string | null;
    fotoUrl: string | null;
    calificacionesRecibidas: number;
    puntajeTotal: number | null;
    yaCalifique: boolean;
};

export function getParticipantesPreseleccion(categoria: Categoria, escenarioId: string) {
    return adminFetch<{ participantes: ParticipantePreseleccion[]; juecesActivos: number }>(
        `/api/competencia/preseleccion/participantes?categoria=${categoria}&escenarioId=${escenarioId}`,
    );
}

export type PuntajesPreseleccion = {
    tecnica: number;
    ejecucion: number;
    vocabulario: number;
    musicalidad: number;
    originalidad: number;
};

export function calificarPreseleccion(registrationId: string, puntajes: PuntajesPreseleccion) {
    return adminFetch<{ ok: true }>(`/api/competencia/preseleccion/${registrationId}/calificar`, {
        method: "POST",
        body: JSON.stringify(puntajes),
    });
}

// Quién está en tarima ahora mismo en la fase de Preselección: lo consumen
// tanto /pantalla (cronómetro en vivo + resultado, ver
// frontend/src/app/pantalla/SecuenciaPreseleccion.tsx) como admin/jueceo (a
// quién calificar). `completo`/`puntajeTotal`/`desglose` reflejan el avance
// de calificación de ESE participante puntual (no confundir con el ranking
// general de PanelPreseleccion).
export type TurnoPreseleccion = {
    participante: CompetidorResumen;
    categoria: Categoria;
    escenarioId: string;
    iniciadoEn: string;
    calificacionesRecibidas: number;
    juecesActivos: number;
    completo: boolean;
    puntajeTotal: number | null;
    desglose: DesglosePuntaje | null;
} | null;

export function getTurnoPreseleccionActual(categoria: Categoria, escenarioId: string) {
    return adminFetch<{ turno: TurnoPreseleccion }>(
        `/api/competencia/categorias/${categoria}/preseleccion/turno-actual?escenarioId=${escenarioId}`,
    );
}

// Los siguientes en la fila de Preselección (sin el que está en tarima, sin
// puntajes): lo usa el tablero secundario para "próximas presentaciones".
export type ProximoPreseleccionItem = {
    id: string;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    competidorId: string | null;
    fotoUrl: string | null;
};

export function getProximosPreseleccion(categoria: Categoria, escenarioId: string) {
    return adminFetch<{ proximos: ProximoPreseleccionItem[] }>(
        `/api/competencia/categorias/${categoria}/preseleccion/proximos?escenarioId=${escenarioId}`,
    );
}

// Escenarios participando en la Preselección/Repechaje vigente de una
// categoría (uno por cada sub-panel que debe mostrar el admin).
export function getEscenariosDeCategoria(categoria: Categoria) {
    return adminFetch<{ escenarios: { id: string; nombre: string; orden: number }[] }>(
        `/api/competencia/categorias/${categoria}/preseleccion/escenarios`,
    );
}

// Arranca la Preselección de una categoría: reparte a los competidores
// pagados entre los escenarios con jueces activos. Reemplaza el uso de
// patchCategoriaEstado(categoria, "PRESELECCION"), que ahora el backend
// rechaza explícitamente.
export function iniciarPreseleccion(categoria: Categoria) {
    return adminFetch<{ estatus: "PRESELECCION"; reparto: { escenarioId: string; escenarioNombre: string; cantidad: number }[] }>(
        `/api/competencia/categorias/${categoria}/preseleccion/iniciar`,
        { method: "POST" },
    );
}

// Ranking completo de Preselección (todos los pagados, calificados o no).
// Lo usa /pantalla para el recorrido de resultados uno por uno una vez que
// se acaba la fila de turnos, ver frontend/src/app/pantalla/SecuenciaPreseleccion.tsx.
export type ResultadoPreseleccionItem = {
    id: string;
    nombreArtistico: string;
    nombres: string;
    apellidos: string;
    competidorId: string | null;
    fotoUrl: string | null;
    // A qué escenario quedó asignado en el reparto proporcional, y en qué
    // ronda de repechaje está (0 = preselección normal).
    escenarioId: string | null;
    escenarioNombre: string | null;
    numeroDesempate: number;
    calificacionesRecibidas: number;
    // Jueces activos DE SU ESCENARIO (ya no es un solo número global, cada
    // fila puede tener uno distinto — ver Preselección Paralela Multiescenario).
    juecesActivos: number;
    puntajeTotal: number | null;
    completo: boolean;
};

export function getResultadosPreseleccion(categoria: Categoria) {
    return adminFetch<{ resultados: ResultadoPreseleccionItem[] }>(
        `/api/competencia/categorias/${categoria}/preseleccion/resultados`,
    );
}

export function siguienteTurnoPreseleccion(categoria: Categoria, escenarioId: string) {
    return adminFetch<{ turno: TurnoPreseleccion; terminado: boolean }>(
        `/api/competencia/categorias/${categoria}/preseleccion/siguiente-turno?escenarioId=${escenarioId}`,
        { method: "POST" },
    );
}

export type RankingPreseleccionItem = {
    id: string;
    nombre: string;
    puntajeTotal: number;
    originalidadTotal: number;
    clasificado: boolean;
};

export type FaltantePreseleccion = {
    id: string;
    nombre: string;
    calificacionesRecibidas: number;
    juecesActivos: number;
};

export type ParticipanteEmpatado = { id: string; nombre: string; puntajeTotal: number };

export type GenerarTopBracketResultado =
    | {
          ok: true;
          enfrentamientos: Enfrentamiento[];
          ranking: RankingPreseleccionItem[];
          cortadosEn: number;
          totalCalificados: number;
      }
    // Empate exacto en la frontera de corte: el backend ya lanzó
    // automáticamente la ronda extra de repechaje (categoría pasó a
    // REPECHAJE_DESEMPATE) — no requiere ninguna acción manual del admin,
    // solo informarle quiénes van a repetir presentación.
    | { ok: false; motivo: "REPECHAJE_DESEMPATE"; empatados: ParticipanteEmpatado[] }
    | { ok: false; motivo: "FALTAN_CALIFICACIONES"; error: string; faltantes: FaltantePreseleccion[] }
    | { ok: false; motivo: "ERROR"; error: string };

// No reusa adminFetch (como verificarAcceso): la respuesta 202 (repechaje) y
// el 409 (faltantes) traen cuerpos con detalle que necesita el panel de
// admin, y adminFetch descarta todo salvo `error` en las respuestas no-ok.
export async function generarTopBracket(categoria: Categoria): Promise<GenerarTopBracketResultado> {
    if (!API_URL) {
        console.error("NEXT_PUBLIC_API_URL no está configurada");
        return { ok: false, motivo: "ERROR", error: "El servidor no está disponible en este momento." };
    }

    try {
        const response = await fetch(`${API_URL}/api/competencia/categorias/${categoria}/generar-top-bracket`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
        });
        const data = await parseJsonSafely(response);

        if (response.status === 202) {
            const body = data as { empatados?: ParticipanteEmpatado[] } | null;
            return { ok: false, motivo: "REPECHAJE_DESEMPATE", empatados: body?.empatados ?? [] };
        }

        if (response.ok) {
            const body = data as {
                enfrentamientos: Enfrentamiento[];
                ranking: RankingPreseleccionItem[];
                cortadosEn: number;
                totalCalificados: number;
            };
            return { ok: true, ...body };
        }

        const body = data as { error?: string; faltantes?: FaltantePreseleccion[] } | null;
        if (body?.faltantes) {
            return {
                ok: false,
                motivo: "FALTAN_CALIFICACIONES",
                error: body.error ?? "Faltan calificaciones de preselección.",
                faltantes: body.faltantes,
            };
        }
        return { ok: false, motivo: "ERROR", error: body?.error ?? "Ocurrió un error inesperado." };
    } catch (error) {
        console.error("Error al conectar con generar-top-bracket", error);
        return { ok: false, motivo: "ERROR", error: "No se pudo conectar con el servidor." };
    }
}

export type EnfrentamientoEnCurso = Enfrentamiento & {
    yaCalifique: boolean;
    calificacionesRecibidas: number;
    juecesActivos: number;
};

export function getBatallasEnCurso() {
    return adminFetch<{ enfrentamientos: EnfrentamientoEnCurso[] }>("/api/competencia/enfrentamientos/en-curso");
}

export type PuntajesCalificacion = {
    tecnicaA: number;
    ejecucionA: number;
    vocabularioA: number;
    musicalidadA: number;
    originalidadA: number;
    tecnicaB: number;
    ejecucionB: number;
    vocabularioB: number;
    musicalidadB: number;
    originalidadB: number;
};

export type ResultadoCalificacion =
    | { completo: false; faltan: number }
    | { completo: true; empatado: true; numeroDesempate: number }
    | { completo: true; empatado: false; ganadorId: string };

export function calificarEnfrentamiento(id: string, puntajes: PuntajesCalificacion) {
    return adminFetch<ResultadoCalificacion>(`/api/competencia/enfrentamientos/${id}/calificar`, {
        method: "POST",
        body: JSON.stringify(puntajes),
    });
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

export function cortarTurno(id: string, turno: "A" | "B") {
    return adminFetch<{ enfrentamiento: Enfrentamiento }>(`/api/competencia/enfrentamientos/${id}/cortar-turno`, {
        method: "POST",
        body: JSON.stringify({ turno }),
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

export function bloquearAcceso(qrToken: string, bloquear: boolean) {
    return adminFetch<{ ok: true; id: string } & DatosPersonaStaff & DetallePaqueteStaff>("/api/access/bloquear", {
        method: "POST",
        body: JSON.stringify({ qrToken, bloquear }),
    });
}
