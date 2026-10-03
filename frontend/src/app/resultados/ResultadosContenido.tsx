"use client";

import { useEffect, useState } from "react";
import { CATEGORIAS, type Categoria } from "@/config/catalog";
import {
    getEnfrentamientos,
    getResultadosPreseleccion,
    type Enfrentamiento,
    type ResultadoPreseleccionItem,
} from "@/lib/adminApi";

const INTERVALO_MS = 15_000;

// Mismo criterio que backend/src/routes/vistaRegistros.ts: quien se
// registra como espectador (PUBLICO_GENERAL) no compite, no tiene
// resultados que mostrar acá.
const CATEGORIAS_COMPETENCIA = (Object.keys(CATEGORIAS) as Categoria[]).filter((c) => c !== "PUBLICO_GENERAL");

function nombreDe(p: { nombreArtistico: string | null; nombres: string; apellidos: string }): string {
    return p.nombreArtistico || `${p.nombres} ${p.apellidos}`;
}

function nombreCompetidor(c: Enfrentamiento["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

export default function ResultadosContenido() {
    const [categoriaActiva, setCategoriaActiva] = useState<Categoria>(CATEGORIAS_COMPETENCIA[0]!);
    const [resultadosPreseleccion, setResultadosPreseleccion] = useState<ResultadoPreseleccionItem[] | null>(null);
    const [enfrentamientos, setEnfrentamientos] = useState<Enfrentamiento[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelado = false;
        setResultadosPreseleccion(null);
        setEnfrentamientos(null);

        const poll = async () => {
            const [resPreseleccion, resEnfrentamientos] = await Promise.all([
                getResultadosPreseleccion(categoriaActiva),
                getEnfrentamientos(categoriaActiva),
            ]);
            if (cancelado) return;
            if (resPreseleccion.ok) {
                setResultadosPreseleccion(resPreseleccion.data.resultados);
            }
            if (resEnfrentamientos.ok) {
                setEnfrentamientos(resEnfrentamientos.data.enfrentamientos);
                setError(null);
            } else {
                setError(resEnfrentamientos.error);
            }
        };

        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [categoriaActiva]);

    // Quién ya tiene lugar en el bracket (apareció en algún enfrentamiento) —
    // solo tiene sentido una vez que el Top Bracket ya se generó; antes de
    // eso nadie "clasificó" todavía, simplemente siguen en preselección.
    const idsClasificados = new Set(
        (enfrentamientos ?? []).flatMap((e) => [e.competidorA?.id, e.competidorB?.id].filter((id): id is string => !!id)),
    );

    const ordenados = [...(resultadosPreseleccion ?? [])].sort((a, b) => (b.puntajeTotal ?? -1) - (a.puntajeTotal ?? -1));
    const hayBracket = (enfrentamientos ?? []).length > 0;
    const rondas = Array.from(new Set((enfrentamientos ?? []).map((e) => e.rondaNumero))).sort((a, b) => a - b);

    return (
        <div className="mt-2 flex min-h-0 w-full flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap justify-center gap-2">
                {CATEGORIAS_COMPETENCIA.map((categoria) => (
                    <button
                        key={categoria}
                        type="button"
                        onClick={() => setCategoriaActiva(categoria)}
                        className={[
                            "rounded-md border px-3 py-1.5 text-sm font-semibold uppercase tracking-wide transition-colors",
                            categoria === categoriaActiva
                                ? "border-boss-red bg-boss-red/10 text-white"
                                : "border-boss-border text-boss-gray hover:border-boss-red hover:text-white",
                        ].join(" ")}
                    >
                        {CATEGORIAS[categoria]}
                    </button>
                ))}
            </div>

            <div className="mx-auto mt-6 w-full max-w-2xl flex-1 overflow-y-auto pb-10">
                {error && <p className="text-sm font-medium text-red-400">{error}</p>}

                {resultadosPreseleccion === null && enfrentamientos === null && !error && (
                    <p className="text-boss-gray">Cargando...</p>
                )}

                {resultadosPreseleccion !== null && ordenados.length > 0 && (
                    <section>
                        <h2 className="font-display text-sm uppercase tracking-widest text-boss-red">Preselección</h2>
                        <div className="mt-3 space-y-1.5">
                            {ordenados.map((p, i) => (
                                <div
                                    key={p.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-boss-border px-3 py-2 text-sm"
                                >
                                    <span className="text-white">
                                        <span className="mr-2 text-boss-gray">#{i + 1}</span>
                                        {nombreDe(p)}
                                        {p.numeroDesempate > 0 && (
                                            <span className="ml-2 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] normal-case text-yellow-400">
                                                Repechaje {p.numeroDesempate}
                                            </span>
                                        )}
                                        {hayBracket && idsClasificados.has(p.id) && (
                                            <span className="ml-2 rounded-full bg-boss-green/15 px-2 py-0.5 text-[11px] normal-case text-boss-green">
                                                Clasificó
                                            </span>
                                        )}
                                    </span>
                                    <span className={p.completo ? "text-boss-green" : "text-boss-gray"}>
                                        {p.puntajeTotal ?? "—"} pts
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {rondas.map((rondaNumero) => {
                    const deEstaRonda = (enfrentamientos ?? []).filter((e) => e.rondaNumero === rondaNumero);
                    const nombreRonda = deEstaRonda[0]?.ronda ?? `Ronda ${rondaNumero}`;
                    return (
                        <section key={rondaNumero} className="mt-8">
                            <h2 className="font-display text-sm uppercase tracking-widest text-boss-red">{nombreRonda}</h2>
                            <div className="mt-3 space-y-3">
                                {deEstaRonda.map((e) => {
                                    const esBye = !e.competidorB && !!e.ganador;
                                    const ganoA = e.ganador?.id === e.competidorA?.id;
                                    const ganoB = e.ganador?.id === e.competidorB?.id;
                                    return (
                                        <div key={e.id} className="rounded-md border border-boss-border p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <span className={`text-sm text-white ${ganoA ? "font-semibold text-boss-green" : ""}`}>
                                                    {nombreCompetidor(e.competidorA)}
                                                    {e.puntajeA != null && (
                                                        <span className="ml-2 text-xs text-boss-gray">{e.puntajeA} pts</span>
                                                    )}
                                                </span>
                                                {esBye ? (
                                                    <span className="text-xs uppercase tracking-wide text-boss-gray">
                                                        BYE — pase directo
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span className="text-boss-gray">vs</span>
                                                        <span className={`text-sm text-white ${ganoB ? "font-semibold text-boss-green" : ""}`}>
                                                            {nombreCompetidor(e.competidorB)}
                                                            {e.puntajeB != null && (
                                                                <span className="ml-2 text-xs text-boss-gray">{e.puntajeB} pts</span>
                                                            )}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            {!esBye && e.estatus !== "FINALIZADO" && (
                                                <p className="mt-1 text-xs uppercase tracking-wide text-boss-gray">Pendiente</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}

                {resultadosPreseleccion !== null &&
                    ordenados.length === 0 &&
                    enfrentamientos !== null &&
                    enfrentamientos.length === 0 && (
                        <p className="text-boss-gray">Todavía no hay resultados para esta categoría.</p>
                    )}
            </div>
        </div>
    );
}
