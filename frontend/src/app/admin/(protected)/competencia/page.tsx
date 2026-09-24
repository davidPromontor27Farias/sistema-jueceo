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
    getPantallaEstado,
    getParticipantesPreseleccion,
    getTurnoPreseleccionActual,
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
    type ParticipantePreseleccion,
    type PantallaEstado,
    type TurnoPreseleccion,
} from "@/lib/adminApi";
import { useSecuenciaBatalla, type EstadoSecuencia } from "../../../pantalla/SecuenciaBatalla";

const ESTATUS_CATEGORIA_LABEL: Record<EstatusCompetencia, string> = {
    NO_INICIADA: "No iniciada",
    PRESELECCION: "Preselección",
    EN_CURSO: "En curso",
    FINALIZADA: "Finalizada",
};
const ESTATUS_CATEGORIA_OPCIONES: EstatusCompetencia[] = ["NO_INICIADA", "PRESELECCION", "EN_CURSO", "FINALIZADA"];

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

    useEffect(() => {
        let cancelado = false;
        Promise.all([getCategoriasEstado(), getPantallaEstado()]).then(([resCategorias, resPantalla]) => {
            if (cancelado) return;
            if (resCategorias.ok) {
                setCategorias(resCategorias.data.categorias);
                setError(null);
            } else {
                setError(resCategorias.error);
            }
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

                        <select
                            value={c.estatus}
                            onChange={(e) => cambiarEstatus(c.categoria, e.target.value as EstatusCompetencia)}
                            className="rounded-md border border-boss-border bg-boss-black px-2 py-1.5 text-sm text-foreground"
                        >
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
                (categorias?.find((c) => c.categoria === categoriaSeleccionada)?.estatus === "PRESELECCION" ? (
                    <PanelPreseleccion categoria={categoriaSeleccionada} />
                ) : (
                    <PanelEnfrentamientos categoria={categoriaSeleccionada} />
                ))}
        </div>
    );
}

// Ranking en vivo de la fase de Preselección: cada juez puntúa individualmente
// a cada competidor pagado (ver admin/jueceo); acá el admin ve el avance y,
// cuando todos ya calificaron a todos, corta el Top N automático (potencia de
// 2 más grande que no exceda el total calificado) con un clic.
function PanelPreseleccion({ categoria }: { categoria: Categoria }) {
    const [participantes, setParticipantes] = useState<ParticipantePreseleccion[] | null>(null);
    const [juecesActivos, setJuecesActivos] = useState(0);
    const [turno, setTurno] = useState<TurnoPreseleccion>(null);
    const [avanzando, setAvanzando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generando, setGenerando] = useState(false);
    const [empate, setEmpate] = useState<{ cortePosicion: number; cuposLibres: number; empatados: ParticipanteEmpatado[] } | null>(
        null,
    );
    const [elegidos, setElegidos] = useState<Set<string>>(new Set());

    useEffect(() => {
        let cancelado = false;
        const poll = async () => {
            const [resParticipantes, resTurno] = await Promise.all([
                getParticipantesPreseleccion(categoria),
                getTurnoPreseleccionActual(categoria),
            ]);
            if (cancelado) return;
            if (resParticipantes.ok) {
                setParticipantes(resParticipantes.data.participantes);
                setJuecesActivos(resParticipantes.data.juecesActivos);
                setError(null);
            } else {
                setError(resParticipantes.error);
            }
            if (resTurno.ok) setTurno(resTurno.data.turno);
        };
        poll();
        const id = setInterval(poll, 4000);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [categoria]);

    const avanzarTurno = async () => {
        setAvanzando(true);
        setError(null);
        const resultado = await siguienteTurnoPreseleccion(categoria);
        setAvanzando(false);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        setTurno(resultado.data.turno);
    };

    const ordenados = [...(participantes ?? [])].sort((a, b) => (b.puntajeTotal ?? -1) - (a.puntajeTotal ?? -1));
    const faltanPorCalificar = ordenados.filter((p) => p.calificacionesRecibidas < juecesActivos);
    const listoParaGenerar = participantes !== null && participantes.length >= 4 && faltanPorCalificar.length === 0;

    const generar = async (desempatePreseleccionIds?: string[]) => {
        setGenerando(true);
        setError(null);
        const resultado = await generarTopBracket(categoria, desempatePreseleccionIds);
        setGenerando(false);

        if (resultado.ok) {
            setEmpate(null);
            return;
        }
        if (resultado.motivo === "EMPATE_EN_CORTE") {
            setEmpate(resultado);
            setElegidos(new Set());
            return;
        }
        setError(resultado.error);
    };

    const toggleElegido = (id: string) => {
        setElegidos((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
            <h2 className="font-display text-lg uppercase tracking-wide text-white">
                Preselección — {CATEGORIAS[categoria]}
            </h2>
            <p className="mt-1 text-sm text-boss-gray">
                Cada juez puntúa individualmente a cada competidor pagado. El corte automático toma la potencia de 2 más
                grande (4/8/16/32/64) que no exceda el total calificado, con seeding: mejor puntaje contra peor puntaje.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-boss-border bg-boss-black/40 p-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-boss-gray">En tarima ahora</p>
                    <p className="font-display text-lg uppercase text-white">
                        {turno?.participante
                            ? turno.participante.nombreArtistico || `${turno.participante.nombres} ${turno.participante.apellidos}`
                            : "— nadie —"}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={avanzarTurno}
                    disabled={avanzando}
                    className="rounded-md bg-boss-red px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {avanzando ? "..." : "Siguiente"}
                </button>
            </div>

            {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}

            {participantes === null && <p className="mt-4 text-boss-gray">Cargando...</p>}

            {participantes !== null && (
                <div className="mt-4 space-y-1.5">
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
                            </span>
                            <span className={p.calificacionesRecibidas < juecesActivos ? "text-boss-gray" : "text-boss-green"}>
                                {p.puntajeTotal ?? "—"} pts · {p.calificacionesRecibidas}/{juecesActivos} jueces
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {empate && (
                <div className="mt-5 rounded-md border border-boss-red/40 bg-boss-red/5 p-4">
                    <p className="text-sm font-medium text-white">
                        Empate en el puesto {empate.cortePosicion}: elige {empate.cuposLibres} de estos {empate.empatados.length}{" "}
                        competidores para que avancen al bracket.
                    </p>
                    <div className="mt-3 space-y-2">
                        {empate.empatados.map((e) => (
                            <label key={e.id} className="flex items-center gap-2 text-sm text-white">
                                <input type="checkbox" checked={elegidos.has(e.id)} onChange={() => toggleElegido(e.id)} />
                                {e.nombre} — {e.puntajeTotal} pts
                            </label>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => generar(Array.from(elegidos))}
                        disabled={generando || elegidos.size !== empate.cuposLibres}
                        className="mt-3 rounded-md bg-boss-red px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Confirmar y generar bracket
                    </button>
                </div>
            )}

            {!empate && (
                <button
                    type="button"
                    onClick={() => generar()}
                    disabled={generando || !listoParaGenerar}
                    className="mt-5 w-full rounded-md bg-boss-red px-4 py-3 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {generando
                        ? "Generando..."
                        : faltanPorCalificar.length > 0
                          ? `Faltan ${faltanPorCalificar.length} por calificar`
                          : "Generar Top Bracket"}
                </button>
            )}
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
