"use client";

import { useEffect, useState } from "react";
import { RequireRol } from "../layout";
import { CATEGORIAS, type Categoria } from "@/config/catalog";
import {
    cortarTurno,
    generarBracket,
    generarTopBracket,
    getBatallasEnCurso,
    getCategoriasEstado,
    getEnfrentamientos,
    getEscenariosDeCategoria,
    getPantallaEstado,
    getResultadosPreseleccion,
    getTurnoPreseleccionActual,
    iniciarPreseleccion,
    patchCategoriaEstado,
    patchPantallaEstado,
    siguienteTurnoPreseleccion,
    updateEnfrentamiento,
    type CategoriaEstado,
    type CompetidorResumen,
    type Enfrentamiento,
    type EnfrentamientoEnCurso,
    type EstatusCompetencia,
    type EstatusEnfrentamiento,
    type ParticipanteEmpatado,
    type PantallaEstado,
    type ResultadoPreseleccionItem,
    type TurnoPreseleccion,
} from "@/lib/adminApi";
import { useSecuenciaBatalla, type EstadoSecuencia } from "../../../pantalla/SecuenciaBatalla";

const ESTATUS_CATEGORIA_LABEL: Record<EstatusCompetencia, string> = {
    NO_INICIADA: "No iniciada",
    PRESELECCION: "Preselección",
    REPECHAJE_DESEMPATE: "Repechaje (desempate)",
    EN_CURSO: "En curso",
    FINALIZADA: "Finalizada",
};
// Destinos que el admin puede elegir a mano en el selector de abajo.
// PRESELECCION se arranca con su propio botón ("Iniciar preselección", reparte
// a los competidores por escenario) y REPECHAJE_DESEMPATE lo controla el
// sistema solo ante un empate en la frontera de corte — ninguno de los dos es
// un destino manual válido (el backend los rechaza).
const ESTATUS_CATEGORIA_OPCIONES: EstatusCompetencia[] = ["NO_INICIADA", "EN_CURSO", "FINALIZADA"];

const ESTATUS_ENFRENTAMIENTO_LABEL: Record<EstatusEnfrentamiento, string> = {
    PENDIENTE: "Pendiente",
    EN_CURSO: "En curso",
    FINALIZADO: "Finalizado",
};

export default function AdminCompetenciaPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN", "STAFF_JUECEO"]}>
            <CompetenciaContenido />
        </RequireRol>
    );
}

function CompetenciaContenido() {
    const [categorias, setCategorias] = useState<CategoriaEstado[] | null>(null);
    const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<Categoria | null>(null);
    const [pantallaEstado, setPantallaEstado] = useState<PantallaEstado | null>(null);
    const [error, setError] = useState<string | null>(null);

    const cargarCategorias = async () => {
        const resultado = await getCategoriasEstado();
        if (resultado.ok) {
            setCategorias(resultado.data.categorias);
            setError(null);
        } else {
            setError(resultado.error);
        }
    };

    // Poll (no solo carga inicial): así el panel se autocorrige solo si el
    // estatus de una categoría cambia "por detrás" de este componente — ej.
    // al generar el Top Bracket desde PanelPreseleccion, que ya deja la
    // categoría en EN_CURSO en el backend — sin esto, el admin se quedaba
    // viendo el panel de Preselección (con el botón ya inútil, la categoría
    // ya no acepta otro bracket) hasta refrescar la página a mano.
    useEffect(() => {
        let cancelado = false;
        const poll = async () => {
            const resultado = await getCategoriasEstado();
            if (cancelado) return;
            if (resultado.ok) {
                setCategorias(resultado.data.categorias);
                setError(null);
            } else {
                setError(resultado.error);
            }
        };
        poll();
        const id = setInterval(poll, 4000);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, []);

    useEffect(() => {
        let cancelado = false;
        getPantallaEstado().then((resPantalla) => {
            if (cancelado) return;
            if (resPantalla.ok) {
                setPantallaEstado(resPantalla.data.estado);
                setCategoriaSeleccionada((actual) => actual ?? resPantalla.data.estado.categoriaEnfocada);
            }
        });
        return () => {
            cancelado = true;
        };
    }, []);

    // Al pasar una categoría a "En curso" por primera vez, se genera el
    // bracket solo (sorteo con los competidores pagados) — ya no hace falta
    // el botón aparte de "Generar bracket". Si la categoría ya tenía un
    // bracket (ej. se estaba reanudando después de pasarla a "No iniciada"),
    // generarBracket responde con el error de "ya existen enfrentamientos" y
    // ahí solo se actualiza el estatus normal, sin tocar el bracket existente.
    const cambiarEstatus = async (categoria: Categoria, estatus: EstatusCompetencia) => {
        setError(null);

        if (estatus === "EN_CURSO") {
            const resultadoBracket = await generarBracket(categoria);
            if (resultadoBracket.ok) {
                cargarCategorias();
                return;
            }
            if (!resultadoBracket.error.includes("Ya existen enfrentamientos")) {
                setError(resultadoBracket.error);
                return;
            }
        }

        const resultado = await patchCategoriaEstado(categoria, estatus);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        cargarCategorias();
    };

    // Arranca la Preselección: reparte a los competidores pagados en lotes
    // proporcionales por orden de registro entre los escenarios que tengan
    // al menos un juez activo asignado (ver Preselección Paralela
    // Multiescenario). Reemplaza el viejo cambiarEstatus(categoria,
    // "PRESELECCION"), que el backend ya no acepta.
    const iniciarPreseleccionCategoria = async (categoria: Categoria) => {
        setError(null);
        const resultado = await iniciarPreseleccion(categoria);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        cargarCategorias();
    };

    // Antes había que enfocar la categoría en Control de pantallas Y
    // seleccionarla aquí para trabajarla — dos pasos para lo mismo. Ahora,
    // elegir una categoría aquí también la enfoca en la pantalla pública de
    // una vez (respetando la vista que ya esté activa: Brackets,
    // Enfrentamientos, etc. — solo cambia CUÁL categoría, no QUÉ vista).
    const seleccionarCategoria = async (categoria: Categoria) => {
        setCategoriaSeleccionada(categoria);
        const vista = pantallaEstado?.vista ?? "ENFRENTAMIENTOS";
        const resultado = await patchPantallaEstado({ vista, categoriaEnfocada: categoria });
        if (resultado.ok) {
            setPantallaEstado(resultado.data.estado);
        }
    };

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Control de competencia</h1>
            <p className="mt-1 text-boss-gray">
                Arranca cada categoría y captura sus enfrentamientos y resultados. Al elegir una categoría también se
                enfoca de una vez en la pantalla pública — ya no hace falta repetirlo en Control de pantallas.
            </p>

            {error && (
                <p className="mt-4 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300">
                    {error}
                </p>
            )}

            <div className="mt-6 space-y-2">
                {categorias === null && <p className="text-boss-gray">Cargando...</p>}
                {categorias?.map((c) => (
                    <div
                        key={c.categoria}
                        className={[
                            "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
                            categoriaSeleccionada === c.categoria
                                ? "border-boss-red bg-boss-red/10"
                                : "border-boss-border bg-boss-panel/60",
                        ].join(" ")}
                    >
                        <button
                            type="button"
                            onClick={() => seleccionarCategoria(c.categoria)}
                            className="flex items-center gap-2 text-left font-medium text-white hover:text-boss-red"
                        >
                            {c.label}
                            {pantallaEstado?.categoriaEnfocada === c.categoria && (
                                <span className="flex items-center gap-1 rounded-full bg-boss-green/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-boss-green">
                                    <span className="h-1.5 w-1.5 rounded-full bg-boss-green" />
                                    En pantalla
                                </span>
                            )}
                        </button>

                        {c.estatus === "NO_INICIADA" && (
                            <button
                                type="button"
                                onClick={() => iniciarPreseleccionCategoria(c.categoria)}
                                className="rounded-md border border-boss-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-red hover:text-boss-red"
                            >
                                Iniciar preselección
                            </button>
                        )}

                        <select
                            value={c.estatus}
                            onChange={(e) => cambiarEstatus(c.categoria, e.target.value as EstatusCompetencia)}
                            className="rounded-md border border-boss-border bg-boss-black px-2 py-1.5 text-sm text-foreground"
                        >
                            {!ESTATUS_CATEGORIA_OPCIONES.includes(c.estatus) && (
                                <option value={c.estatus} disabled>
                                    {ESTATUS_CATEGORIA_LABEL[c.estatus]}
                                </option>
                            )}
                            {ESTATUS_CATEGORIA_OPCIONES.map((estatus) => (
                                <option key={estatus} value={estatus}>
                                    {ESTATUS_CATEGORIA_LABEL[estatus]}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>

            {categoriaSeleccionada &&
                (() => {
                    const estatusSeleccionada = categorias?.find((c) => c.categoria === categoriaSeleccionada)?.estatus;
                    return estatusSeleccionada === "PRESELECCION" || estatusSeleccionada === "REPECHAJE_DESEMPATE" ? (
                        <PanelPreseleccion categoria={categoriaSeleccionada} estatus={estatusSeleccionada} />
                    ) : (
                        <PanelEnfrentamientos categoria={categoriaSeleccionada} />
                    );
                })()}
        </div>
    );
}

// Ranking combinado en vivo de la fase de Preselección: cada juez puntúa
// individualmente a cada competidor pagado DENTRO DE SU PROPIO ESCENARIO (ver
// admin/jueceo y Preselección Paralela Multiescenario) — acá el admin ve un
// sub-panel de turno por cada escenario activo, más el ranking combinado de
// toda la categoría, y cuando todos ya calificaron corta el Top N automático
// (potencia de 2 más grande que no exceda el total calificado) con un clic.
// Si hay un empate exacto en la frontera de corte, el backend ya lanza solo
// la ronda extra de repechaje — no hay ninguna selección manual que hacer
// acá, solo informar quiénes van a repetir presentación.
function PanelPreseleccion({ categoria, estatus }: { categoria: Categoria; estatus: EstatusCompetencia }) {
    const [escenarios, setEscenarios] = useState<{ id: string; nombre: string; orden: number }[] | null>(null);
    const [resultados, setResultados] = useState<ResultadoPreseleccionItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [generando, setGenerando] = useState(false);
    const [empatados, setEmpatados] = useState<ParticipanteEmpatado[] | null>(null);

    useEffect(() => {
        let cancelado = false;
        const poll = async () => {
            const [resEscenarios, resResultados] = await Promise.all([
                getEscenariosDeCategoria(categoria),
                getResultadosPreseleccion(categoria),
            ]);
            if (cancelado) return;
            if (resEscenarios.ok) setEscenarios(resEscenarios.data.escenarios);
            if (resResultados.ok) {
                setResultados(resResultados.data.resultados);
                setError(null);
            } else {
                setError(resResultados.error);
            }
        };
        poll();
        const id = setInterval(poll, 4000);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoria]);

    const ordenados = [...(resultados ?? [])].sort((a, b) => (b.puntajeTotal ?? -1) - (a.puntajeTotal ?? -1));
    const faltanPorCalificar = ordenados.filter((p) => !p.completo);
    const listoParaGenerar = resultados !== null && resultados.length >= 4 && faltanPorCalificar.length === 0;

    const generar = async () => {
        setGenerando(true);
        setError(null);
        setEmpatados(null);
        const resultado = await generarTopBracket(categoria);
        setGenerando(false);

        if (resultado.ok) return;
        if (resultado.motivo === "REPECHAJE_DESEMPATE") {
            setEmpatados(resultado.empatados);
            return;
        }
        setError(resultado.error);
    };

    return (
        <div className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
            <h2 className="font-display text-lg uppercase tracking-wide text-white">
                {estatus === "REPECHAJE_DESEMPATE" ? "Repechaje de desempate — " : "Preselección — "}
                {CATEGORIAS[categoria]}
            </h2>
            <p className="mt-1 text-sm text-boss-gray">
                {estatus === "REPECHAJE_DESEMPATE"
                    ? "Hay un empate exacto en la frontera del corte. Los competidores empatados vuelven a presentarse, uno a uno, en su mismo escenario de origen — se resuelve solo en cuanto los jueces de ese escenario terminen de recalificarlos, sin necesidad de ninguna acción manual."
                    : "Cada juez puntúa individualmente a cada competidor pagado, dentro de su propio escenario. El corte automático toma la potencia de 2 más grande (4/8/16/32/64) que no exceda el total calificado, con seeding: mejor puntaje contra peor puntaje."}
            </p>

            {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}

            {escenarios === null && <p className="mt-4 text-boss-gray">Cargando escenarios...</p>}
            {escenarios !== null && escenarios.length === 0 && (
                <p className="mt-4 text-boss-gray">Esta categoría todavía no tiene escenarios asignados.</p>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {escenarios?.map((esc) => (
                    <TurnoEscenarioPanel key={esc.id} categoria={categoria} escenarioId={esc.id} escenarioNombre={esc.nombre} />
                ))}
            </div>

            {resultados !== null && (
                <div className="mt-6 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-boss-gray">Ranking combinado</p>
                    {ordenados.length === 0 && (
                        <p className="text-boss-gray">No hay competidores con pago confirmado en esta categoría.</p>
                    )}
                    {ordenados.map((p, i) => (
                        <div
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-boss-border px-3 py-2 text-sm"
                        >
                            <span className="text-white">
                                <span className="mr-2 text-boss-gray">#{i + 1}</span>
                                {p.nombreArtistico || `${p.nombres} ${p.apellidos}`}
                                <span className="ml-2 text-xs text-boss-gray">({p.escenarioNombre ?? "sin escenario"})</span>
                                {p.numeroDesempate > 0 && (
                                    <span className="ml-2 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] normal-case text-yellow-400">
                                        Repechaje {p.numeroDesempate}
                                    </span>
                                )}
                            </span>
                            <span className={p.completo ? "text-boss-green" : "text-boss-gray"}>
                                {p.puntajeTotal ?? "—"} pts · {p.calificacionesRecibidas}/{p.juecesActivos} jueces
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {empatados && (
                <div className="mt-5 rounded-md border border-yellow-500/40 bg-yellow-950/20 p-4">
                    <p className="text-sm font-medium text-yellow-300">
                        Empate exacto en la frontera de corte — se lanzó automáticamente una ronda extra para:
                    </p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-white">
                        {empatados.map((e) => (
                            <li key={e.id}>
                                {e.nombre} — {e.puntajeTotal} pts
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-xs text-boss-gray">
                        Se resuelve solo en cuanto los jueces de su escenario los recalifiquen — no hace falta que hagas
                        nada más aquí.
                    </p>
                </div>
            )}

            <button
                type="button"
                onClick={generar}
                disabled={generando || !listoParaGenerar}
                className="mt-5 w-full rounded-md bg-boss-red px-4 py-3 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
                {generando
                    ? "Generando..."
                    : faltanPorCalificar.length > 0
                      ? `Faltan ${faltanPorCalificar.length} por calificar`
                      : "Generar Top Bracket"}
            </button>
        </div>
    );
}

// Un sub-panel de turno por escenario activo: quién está en tarima ahora
// mismo en ESE escenario, con su propio botón "Siguiente" (misma cola
// independiente, ver Preselección Paralela Multiescenario).
function TurnoEscenarioPanel({
    categoria,
    escenarioId,
    escenarioNombre,
}: {
    categoria: Categoria;
    escenarioId: string;
    escenarioNombre: string;
}) {
    const [turno, setTurno] = useState<TurnoPreseleccion>(null);
    const [avanzando, setAvanzando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelado = false;
        const poll = async () => {
            const resTurno = await getTurnoPreseleccionActual(categoria, escenarioId);
            if (!cancelado && resTurno.ok) setTurno(resTurno.data.turno);
        };
        poll();
        const id = setInterval(poll, 4000);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [categoria, escenarioId]);

    const avanzarTurno = async () => {
        setAvanzando(true);
        setError(null);
        const resultado = await siguienteTurnoPreseleccion(categoria, escenarioId);
        setAvanzando(false);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        setTurno(resultado.data.turno);
    };

    return (
        <div className="rounded-md border border-boss-border bg-boss-black/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-boss-gray">{escenarioNombre}</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                <p className="font-display text-lg uppercase text-white">
                    {turno?.participante
                        ? turno.participante.nombreArtistico || `${turno.participante.nombres} ${turno.participante.apellidos}`
                        : "— nadie —"}
                </p>
                <button
                    type="button"
                    onClick={avanzarTurno}
                    disabled={avanzando}
                    className="rounded-md bg-boss-red px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {avanzando ? "..." : "Siguiente"}
                </button>
            </div>
            {error && <p className="mt-2 text-xs font-medium text-red-400">{error}</p>}
        </div>
    );
}

function PanelEnfrentamientos({ categoria }: { categoria: Categoria }) {
    const [enfrentamientos, setEnfrentamientos] = useState<Enfrentamiento[] | null>(null);
    const [enCurso, setEnCurso] = useState<EnfrentamientoEnCurso[]>([]);
    const [error, setError] = useState<string | null>(null);

    const cargar = async () => {
        const [resEnfrentamientos, resEnCurso] = await Promise.all([getEnfrentamientos(categoria), getBatallasEnCurso()]);
        if (resEnfrentamientos.ok) {
            setEnfrentamientos(resEnfrentamientos.data.enfrentamientos);
        } else {
            setError(resEnfrentamientos.error);
        }
        if (resEnCurso.ok) {
            setEnCurso(resEnCurso.data.enfrentamientos);
        }
    };

    // Se sondea cada 3s (no solo al montar) para que el cronómetro de
    // "cortar turno" avance en vivo y detecte el corte apenas se registre —
    // ver la sección de recorte en BotonCortarTurno / useSecuenciaBatalla.
    useEffect(() => {
        let cancelado = false;
        const poll = async () => {
            const [resEnfrentamientos, resEnCurso] = await Promise.all([
                getEnfrentamientos(categoria),
                getBatallasEnCurso(),
            ]);
            if (cancelado) return;
            if (resEnfrentamientos.ok) {
                setEnfrentamientos(resEnfrentamientos.data.enfrentamientos);
            } else {
                setError(resEnfrentamientos.error);
            }
            if (resEnCurso.ok) {
                setEnCurso(resEnCurso.data.enfrentamientos);
            }
        };
        poll();
        const id = setInterval(poll, 3000);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [categoria]);

    const progresoPorId = new Map(enCurso.map((e) => [e.id, e]));

    // Mismo cronómetro que ve la pantalla pública para la batalla en curso de
    // esta categoría: permite mostrar el botón de "cortar turno" justo en la
    // tarjeta del enfrentamiento, sin tener que ir a Control de pantallas.
    const secuencia = useSecuenciaBatalla(enfrentamientos ?? []);

    const marcarGanador = async (enfrentamientoId: string, ganadorId: string) => {
        const resultado = await updateEnfrentamiento(enfrentamientoId, { ganadorId, estatus: "FINALIZADO" });
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        cargar();
    };

    const iniciarBatalla = async (enfrentamientoId: string) => {
        const resultado = await updateEnfrentamiento(enfrentamientoId, { estatus: "EN_CURSO" });
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        cargar();
    };

    const rondas = Array.from(new Set((enfrentamientos ?? []).map((e) => e.rondaNumero))).sort((a, b) => a - b);

    return (
        <div className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
            <h2 className="font-display text-lg uppercase tracking-wide text-white">
                Enfrentamientos — {CATEGORIAS[categoria]}
            </h2>

            {error && <p className="mt-2 text-sm font-medium text-red-400">{error}</p>}

            <div className="mt-5 space-y-6">
                {enfrentamientos === null && <p className="text-boss-gray">Cargando...</p>}
                {enfrentamientos?.length === 0 && (
                    <p className="text-boss-gray">
                        Todavía no hay enfrentamientos para esta categoría — cambia su estatus a &quot;En curso&quot; arriba
                        para generar el bracket.
                    </p>
                )}
                {rondas.map((numeroRonda) => {
                    const deEstaRonda = (enfrentamientos ?? []).filter((e) => e.rondaNumero === numeroRonda);
                    const nombre = deEstaRonda[0]?.ronda ?? `Ronda ${numeroRonda}`;
                    return (
                        <div key={numeroRonda}>
                            <h3 className="mb-2 font-display text-sm uppercase tracking-widest text-boss-red">{nombre}</h3>
                            <div className="space-y-3">
                                {deEstaRonda.map((enf) => {
                                    const esBye = !enf.competidorB && !!enf.ganador;
                                    const progreso = progresoPorId.get(enf.id);
                                    const puedeIniciar = enf.estatus === "PENDIENTE" && !esBye;

                                    return (
                                        <div key={enf.id} className="rounded-md border border-boss-border p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-sm font-semibold uppercase tracking-wide text-boss-gray">
                                                    {ESTATUS_ENFRENTAMIENTO_LABEL[enf.estatus]}
                                                    {enf.numeroDesempate > 0 && (
                                                        <span className="ml-2 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] normal-case text-yellow-400">
                                                            Ronda de desempate {enf.numeroDesempate}
                                                        </span>
                                                    )}
                                                    {progreso && (
                                                        <span className="ml-2 normal-case text-boss-gray">
                                                            · {progreso.calificacionesRecibidas} de {progreso.juecesActivos} jueces
                                                            calificaron
                                                        </span>
                                                    )}
                                                </p>
                                                {puedeIniciar && (
                                                    <button
                                                        type="button"
                                                        onClick={() => iniciarBatalla(enf.id)}
                                                        className="rounded-md border border-boss-red px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-boss-red transition-colors hover:bg-boss-red hover:text-white"
                                                    >
                                                        Iniciar batalla
                                                    </button>
                                                )}
                                            </div>

                                            <div className="mt-2 flex flex-wrap items-center gap-3">
                                                <span className="text-sm text-white">
                                                    {nombreOMostrar(enf.competidorA)}
                                                    {enf.ganador?.id === enf.competidorA?.id && " 🏆"}
                                                </span>
                                                {esBye ? (
                                                    <span className="text-sm text-boss-gray">BYE — pase directo</span>
                                                ) : (
                                                    <>
                                                        <span className="text-boss-gray">vs</span>
                                                        <span className="text-sm text-white">
                                                            {nombreOMostrar(enf.competidorB)}
                                                            {enf.ganador?.id === enf.competidorB?.id && " 🏆"}
                                                        </span>
                                                    </>
                                                )}
                                            </div>

                                            {secuencia.enfrentamiento?.id === enf.id && (
                                                <BotonCortarTurno
                                                    fase={secuencia.fase}
                                                    segundosRestantes={secuencia.segundosRestantes}
                                                    enfrentamiento={enf}
                                                />
                                            )}

                                            {!esBye && enf.estatus !== "FINALIZADO" && (
                                                <details className="mt-3">
                                                    <summary className="cursor-pointer text-xs uppercase tracking-wide text-boss-gray hover:text-boss-red">
                                                        Respaldo manual (forzar resultado sin esperar a los jueces)
                                                    </summary>
                                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                                        <BotonCompetidor
                                                            competidor={enf.competidorA}
                                                            esGanador={enf.ganador?.id === enf.competidorA?.id}
                                                            onElegir={() => enf.competidorA && marcarGanador(enf.id, enf.competidorA.id)}
                                                        />
                                                        <span className="text-boss-gray">vs</span>
                                                        <BotonCompetidor
                                                            competidor={enf.competidorB}
                                                            esGanador={enf.ganador?.id === enf.competidorB?.id}
                                                            onElegir={() => enf.competidorB && marcarGanador(enf.id, enf.competidorB.id)}
                                                        />
                                                    </div>
                                                </details>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Le da al SUPER_ADMIN/STAFF_JUECEO el mismo cronómetro que ve la pantalla
// pública, más un botón para cortar el turno del competidor en tabla antes de
// que se agote el tiempo (ej. terminó a los 45s de un turno de 60s) — así el
// contrincante no tiene que esperar el resto del cronómetro para pasar.
function BotonCortarTurno({
    fase,
    segundosRestantes,
    enfrentamiento,
}: {
    fase: EstadoSecuencia["fase"];
    segundosRestantes: number;
    enfrentamiento: Enfrentamiento;
}) {
    const [cortando, setCortando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const esTurnoDeA = fase === "turno_a";
    const esTurnoDeB = fase === "turno_b";
    if (!esTurnoDeA && !esTurnoDeB) return null;

    const competidorEnTurno = esTurnoDeA ? enfrentamiento.competidorA : enfrentamiento.competidorB;

    const onCortar = async () => {
        setCortando(true);
        setError(null);
        const resultado = await cortarTurno(enfrentamiento.id, esTurnoDeA ? "A" : "B");
        setCortando(false);
        if (!resultado.ok) {
            setError(resultado.error);
        }
    };

    return (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-boss-red/40 bg-boss-red/5 p-3">
            <p className="font-display text-2xl text-boss-red">{segundosRestantes}s</p>
            <button
                type="button"
                onClick={onCortar}
                disabled={cortando}
                className="rounded-md bg-boss-red px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark disabled:opacity-50"
            >
                {cortando ? "Cortando..." : `Cortar turno de ${nombreOMostrar(competidorEnTurno)}`}
            </button>
            {error && <p className="text-sm font-medium text-red-400">{error}</p>}
        </div>
    );
}

function nombreOMostrar(competidor: CompetidorResumen): string {
    if (!competidor) return "— sin asignar —";
    return competidor.nombreArtistico || `${competidor.nombres} ${competidor.apellidos}`;
}

function BotonCompetidor({
    competidor,
    esGanador,
    onElegir,
}: {
    competidor: CompetidorResumen;
    esGanador: boolean;
    onElegir: () => void;
}) {
    if (!competidor) {
        return <span className="text-boss-gray">— sin asignar —</span>;
    }

    return (
        <button
            type="button"
            onClick={onElegir}
            className={[
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                esGanador ? "border-boss-green bg-boss-green/10 text-boss-green" : "border-boss-border text-white hover:border-boss-red",
            ].join(" ")}
        >
            {competidor.nombreArtistico || `${competidor.nombres} ${competidor.apellidos}`}
            {esGanador && " 🏆"}
        </button>
    );
}
