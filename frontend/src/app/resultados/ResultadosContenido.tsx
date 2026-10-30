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

// Mismo banner rojo inclinado que usa /pantalla/tablero para "Próximas
// batallas" — lo reutilizamos acá como encabezado de cada sección
// (Preselección, Octavos, Cuartos...) para mantener el mismo lenguaje visual
// del resto del sistema.
function BannerSeccion({ texto }: { texto: string }) {
    return (
        <div className="flex justify-center sm:justify-start">
            <div className="relative -skew-x-6 bg-boss-red px-6 py-1.5 shadow-[0_0_20px_rgba(226,9,26,0.4)]">
                <h2 className="skew-x-6 whitespace-nowrap font-display text-sm uppercase tracking-[0.2em] text-white sm:text-base">
                    {texto}
                </h2>
            </div>
        </div>
    );
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
                getResultadosPreseleccion(categoriaActiva, true),
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

    // Cadena de desempate del reglamento, igual que calcularCorte en el
    // backend: puntajeTotal desc, y si empatan, Musicalidad -> Ejecución ->
    // Originalidad -> Técnica (Vocabulario no es criterio de desempate) —
    // así el orden que ve el público acá coincide con el que de verdad
    // decidió quién clasificó.
    const ordenados = [...(resultadosPreseleccion ?? [])].sort(
        (a, b) =>
            (b.puntajeTotal ?? -1) - (a.puntajeTotal ?? -1) ||
            (b.musicalidadTotal ?? -1) - (a.musicalidadTotal ?? -1) ||
            (b.ejecucionTotal ?? -1) - (a.ejecucionTotal ?? -1) ||
            (b.originalidadTotal ?? -1) - (a.originalidadTotal ?? -1) ||
            (b.tecnicaTotal ?? -1) - (a.tecnicaTotal ?? -1),
    );
    const hayBracket = (enfrentamientos ?? []).length > 0;
    const rondas = Array.from(new Set((enfrentamientos ?? []).map((e) => e.rondaNumero))).sort((a, b) => a - b);

    // Detecta un empate en PUNTAJE justo en el límite del corte (el último
    // que clasificó y el primero que NO, con el mismo puntajeTotal) — esto
    // cubre tanto el caso típico (se resolvió por Musicalidad/Ejecución/
    // Originalidad/Técnica, sin repechaje) como el empate total que sí lo
    // disparó; criterioQueDesempato (abajo) decide cuál mensaje mostrar. Si
    // acá solo se exigiera que TODOS los criterios coincidieran, el caso
    // típico (resuelto por un criterio más abajo en la cadena) nunca se
    // detectaría y no se explicaría nada — justo lo que reportó el cliente.
    let limiteEmpate: { inicio: number; fin: number; puntaje: number } | null = null;
    if (hayBracket) {
        for (let i = 0; i < ordenados.length - 1; i++) {
            const actual = ordenados[i]!;
            const siguiente = ordenados[i + 1]!;
            if (
                idsClasificados.has(actual.id) &&
                !idsClasificados.has(siguiente.id) &&
                actual.puntajeTotal != null &&
                actual.puntajeTotal === siguiente.puntajeTotal
            ) {
                let inicio = i;
                while (inicio > 0 && ordenados[inicio - 1]!.puntajeTotal === actual.puntajeTotal) inicio--;
                let fin = i + 1;
                while (fin < ordenados.length - 1 && ordenados[fin + 1]!.puntajeTotal === actual.puntajeTotal) fin++;
                limiteEmpate = { inicio, fin, puntaje: actual.puntajeTotal };
                break;
            }
        }
    }

    // De la cadena de desempate (Musicalidad -> Ejecución -> Originalidad ->
    // Técnica), cuál fue el primer criterio en el que el grupo empatado NO
    // coincide todos exactamente — ese es el que explica el orden entre
    // ellos. Null si coinciden en los 4 (ahí sí hace falta el repechaje).
    function criterioQueDesempato(grupo: ResultadoPreseleccionItem[]): string | null {
        const CRITERIOS: { etiqueta: string; valor: (r: ResultadoPreseleccionItem) => number | null }[] = [
            { etiqueta: "Musicalidad", valor: (r) => r.musicalidadTotal },
            { etiqueta: "Ejecución", valor: (r) => r.ejecucionTotal },
            { etiqueta: "Originalidad", valor: (r) => r.originalidadTotal },
            { etiqueta: "Técnica", valor: (r) => r.tecnicaTotal },
        ];
        for (const { etiqueta, valor } of CRITERIOS) {
            if (new Set(grupo.map(valor)).size > 1) return etiqueta;
        }
        return null;
    }

    return (
        <div className="mt-6 flex w-full flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap justify-center gap-2">
                {CATEGORIAS_COMPETENCIA.map((categoria) => (
                    <button
                        key={categoria}
                        type="button"
                        onClick={() => setCategoriaActiva(categoria)}
                        className={[
                            "rounded-full border px-4 py-1.5 font-display text-xs uppercase tracking-wide transition-colors sm:text-sm",
                            categoria === categoriaActiva
                                ? "border-boss-red bg-boss-red text-white shadow-[0_0_16px_rgba(226,9,26,0.6)]"
                                : "border-boss-border text-boss-gray hover:border-boss-red hover:text-white",
                        ].join(" ")}
                    >
                        {CATEGORIAS[categoria]}
                    </button>
                ))}
            </div>

            <div className="mx-auto mt-8 w-full max-w-2xl flex-1 pb-10">
                {error && <p className="text-sm font-medium text-red-400">{error}</p>}

                {resultadosPreseleccion === null && enfrentamientos === null && !error && (
                    <p className="text-center text-boss-gray">Cargando...</p>
                )}

                {resultadosPreseleccion !== null && ordenados.length > 0 && (
                    <section>
                        <BannerSeccion texto="Preselección" />
                        <div className="mt-4 space-y-2">
                            {ordenados.map((p, i) => {
                                const enEmpateDeCorte = !!limiteEmpate && i >= limiteEmpate.inicio && i <= limiteEmpate.fin;
                                return (
                                    <div key={p.id}>
                                        <div
                                            className={`flex items-stretch overflow-hidden rounded-sm border bg-black/40 ${
                                                enEmpateDeCorte ? "border-yellow-500/50" : "border-white/15"
                                            }`}
                                        >
                                            <span className={`w-1.5 shrink-0 ${enEmpateDeCorte ? "bg-yellow-500" : "bg-boss-red"}`} />
                                            <div className="flex flex-1 items-center gap-3 px-4 py-3">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 font-display text-sm text-white sm:h-9 sm:w-9">
                                                    {i + 1}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-display text-base uppercase text-white sm:text-lg">
                                                        {nombreDe(p)}
                                                    </p>
                                                    {(p.numeroDesempate > 0 || (hayBracket && idsClasificados.has(p.id)) || enEmpateDeCorte) && (
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                            {p.numeroDesempate > 0 && (
                                                                <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-yellow-400">
                                                                    Repechaje {p.numeroDesempate}
                                                                </span>
                                                            )}
                                                            {hayBracket && idsClasificados.has(p.id) && (
                                                                <span className="rounded-full bg-boss-green/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-boss-green">
                                                                    Clasificó
                                                                </span>
                                                            )}
                                                            {enEmpateDeCorte && (
                                                                <span className="text-[10px] uppercase tracking-wide text-yellow-400">
                                                                    Musicalidad {p.musicalidadTotal ?? "—"} · Ejecución{" "}
                                                                    {p.ejecucionTotal ?? "—"} · Originalidad{" "}
                                                                    {p.originalidadTotal ?? "—"} · Técnica {p.tecnicaTotal ?? "—"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <span
                                                    className={`shrink-0 font-display text-xl sm:text-2xl ${
                                                        p.completo ? "text-boss-green" : "text-boss-gray"
                                                    }`}
                                                >
                                                    {p.puntajeTotal ?? "—"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Explicación del empate en el límite del corte, justo debajo
                                            del último de la lista empatada (ver cálculo de limiteEmpate
                                            arriba) — para que quede claro CÓMO se decidió quién pasó, no
                                            solo que hubo empate. */}
                                        {limiteEmpate && i === limiteEmpate.fin && (
                                            <div className="mx-1 mt-2 rounded-sm border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
                                                <p className="font-display text-xs uppercase tracking-wide text-yellow-400 sm:text-sm">
                                                    Empate en {limiteEmpate.puntaje} pts, en el límite del corte
                                                </p>
                                                <p className="mt-1 text-xs text-white/80 sm:text-sm">
                                                    {(() => {
                                                        const criterio = criterioQueDesempato(
                                                            ordenados.slice(limiteEmpate.inicio, limiteEmpate.fin + 1),
                                                        );
                                                        return criterio
                                                            ? `Se desempató por mayor puntaje en ${criterio} (se muestra arriba de cada quien).`
                                                            : "Empataron también en Musicalidad, Ejecución, Originalidad y Técnica — se resolvió con una ronda extra de repechaje en el mismo escenario.";
                                                    })()}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {rondas.map((rondaNumero) => {
                    const deEstaRonda = (enfrentamientos ?? []).filter((e) => e.rondaNumero === rondaNumero);
                    const nombreRonda = deEstaRonda[0]?.ronda ?? `Ronda ${rondaNumero}`;
                    return (
                        <section key={rondaNumero} className="mt-10">
                            <BannerSeccion texto={nombreRonda} />
                            <div className="mt-4 space-y-3">
                                {deEstaRonda.map((e) => {
                                    const esBye = !e.competidorB && !!e.ganador;
                                    const ganoA = e.ganador?.id === e.competidorA?.id;
                                    const ganoB = e.ganador?.id === e.competidorB?.id;
                                    const pendiente = !esBye && e.estatus !== "FINALIZADO";
                                    return (
                                        <div
                                            key={e.id}
                                            className="flex items-stretch overflow-hidden rounded-sm border border-white/15 bg-black/40"
                                        >
                                            <span className={`w-1.5 shrink-0 ${e.estatus === "FINALIZADO" ? "bg-boss-red" : "bg-white/20"}`} />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 px-4 py-3 sm:gap-4">
                                                    <div className="min-w-0 flex-1 text-right">
                                                        <p
                                                            className={`truncate font-display text-base uppercase sm:text-xl ${
                                                                ganoA ? "text-boss-green" : "text-white"
                                                            }`}
                                                        >
                                                            {nombreCompetidor(e.competidorA)}
                                                            {ganoA && <span className="ml-1">✓</span>}
                                                        </p>
                                                        {e.puntajeA != null && (
                                                            <p className="text-xs text-boss-gray sm:text-sm">{e.puntajeA} pts</p>
                                                        )}
                                                    </div>

                                                    {esBye ? (
                                                        <span className="shrink-0 rounded-full bg-black/60 px-3 py-1 font-display text-[10px] uppercase tracking-wide text-boss-gray sm:text-xs">
                                                            Bye
                                                        </span>
                                                    ) : (
                                                        <span className="shrink-0 font-display text-xs uppercase tracking-widest text-boss-gray sm:text-sm">
                                                            vs
                                                        </span>
                                                    )}

                                                    <div className="min-w-0 flex-1 text-left">
                                                        {!esBye && (
                                                            <>
                                                                <p
                                                                    className={`truncate font-display text-base uppercase sm:text-xl ${
                                                                        ganoB ? "text-boss-green" : "text-white"
                                                                    }`}
                                                                >
                                                                    {ganoB && <span className="mr-1">✓</span>}
                                                                    {nombreCompetidor(e.competidorB)}
                                                                </p>
                                                                {e.puntajeB != null && (
                                                                    <p className="text-xs text-boss-gray sm:text-sm">{e.puntajeB} pts</p>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                {pendiente && (
                                                    <div className="border-t border-white/10 px-4 py-1.5 text-center font-display text-[10px] uppercase tracking-widest text-boss-gray sm:text-xs">
                                                        Pendiente
                                                    </div>
                                                )}
                                            </div>
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
                        <p className="text-center text-boss-gray">Todavía no hay resultados para esta categoría.</p>
                    )}
            </div>
        </div>
    );
}
