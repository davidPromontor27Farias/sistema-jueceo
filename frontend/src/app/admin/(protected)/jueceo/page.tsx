"use client";

import { useEffect, useState } from "react";
import { RequireRol } from "../layout";
import { useAdminSession } from "../../AdminSessionContext";
import { CATEGORIAS, type Categoria } from "@/config/catalog";
import {
    calificarEnfrentamiento,
    calificarPreseleccion,
    getBatallasEnCurso,
    getCategoriasEstado,
    getParticipantesPreseleccion,
    getTurnoPreseleccionActual,
    type CompetidorResumen,
    type EnfrentamientoEnCurso,
    type ParticipantePreseleccion,
    type PuntajesCalificacion,
    type PuntajesPreseleccion,
    type ResultadoCalificacion,
    type TurnoPreseleccion,
} from "@/lib/adminApi";
import { calcularLimites, DURACION_TURNO_MS } from "../../../pantalla/SecuenciaBatalla";
import { DURACION_PRESENTACION_PRESELECCION_MS } from "../../../pantalla/SecuenciaPreseleccion";

// Los 5 criterios del reglamento (Artículo 35), 20% cada uno, escala 1-5.
const CRITERIOS_BASE = ["tecnica", "ejecucion", "vocabulario", "musicalidad", "originalidad"] as const;
const LABEL_CRITERIO: Record<(typeof CRITERIOS_BASE)[number], string> = {
    tecnica: "Técnica",
    ejecucion: "Ejecución",
    vocabulario: "Vocabulario",
    musicalidad: "Musicalidad",
    originalidad: "Originalidad",
};

// 0 = todavía sin seleccionar; el juez debe tocar una estrella para cada
// criterio antes de poder enviar (ver `todosCalificados`).
const PUNTAJES_INICIALES: PuntajesCalificacion = {
    tecnicaA: 0,
    ejecucionA: 0,
    vocabularioA: 0,
    musicalidadA: 0,
    originalidadA: 0,
    tecnicaB: 0,
    ejecucionB: 0,
    vocabularioB: 0,
    musicalidadB: 0,
    originalidadB: 0,
};

export default function AdminJueceoPage() {
    return (
        <RequireRol roles={["JUEZ"]}>
            <JueceoContenido />
        </RequireRol>
    );
}

function JueceoContenido() {
    const { admin } = useAdminSession();
    const [batallas, setBatallas] = useState<EnfrentamientoEnCurso[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [categoriasPreseleccion, setCategoriasPreseleccion] = useState<Categoria[]>([]);

    const cargar = () => {
        getBatallasEnCurso().then((resp) => {
            if (resp.ok) {
                setBatallas(resp.data.enfrentamientos);
                setError(null);
            } else {
                setError(resp.error);
            }
        });
    };

    useEffect(() => {
        cargar();
        const id = setInterval(cargar, 3000);
        return () => clearInterval(id);
    }, []);

    // Categorías que están en fase de Preselección ahora mismo: se muestran
    // arriba de las batallas 1v1, cada una con su propia cola de participantes
    // pendientes de puntuar (ver PreseleccionCategoria).
    useEffect(() => {
        let cancelado = false;
        const poll = async () => {
            const resp = await getCategoriasEstado();
            if (cancelado || !resp.ok) return;
            setCategoriasPreseleccion(
                resp.data.categorias
                    .filter((c) => c.estatus === "PRESELECCION" || c.estatus === "REPECHAJE_DESEMPATE")
                    .map((c) => c.categoria),
            );
        };
        poll();
        const id = setInterval(poll, 5000);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, []);

    const pendientes = (batallas ?? []).filter((b) => !b.yaCalifique && b.competidorA && b.competidorB);
    const esperando = (batallas ?? []).filter((b) => b.yaCalifique);

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Jueceo</h1>
            <p className="mt-1 text-boss-gray">Califica la batalla activa según los criterios del reglamento.</p>

            {categoriasPreseleccion.length > 0 && !admin?.escenarioId && (
                <div className="mt-6 rounded-lg border border-yellow-500/40 bg-yellow-950/20 p-5">
                    <p className="text-yellow-300">
                        Tu cuenta no tiene un escenario asignado — contacta al administrador para que te asigne uno
                        en <span className="text-white">Usuarios</span> antes de poder calificar la preselección.
                    </p>
                </div>
            )}

            {admin?.escenarioId &&
                categoriasPreseleccion.map((categoria) => (
                    <PreseleccionCategoria key={categoria} categoria={categoria} escenarioId={admin.escenarioId!} />
                ))}

            {error && <p className="mt-4 text-sm font-medium text-red-400">{error}</p>}

            {batallas === null && <p className="mt-6 text-boss-gray">Cargando...</p>}

            {batallas !== null && pendientes.length === 0 && esperando.length === 0 && (
                <p className="mt-6 text-boss-gray">Esperando la siguiente batalla...</p>
            )}

            {esperando.map((b) => (
                <div key={b.id} className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
                    <p className="font-display text-lg uppercase tracking-wide text-white">
                        {CATEGORIAS[b.categoria]} — {b.ronda}
                    </p>
                    <p className="mt-2 text-boss-gray">
                        Ya calificaste esta batalla. Esperando a los demás jueces ({b.calificacionesRecibidas} de{" "}
                        {b.juecesActivos}).
                    </p>
                </div>
            ))}

            {pendientes.map((b) => (
                // La key incluye numeroDesempate para que el formulario
                // remonte limpio (estrellas en cero) cuando arranca la
                // ronda de desempate, en vez de seguir mostrando la
                // pantalla de "ya enviado" de la ronda anterior.
                <FormularioCalificacion key={`${b.id}-${b.numeroDesempate}`} enfrentamiento={b} onCalificado={cargar} />
            ))}
        </div>
    );
}

const PUNTAJES_PRESELECCION_INICIALES: PuntajesPreseleccion = {
    tecnica: 0,
    ejecucion: 0,
    vocabulario: 0,
    musicalidad: 0,
    originalidad: 0,
};

// Una categoría en fase de Preselección: sincronizada con quien está en
// tarima ahora mismo (mismo turno que se ve en /pantalla) en vez de dejar que
// el juez recorra una lista libre a su propio ritmo — el proceso es igual
// que una batalla 1v1, pero en solitario.
function PreseleccionCategoria({ categoria, escenarioId }: { categoria: Categoria; escenarioId: string }) {
    const [participantes, setParticipantes] = useState<ParticipantePreseleccion[] | null>(null);
    const [turno, setTurno] = useState<TurnoPreseleccion>(null);
    const [error, setError] = useState<string | null>(null);

    const cargar = () => {
        Promise.all([
            getParticipantesPreseleccion(categoria, escenarioId),
            getTurnoPreseleccionActual(categoria, escenarioId),
        ]).then(([respParticipantes, respTurno]) => {
            if (respParticipantes.ok) {
                setParticipantes(respParticipantes.data.participantes);
                setError(null);
            } else {
                setError(respParticipantes.error);
            }
            if (respTurno.ok) setTurno(respTurno.data.turno);
        });
    };

    useEffect(() => {
        cargar();
        const id = setInterval(cargar, 3000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoria, escenarioId]);

    // El turno-actual es público (no sabe quién pregunta), así que para saber
    // si YO ya lo califiqué hay que cruzarlo con la lista de participantes
    // (esa sí trae yaCalifique por juez, ver GET /preseleccion/participantes).
    const enTarima = turno?.participante
        ? (participantes ?? []).find((p) => p.id === turno.participante!.id) ?? null
        : null;

    return (
        <div className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
            <p className="font-display text-lg uppercase tracking-wide text-white">Preselección — {CATEGORIAS[categoria]}</p>

            {error && <p className="mt-2 text-sm font-medium text-red-400">{error}</p>}

            {participantes === null && <p className="mt-2 text-boss-gray">Cargando...</p>}

            {participantes !== null && !enTarima && (
                <p className="mt-2 text-boss-gray">Esperando a que el staff suba al siguiente competidor a tarima.</p>
            )}

            {enTarima && enTarima.yaCalifique && (
                <p className="mt-2 text-boss-gray">Ya calificaste a {nombreParticipante(enTarima)}. Esperando al siguiente.</p>
            )}

            {enTarima && !enTarima.yaCalifique && (
                <FormularioPreseleccion
                    key={enTarima.id}
                    participante={enTarima}
                    iniciadoEn={turno!.iniciadoEn}
                    onCalificado={cargar}
                />
            )}
        </div>
    );
}

function nombreParticipante(p: ParticipantePreseleccion): string {
    return p.nombreArtistico || `${p.nombres} ${p.apellidos}`;
}

// Un participante a la vez, con guardado inmediato por request (no hay envío
// por lote): si la conexión falla a mitad del evento, todo lo ya calificado
// queda persistido en el servidor y solo se pierde el intento actual, que se
// puede reintentar sin perder nada más.
function FormularioPreseleccion({
    participante,
    iniciadoEn,
    onCalificado,
}: {
    participante: ParticipantePreseleccion;
    iniciadoEn: string;
    onCalificado: () => void;
}) {
    const [puntajes, setPuntajes] = useState<PuntajesPreseleccion>(PUNTAJES_PRESELECCION_INICIALES);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ahora, setAhora] = useState(() => Date.now());

    // El botón de enviar se habilita hasta que termina el turno del
    // competidor (presentación + 1 minuto en tarima) — las estrellas sí se
    // pueden ir marcando desde antes, solo el envío espera.
    useEffect(() => {
        const id = setInterval(() => setAhora(Date.now()), 500);
        return () => clearInterval(id);
    }, []);
    const presentacionTerminada = ahora - new Date(iniciadoEn).getTime() >= DURACION_PRESENTACION_PRESELECCION_MS + DURACION_TURNO_MS;

    const setValor = (campo: keyof PuntajesPreseleccion, valor: number) => {
        setPuntajes((prev) => ({ ...prev, [campo]: valor }));
    };

    const todosCalificados = Object.values(puntajes).every((v) => v >= 1);

    const enviar = async () => {
        setEnviando(true);
        setError(null);
        const resp = await calificarPreseleccion(participante.id, puntajes);
        setEnviando(false);
        if (!resp.ok) {
            setError(resp.error);
            return;
        }
        setPuntajes(PUNTAJES_PRESELECCION_INICIALES);
        onCalificado();
    };

    return (
        <div className="mt-4 rounded-md border border-boss-border p-4">
            <p className="mb-3 text-center font-display text-base uppercase text-white">{nombreParticipante(participante)}</p>

            {error && <p className="mb-2 text-center text-sm font-medium text-red-400">{error}</p>}

            <div className="space-y-4">
                {CRITERIOS_BASE.map((criterio) => (
                    <div key={criterio} className="flex items-center justify-between gap-3">
                        <span className="text-2xl font-semibold text-boss-gray">{LABEL_CRITERIO[criterio]}</span>
                        <EstrellasCalificacion valor={puntajes[criterio]} onCambio={(v) => setValor(criterio, v)} />
                    </div>
                ))}
            </div>

            {!presentacionTerminada && (
                <p className="mt-3 text-center text-sm text-boss-gray">Espera a que termine la presentación para poder enviar.</p>
            )}
            {presentacionTerminada && !todosCalificados && (
                <p className="mt-3 text-center text-sm text-boss-gray">
                    Selecciona una calificación de 1 a 5 estrellas en cada criterio para poder enviar.
                </p>
            )}

            <button
                type="button"
                onClick={enviar}
                disabled={enviando || !todosCalificados || !presentacionTerminada}
                className="mt-4 w-full rounded-md bg-boss-red px-4 py-3 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
                {enviando ? "Guardando..." : "Guardar y siguiente"}
            </button>
        </div>
    );
}

function nombreCompetidor(c: CompetidorResumen): string {
    if (!c) return "";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

function FormularioCalificacion({
    enfrentamiento,
    onCalificado,
}: {
    enfrentamiento: EnfrentamientoEnCurso;
    onCalificado: () => void;
}) {
    const [puntajes, setPuntajes] = useState<PuntajesCalificacion>(PUNTAJES_INICIALES);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultado, setResultado] = useState<ResultadoCalificacion | null>(null);
    const [ahora, setAhora] = useState(() => Date.now());

    // Igual que en Preselección: el envío espera a que AMBOS competidores
    // (A y B) terminen su turno en tarima — las estrellas se pueden ir
    // marcando desde antes.
    useEffect(() => {
        const id = setInterval(() => setAhora(Date.now()), 500);
        return () => clearInterval(id);
    }, []);
    const { finTurnoB } = calcularLimites(enfrentamiento);
    const presentacionTerminada = ahora - new Date(enfrentamiento.updatedAt).getTime() >= finTurnoB;

    const setValor = (campo: keyof PuntajesCalificacion, valor: number) => {
        setPuntajes((prev) => ({ ...prev, [campo]: valor }));
    };

    const todosCalificados = Object.values(puntajes).every((v) => v >= 1);

    const enviar = async () => {
        setEnviando(true);
        setError(null);
        const resp = await calificarEnfrentamiento(enfrentamiento.id, puntajes);
        setEnviando(false);
        if (!resp.ok) {
            setError(resp.error);
            return;
        }
        setResultado(resp.data);
        onCalificado();
    };

    if (resultado) {
        return (
            <div className="mt-6 rounded-lg border border-boss-green/40 bg-boss-green/10 p-5 text-center">
                {!resultado.completo && (
                    <p className="text-boss-green">Calificación enviada. Faltan {resultado.faltan} juez(es).</p>
                )}
                {resultado.completo && resultado.empatado && (
                    <p className="text-boss-green">
                        ¡Empate! Se lanza automáticamente la ronda de desempate {resultado.numeroDesempate} —
                        prepárense para calificar de nuevo.
                    </p>
                )}
                {resultado.completo && !resultado.empatado && (
                    <p className="text-boss-green">Calificación enviada. Ganador decidido.</p>
                )}
            </div>
        );
    }

    return (
        <div className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
            <p className="font-display text-lg uppercase tracking-wide text-white">
                {CATEGORIAS[enfrentamiento.categoria]} — {enfrentamiento.ronda}
            </p>

            {error && <p className="mt-2 text-sm font-medium text-red-400">{error}</p>}

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <ColumnaCompetidor
                    titulo={nombreCompetidor(enfrentamiento.competidorA)}
                    sufijo="A"
                    puntajes={puntajes}
                    onCambio={setValor}
                />
                <ColumnaCompetidor
                    titulo={nombreCompetidor(enfrentamiento.competidorB)}
                    sufijo="B"
                    puntajes={puntajes}
                    onCambio={setValor}
                />
            </div>

            {!presentacionTerminada && (
                <p className="mt-3 text-center text-sm text-boss-gray">Espera a que termine la presentación para poder enviar.</p>
            )}
            {presentacionTerminada && !todosCalificados && (
                <p className="mt-3 text-center text-sm text-boss-gray">
                    Selecciona una calificación de 1 a 5 estrellas en cada criterio para poder enviar.
                </p>
            )}

            <button
                type="button"
                onClick={enviar}
                disabled={enviando || !todosCalificados || !presentacionTerminada}
                className="mt-5 w-full rounded-md bg-boss-red px-4 py-3 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
                {enviando ? "Enviando..." : "Enviar calificación"}
            </button>
        </div>
    );
}

function ColumnaCompetidor({
    titulo,
    sufijo,
    puntajes,
    onCambio,
}: {
    titulo: string;
    sufijo: "A" | "B";
    puntajes: PuntajesCalificacion;
    onCambio: (campo: keyof PuntajesCalificacion, valor: number) => void;
}) {
    return (
        <div className="rounded-md border border-boss-border p-4">
            <p className="mb-3 text-center font-display text-base uppercase text-white">{titulo}</p>
            <div className="space-y-4">
                {CRITERIOS_BASE.map((criterio) => {
                    const campo = `${criterio}${sufijo}` as keyof PuntajesCalificacion;
                    return (
                        <div key={campo} className="flex items-center justify-between gap-3">
                            <span className="text-2xl font-semibold text-boss-gray">{LABEL_CRITERIO[criterio]}</span>
                            <EstrellasCalificacion valor={puntajes[campo]} onCambio={(v) => onCambio(campo, v)} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EstrellasCalificacion({ valor, onCambio }: { valor: number; onCambio: (valor: number) => void }) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((estrella) => (
                <button
                    key={estrella}
                    type="button"
                    onClick={() => onCambio(estrella)}
                    aria-label={`${estrella} estrella${estrella > 1 ? "s" : ""}`}
                    aria-pressed={valor >= estrella}
                    className="p-0.5 text-2xl leading-none transition-colors"
                >
                    <span className={valor >= estrella ? "text-boss-red" : "text-boss-border"}>★</span>
                </button>
            ))}
        </div>
    );
}
