"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import {
    getCategoriasEstado,
    getEnfrentamientos,
    getResultadosPreseleccion,
    type CategoriaEstado,
    type Enfrentamiento,
    type ResultadoPreseleccionItem,
} from "@/lib/adminApi";
import { ModoPruebaBadge } from "../ModoPruebaBadge";
import { GridRosterPreseleccion } from "../SecuenciaPreseleccion";

const INTERVALO_MS = 3000;
const MAXIMO_PROXIMAS = 5;

function nombreCompetidor(c: Enfrentamiento["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

type DatosTablero =
    | { tipo: "batalla"; categoria: CategoriaEstado; enCurso: Enfrentamiento | null; proximas: Enfrentamiento[] }
    | { tipo: "preseleccion"; categoria: CategoriaEstado; resultados: ResultadoPreseleccionItem[] };

// Posiciones fijas (no aleatorias en cada render, para no reflowar) de las
// chispas que flotan de fondo — mismo recurso visual que la pantalla de
// anuncio "VS" (ver ChispasFondo en SecuenciaBatalla.tsx), pero más dispersas
// y tenues porque aquí conviven con contenido encima todo el tiempo.
const CHISPAS_TABLERO = [
    { left: "4%", top: "82%", size: 4, delay: "0s" },
    { left: "12%", top: "20%", size: 3, delay: "1.4s" },
    { left: "23%", top: "60%", size: 5, delay: "0.6s" },
    { left: "35%", top: "12%", size: 3, delay: "2.2s" },
    { left: "48%", top: "88%", size: 4, delay: "1s" },
    { left: "62%", top: "30%", size: 3, delay: "1.8s" },
    { left: "74%", top: "70%", size: 5, delay: "0.3s" },
    { left: "86%", top: "15%", size: 4, delay: "2.6s" },
    { left: "94%", top: "55%", size: 3, delay: "1.2s" },
    { left: "18%", top: "94%", size: 3, delay: "2s" },
] as const;

// Pantalla de "EN BATALLA / PRÓXIMAS BATALLAS" para peleas 1 vs 1 del
// bracket, calcada del diseño de referencia del cliente: logo grande + "1RA
// EDICIÓN" a la izquierda, categoría/ronda grandes a la derecha, una tarjeta
// ancha con la pelea actual y una angosta con la cola de las siguientes. Solo
// se usa para datos.tipo === "batalla" — Preselección sigue con su propio
// diseño de roster por escenario (GridRosterPreseleccion), que no tiene un
// "turno actual" único que mostrar acá (cada juez califica a su ritmo desde
// su propia lista, ver SecuenciaPreseleccion.tsx).
function TableroBatalla({ datos }: { datos: Extract<DatosTablero, { tipo: "batalla" }> }) {
    const ronda = datos.enCurso?.ronda ?? datos.proximas[0]?.ronda ?? null;

    return (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* ================= ENCABEZADO ================= */}
            <div className="flex shrink-0 items-center justify-between gap-6 px-6 pt-6 sm:px-10 sm:pt-8">
                <div className="flex min-w-0 items-center gap-4">
                    <Image
                        src="/the-boss-logo.png"
                        alt="THE BOSS — Breaking Battles"
                        width={1537}
                        height={1023}
                        priority
                        className="h-14 w-auto shrink-0 sm:h-24"
                    />
                    <div className="flex shrink-0 flex-col items-start justify-center gap-0.5 border-l-2 border-white/30 pl-3 leading-none sm:pl-4">
                        <span className="font-display text-sm font-black tracking-wide text-white sm:text-xl">1RA</span>
                        <span className="font-display text-sm font-black tracking-wide text-white sm:text-xl">EDICIÓN</span>
                    </div>
                </div>

                <div className="min-w-0 text-right">
                    <h2 className="truncate font-display text-xl uppercase italic leading-none text-white sm:text-4xl pr-1 sm:pr-2">
                        {datos.categoria.label}
                    </h2>
                    {ronda && (
                        <p
                            className="mt-1 truncate font-display text-2xl uppercase italic leading-none text-white sm:text-6xl pr-1 sm:pr-3"
                            style={{
                                WebkitTextStroke: "2px var(--color-boss-red)",
                                textShadow: "0 0 18px var(--color-boss-red), 0 0 40px var(--color-boss-red)",
                            }}
                        >
                            {ronda}
                        </p>
                    )}
                </div>
            </div>

            <div className="relative z-10 mx-6 mt-5 h-[3px] shrink-0 bg-boss-red shadow-[0_0_12px_var(--color-boss-red)] sm:mx-10 sm:mt-6" />

            {/* ================= CUERPO: EN BATALLA + PRÓXIMAS ================= */}
            <div className="flex min-h-0 flex-1 flex-col gap-5 px-6 py-5 sm:flex-row sm:gap-6 sm:px-10 sm:py-6">
                {/* EN BATALLA */}
                <div className="relative flex min-h-0 flex-[1.6] flex-col overflow-hidden rounded-md border-2 border-boss-red bg-black/30">
                    <div className="shrink-0 p-4 sm:p-5">
                        <span className="inline-block -skew-x-6 bg-boss-red px-6 py-2 shadow-[0_0_20px_rgba(226,9,26,0.5)] sm:px-8 sm:py-2.5">
                            <span className="inline-block skew-x-6 font-display text-lg uppercase tracking-wide text-white sm:text-2xl">
                                En batalla
                            </span>
                        </span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 pb-8 text-center sm:gap-5 sm:px-10">
                        {datos.enCurso ? (
                            <>
                                <p
                                    className="w-full truncate font-display uppercase leading-none text-white"
                                    style={{ fontSize: "clamp(2rem, 6.5vw, 5.5rem)" }}
                                >
                                    {nombreCompetidor(datos.enCurso.competidorA)}
                                </p>
                                <span
                                    className="font-display text-xl italic text-white sm:text-3xl"
                                    style={{
                                        WebkitTextStroke: "1.5px var(--color-boss-red)",
                                        textShadow: "0 0 16px var(--color-boss-red)",
                                    }}
                                >
                                    VS
                                </span>
                                <p
                                    className="w-full truncate font-display uppercase leading-none text-white"
                                    style={{ fontSize: "clamp(2rem, 6.5vw, 5.5rem)" }}
                                >
                                    {nombreCompetidor(datos.enCurso.competidorB)}
                                </p>
                            </>
                        ) : (
                            <p className="font-display text-xl uppercase tracking-widest text-boss-gray sm:text-2xl">
                                Esperando la siguiente batalla…
                            </p>
                        )}
                    </div>
                </div>

                {/* PRÓXIMAS BATALLAS */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border-2 border-boss-red bg-black/30">
                    <div className="shrink-0 bg-boss-red px-5 py-2.5 text-center">
                        <h3 className="font-display text-base uppercase tracking-wide text-white sm:text-2xl">
                            Próximas batallas
                        </h3>
                    </div>
                    <div className="grid min-h-0 flex-1 gap-3 p-4" style={{ gridTemplateRows: `repeat(${Math.max(datos.proximas.length, 1)}, minmax(0, 1fr))` }}>
                        {datos.proximas.length > 0 ? (
                            datos.proximas.map((enfrentamiento) => (
                                <div
                                    key={enfrentamiento.id}
                                    className="flex min-h-0 items-stretch overflow-hidden rounded-sm border border-white/20 bg-black/40"
                                >
                                    <span className="w-1.5 shrink-0 bg-boss-red" />
                                    <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden px-3">
                                        <span className="truncate font-display text-lg uppercase text-white sm:text-3xl">
                                            {nombreCompetidor(enfrentamiento.competidorA)}
                                        </span>
                                        <span className="shrink-0 font-display text-base uppercase tracking-widest text-boss-gray sm:text-2xl">
                                            vs
                                        </span>
                                        <span className="truncate font-display text-lg uppercase text-white sm:text-3xl">
                                            {nombreCompetidor(enfrentamiento.competidorB)}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="m-auto font-display text-sm uppercase tracking-widest text-boss-gray">
                                Sin más batallas por ahora
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <p className="shrink-0 pb-6 text-center font-display text-xs uppercase tracking-[0.3em] text-white/80 sm:pb-8 sm:text-base">
                Mantente atento a tu turno
            </p>
        </div>
    );
}

function ChispasTablero() {
    return (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
            {CHISPAS_TABLERO.map((chispa, i) => (
                <span
                    key={i}
                    className="animate-ascua absolute rounded-full bg-gradient-to-b from-yellow-200 via-orange-400 to-red-600 opacity-70"
                    style={{
                        left: chispa.left,
                        top: chispa.top,
                        width: chispa.size,
                        height: chispa.size,
                        animationDelay: chispa.delay,
                        boxShadow: "0 0 8px 2px rgba(255,140,0,0.6)",
                    }}
                />
            ))}
        </div>
    );
}

// De todas las categorías EN_CURSO, esta es LA que se está peleando ahora
// mismo (solo una batalla a la vez en el escenario, aunque el staff haya
// dejado varias categorías marcadas EN_CURSO): se prioriza la que tenga un
// enfrentamiento con estatus EN_CURSO de verdad; si en este momento nadie
// está peleando (entre batalla y batalla), se usa la categoría cuyo último
// enfrentamiento se actualizó más recientemente — la que se estaba
// trabajando hace un instante. `ultimaActividad` se expone siempre (incluso
// con batalla en curso) para poder compararla contra la actividad de
// Preselección de otra categoría — ver el poll más abajo.
function elegirCategoriaActiva(
    candidatas: { categoria: CategoriaEstado; enfrentamientos: Enfrentamiento[] }[],
): { categoria: CategoriaEstado; enfrentamientos: Enfrentamiento[]; tieneBatallaEnCurso: boolean; ultimaActividad: number } | null {
    if (candidatas.length === 0) return null;

    const conBatallaEnCurso = candidatas
        .map((c) => ({ c, enCurso: c.enfrentamientos.find((e) => e.estatus === "EN_CURSO") }))
        .filter((x): x is { c: (typeof candidatas)[number]; enCurso: Enfrentamiento } => !!x.enCurso);

    if (conBatallaEnCurso.length > 0) {
        conBatallaEnCurso.sort((a, b) => new Date(b.enCurso.updatedAt).getTime() - new Date(a.enCurso.updatedAt).getTime());
        const elegida = conBatallaEnCurso[0]!;
        return { ...elegida.c, tieneBatallaEnCurso: true, ultimaActividad: new Date(elegida.enCurso.updatedAt).getTime() };
    }

    const conUltimaActividad = candidatas.map((c) => {
        const ultima = c.enfrentamientos.reduce(
            (max, e) => Math.max(max, new Date(e.updatedAt).getTime() || 0),
            0,
        );
        return { c, ultima };
    });
    conUltimaActividad.sort((a, b) => b.ultima - a.ultima);
    const elegida = conUltimaActividad[0]!;
    return { ...elegida.c, tieneBatallaEnCurso: false, ultimaActividad: elegida.ultima };
}

// Pantalla independiente de "próxima batalla / próxima presentación"
// (monitor secundario, tipo fila de banco): a diferencia de /pantalla, NO usa
// PantallaEstado ni SecuenciaOverlay — se actualiza sola con lo que ya está
// en la base de datos, sin que el staff tenga que seleccionar nada. Muestra
// SOLO una categoría a la vez, con esta prioridad:
//   1. Una categoría con una batalla 1v1 en curso de verdad ahora mismo.
//   2. Si ninguna: la actividad más reciente entre (a) una categoría en
//      Preselección con turno activo y (b) una categoría EN_CURSO sin
//      batalla activa todavía (recién se generó su bracket, nadie le ha
//      dado "Iniciar batalla") — se compara por marca de tiempo, no se le
//      da preferencia fija a Preselección: si una categoría acaba de pasar
//      a brackets, eso es más reciente que una Preselección que ya llevaba
//      rato corriendo en otra categoría, y debe ganarle.
//   3. Si nada aplica: "Esperando la siguiente categoría...".
export default function TableroPage() {
    return (
        <Suspense fallback={null}>
            <TableroContenido />
        </Suspense>
    );
}

function TableroContenido() {
    const searchParams = useSearchParams();
    // Sin ?escenario=, esta pantalla general recorre TODOS los escenarios de
    // TODAS las categorías en Preselección/Repechaje y muestra el turno más
    // reciente (mismo criterio de siempre) — para categorías con un solo
    // escenario esto se reduce exactamente al comportamiento de antes. Con
    // ?escenario=<id>, la pantalla de ESA tarima física solo sigue la cola de
    // ese escenario puntual, en la categoría a la que esté asignado ahora.
    const escenarioParam = searchParams.get("escenario");
    const [datos, setDatos] = useState<DatosTablero | null | undefined>(undefined);

    useEffect(() => {
        let cancelado = false;

        const poll = async () => {
            const resCategorias = await getCategoriasEstado();
            if (cancelado || !resCategorias.ok) return;

            const enCurso = resCategorias.data.categorias.filter((c) => c.estatus === "EN_CURSO");
            const enPreseleccion = resCategorias.data.categorias.filter(
                (c) => c.estatus === "PRESELECCION" || c.estatus === "REPECHAJE_DESEMPATE",
            );

            const candidatasBatalla = await Promise.all(
                enCurso.map(async (categoria) => {
                    const resEnfrentamientos = await getEnfrentamientos(categoria.categoria);
                    const enfrentamientos = resEnfrentamientos.ok ? resEnfrentamientos.data.enfrentamientos : [];
                    return { categoria, enfrentamientos };
                }),
            );
            if (cancelado) return;

            const elegidaBatalla = elegirCategoriaActiva(candidatasBatalla);
            if (elegidaBatalla?.tieneBatallaEnCurso) {
                const ordenados = [...elegidaBatalla.enfrentamientos].sort(
                    (a, b) => a.rondaNumero - b.rondaNumero || a.orden - b.orden,
                );
                const enCursoEnf = ordenados.find((e) => e.estatus === "EN_CURSO") ?? null;
                const proximas = ordenados.filter((e) => e.estatus === "PENDIENTE").slice(0, MAXIMO_PROXIMAS);
                setDatos({ tipo: "batalla", categoria: elegidaBatalla.categoria, enCurso: enCursoEnf, proximas });
                return;
            }

            // Candidato de Preselección: junta el ranking público (ya sin
            // puntajes mientras siga en Preselección/Repechaje, ver
            // Privacidad de calificaciones en filtros) de cada categoría en
            // esa fase. Sin tarima/turno que mirar, se prioriza la primera
            // categoría con alguien todavía por calificar (más relevante
            // para un tablero en vivo) sobre una que ya terminó; con
            // ?escenario=<id> (pantalla física de un escenario) solo se
            // consideran categorías que de verdad tengan a alguien asignado
            // a ese escenario.
            let datosPreseleccion: Extract<DatosTablero, { tipo: "preseleccion" }> | null = null;

            if (enPreseleccion.length > 0) {
                const conResultados = await Promise.all(
                    enPreseleccion.map(async (categoria) => {
                        const resResultados = await getResultadosPreseleccion(categoria.categoria);
                        return { categoria, resultados: resResultados.ok ? resResultados.data.resultados : [] };
                    }),
                );
                if (cancelado) return;

                const candidatas = escenarioParam
                    ? conResultados.filter((c) => c.resultados.some((r) => r.escenarioId === escenarioParam))
                    : conResultados;

                const elegida = candidatas.find((c) => c.resultados.some((r) => !r.completo)) ?? candidatas[0] ?? null;
                if (elegida && elegida.resultados.length > 0) {
                    datosPreseleccion = { tipo: "preseleccion", categoria: elegida.categoria, resultados: elegida.resultados };
                }
            }

            // Preselección gana si no hay ninguna categoría EN_CURSO con
            // batalla activa de verdad ahora mismo.
            if (datosPreseleccion && !elegidaBatalla?.tieneBatallaEnCurso) {
                setDatos(datosPreseleccion);
                return;
            }

            if (elegidaBatalla) {
                const ordenados = [...elegidaBatalla.enfrentamientos].sort(
                    (a, b) => a.rondaNumero - b.rondaNumero || a.orden - b.orden,
                );
                const proximas = ordenados.filter((e) => e.estatus === "PENDIENTE").slice(0, MAXIMO_PROXIMAS);
                setDatos({ tipo: "batalla", categoria: elegidaBatalla.categoria, enCurso: null, proximas });
                return;
            }

            setDatos(null);
        };

        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [escenarioParam]);

    // Pantalla fija de "solo mostrar" (nadie la toca ni la scrollea): todo el
    // layout vive dentro de h-screen/overflow-hidden y las 5 filas de
    // "próximas" se reparten con grid-rows-5 dentro de un flex-1, así que
    // sin importar la resolución real de la pantalla, siempre caben las 5
    // sin necesidad de scroll (se ajustan de alto solas).
    return (
        <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-boss-black">
            <ModoPruebaBadge />
            {/* Fondo tipo "aurora": dos manchas de color grandes y difuminadas que
                se desplazan muy lento (mismos colores azul/rojo del resto del
                sistema) más chispas flotando — le dan vida al negro plano sin
                competir con el contenido encima. */}
            <div className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-boss-blue/20 blur-[130px] animate-deriva-a" />
            <div className="pointer-events-none absolute -bottom-48 -right-32 h-[34rem] w-[34rem] rounded-full bg-boss-red/20 blur-[130px] animate-deriva-b" />
            <div className="pointer-events-none absolute right-1/4 top-1/3 h-64 w-64 rounded-full bg-boss-red-dark/10 blur-[100px] animate-deriva-a" />
            <ChispasTablero />

            {/* El encabezado chico (logo redondo + "En vivo") solo aplica a
                Preselección y a la espera inicial — las batallas 1 vs 1 traen
                su propio encabezado grande (logo + "1RA EDICIÓN" + categoría/
                ronda), ver TableroBatalla, calcado del diseño de referencia
                del cliente. */}
            {(!datos || datos.tipo !== "batalla") && (
                <div className="relative z-10 flex shrink-0 items-center justify-between px-6 py-4 sm:px-10 sm:py-5">
                    <Image
                        src="/thebosslogo.jpeg"
                        alt="THE BOSS — Breaking Battles"
                        width={64}
                        height={54}
                        className="rounded-md"
                    />
                    <div className="flex items-center gap-2 rounded-full border border-boss-red/50 bg-boss-red/10 px-4 py-1.5">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-boss-red" />
                        <span className="font-display text-xs uppercase tracking-[0.3em] text-boss-red">En vivo</span>
                    </div>
                </div>
            )}

            {!datos && (
                <div className="relative z-10 flex flex-1 items-center justify-center">
                    {datos === null && (
                        <div className="flex flex-col items-center gap-3">
                            <span className="h-3 w-3 animate-pulse rounded-full bg-boss-red" />
                            <p className="font-display text-2xl uppercase tracking-[0.2em] text-boss-gray">
                                Esperando la siguiente categoría...
                            </p>
                        </div>
                    )}
                </div>
            )}

            {datos && datos.tipo === "batalla" && <TableroBatalla datos={datos} />}

            {datos && datos.tipo === "preseleccion" && (
                <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 pb-6 sm:px-10">
                    <div className="flex shrink-0 items-center justify-center">
                        <div className="relative -skew-x-6 border-y-2 border-boss-red bg-gradient-to-r from-boss-red-dark via-boss-red to-boss-red-dark px-10 py-1.5 shadow-lg shadow-boss-red/30">
                            <h2 className="skew-x-6 whitespace-nowrap font-display text-xl uppercase tracking-[0.25em] text-white sm:text-3xl">
                                {datos.categoria.label}
                            </h2>
                        </div>
                    </div>
                    <div className="mt-5 min-h-0 flex-1">
                        <GridRosterPreseleccion resultados={datos.resultados} escenarioId={escenarioParam} />
                    </div>
                </div>
            )}
        </main>
    );
}
