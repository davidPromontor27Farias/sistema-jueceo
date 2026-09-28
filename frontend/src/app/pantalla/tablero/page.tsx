"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
    getCategoriasEstado,
    getEnfrentamientos,
    getProximosPreseleccion,
    getTurnoPreseleccionActual,
    type CategoriaEstado,
    type Enfrentamiento,
    type ProximoPreseleccionItem,
    type TurnoPreseleccion,
} from "@/lib/adminApi";
import { ModoPruebaBadge } from "../ModoPruebaBadge";

const INTERVALO_MS = 3000;
const MAXIMO_PROXIMAS = 5;

function nombreCompetidor(c: Enfrentamiento["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

function nombreParticipante(p: ProximoPreseleccionItem): string {
    return p.nombreArtistico || `${p.nombres} ${p.apellidos}`;
}

type DatosTablero =
    | { tipo: "batalla"; categoria: CategoriaEstado; enCurso: Enfrentamiento | null; proximas: Enfrentamiento[] }
    | { tipo: "preseleccion"; categoria: CategoriaEstado; turno: NonNullable<TurnoPreseleccion>; proximos: ProximoPreseleccionItem[] };

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
// trabajando hace un instante.
function elegirCategoriaActiva(
    candidatas: { categoria: CategoriaEstado; enfrentamientos: Enfrentamiento[] }[],
): { categoria: CategoriaEstado; enfrentamientos: Enfrentamiento[]; tieneBatallaEnCurso: boolean } | null {
    if (candidatas.length === 0) return null;

    const conBatallaEnCurso = candidatas
        .map((c) => ({ c, enCurso: c.enfrentamientos.find((e) => e.estatus === "EN_CURSO") }))
        .filter((x): x is { c: (typeof candidatas)[number]; enCurso: Enfrentamiento } => !!x.enCurso);

    if (conBatallaEnCurso.length > 0) {
        conBatallaEnCurso.sort((a, b) => new Date(b.enCurso.updatedAt).getTime() - new Date(a.enCurso.updatedAt).getTime());
        return { ...conBatallaEnCurso[0]!.c, tieneBatallaEnCurso: true };
    }

    if (candidatas.length === 1) return { ...candidatas[0]!, tieneBatallaEnCurso: false };

    const conUltimaActividad = candidatas.map((c) => {
        const ultima = c.enfrentamientos.reduce(
            (max, e) => Math.max(max, new Date(e.updatedAt).getTime() || 0),
            0,
        );
        return { c, ultima };
    });
    conUltimaActividad.sort((a, b) => b.ultima - a.ultima);
    return { ...conUltimaActividad[0]!.c, tieneBatallaEnCurso: false };
}

// Pantalla independiente de "próxima batalla / próxima presentación"
// (monitor secundario, tipo fila de banco): a diferencia de /pantalla, NO usa
// PantallaEstado ni SecuenciaOverlay — se actualiza sola con lo que ya está
// en la base de datos, sin que el staff tenga que seleccionar nada. Muestra
// SOLO una categoría a la vez, con esta prioridad:
//   1. Una categoría con una batalla 1v1 en curso de verdad ahora mismo.
//   2. Si ninguna: una categoría en Preselección con turno activo (alguien
//      presentando su coreografía en solitario).
//   3. Si ninguna de las anteriores: la categoría 1v1 con actividad más
//      reciente (entre batalla y batalla).
//   4. Si nada aplica: "Esperando la siguiente categoría...".
export default function TableroPage() {
    const [datos, setDatos] = useState<DatosTablero | null | undefined>(undefined);

    useEffect(() => {
        let cancelado = false;

        const poll = async () => {
            const resCategorias = await getCategoriasEstado();
            if (cancelado || !resCategorias.ok) return;

            const enCurso = resCategorias.data.categorias.filter((c) => c.estatus === "EN_CURSO");
            const enPreseleccion = resCategorias.data.categorias.filter((c) => c.estatus === "PRESELECCION");

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

            if (enPreseleccion.length > 0) {
                const turnos = await Promise.all(
                    enPreseleccion.map(async (categoria) => {
                        const resTurno = await getTurnoPreseleccionActual(categoria.categoria);
                        const turno = resTurno.ok ? resTurno.data.turno : null;
                        return turno ? { categoria, turno } : null;
                    }),
                );
                if (cancelado) return;

                const activos = turnos.filter((t): t is { categoria: CategoriaEstado; turno: NonNullable<TurnoPreseleccion> } => !!t);
                if (activos.length > 0) {
                    activos.sort((a, b) => new Date(b.turno.iniciadoEn).getTime() - new Date(a.turno.iniciadoEn).getTime());
                    const elegida = activos[0]!;
                    const resProximos = await getProximosPreseleccion(elegida.categoria.categoria);
                    if (cancelado) return;
                    setDatos({
                        tipo: "preseleccion",
                        categoria: elegida.categoria,
                        turno: elegida.turno,
                        proximos: resProximos.ok ? resProximos.data.proximos : [],
                    });
                    return;
                }
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
    }, []);

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

            {datos && (
                <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 pb-6 sm:px-10">
                    <div className="flex shrink-0 items-center justify-center">
                        <div className="relative -skew-x-6 border-y-2 border-boss-red bg-gradient-to-r from-boss-red-dark via-boss-red to-boss-red-dark px-10 py-1.5 shadow-lg shadow-boss-red/30">
                            <h2 className="skew-x-6 whitespace-nowrap font-display text-xl uppercase tracking-[0.25em] text-white sm:text-3xl">
                                {datos.categoria.label}
                            </h2>
                        </div>
                    </div>

                    {datos.tipo === "batalla" && (
                        <>
                            {datos.enCurso && (
                                <div className="relative mt-5 shrink-0 overflow-hidden rounded-2xl border-2 border-white/10 shadow-2xl shadow-black/60">
                                    <div className="fondo-vs-azul absolute inset-0" />
                                    <div className="fondo-vs-rojo absolute inset-0" />
                                    <div className="relative flex items-center justify-between bg-black/50 px-5 py-2 backdrop-blur-sm">
                                        <span className="font-display text-xs uppercase tracking-[0.25em] text-white sm:text-sm">
                                            {datos.enCurso.ronda}
                                        </span>
                                        <span className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.25em] text-white">
                                            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                                            En batalla
                                        </span>
                                    </div>
                                    <div className="relative flex items-center py-7 sm:py-8">
                                        <div className="flex-1 px-3 text-center">
                                            <p className="truncate font-display text-3xl uppercase text-white drop-shadow-[0_0_18px_rgba(31,111,255,0.85)] sm:text-5xl">
                                                {nombreCompetidor(datos.enCurso.competidorA)}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center justify-center px-2">
                                            <div className="animate-vs-destello flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-boss-black font-display text-lg text-white shadow-[0_0_25px_rgba(255,255,255,0.5)] sm:h-16 sm:w-16 sm:text-xl">
                                                VS
                                            </div>
                                        </div>
                                        <div className="flex-1 px-3 text-center">
                                            <p className="truncate font-display text-3xl uppercase text-white drop-shadow-[0_0_18px_rgba(226,9,26,0.85)] sm:text-5xl">
                                                {nombreCompetidor(datos.enCurso.competidorB)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {datos.proximas.length > 0 && (
                                <div className="mt-6 flex min-h-0 flex-1 flex-col">
                                    <p className="shrink-0 font-display text-lg uppercase tracking-widest text-boss-gray sm:text-2xl">
                                        Próximas batallas
                                    </p>
                                    <div className="mt-3 grid flex-1 grid-rows-5 gap-2.5">
                                        {datos.proximas.map((enfrentamiento, indice) => {
                                            const esSiguiente = indice === 0;
                                            return (
                                                <div
                                                    key={enfrentamiento.id}
                                                    className={[
                                                        "flex min-h-0 items-center gap-4 rounded-xl border px-4 transition-colors",
                                                        esSiguiente
                                                            ? "border-boss-red/60 bg-gradient-to-r from-boss-red/15 via-boss-panel to-boss-panel shadow-[0_0_22px_rgba(226,9,26,0.2)]"
                                                            : "border-boss-border bg-boss-panel/40",
                                                    ].join(" ")}
                                                >
                                                    <div
                                                        className={[
                                                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-base sm:h-9 sm:w-9 sm:text-lg",
                                                            esSiguiente
                                                                ? "bg-boss-red text-white shadow-[0_0_14px_rgba(226,9,26,0.7)]"
                                                                : "border border-boss-border bg-boss-black text-boss-gray",
                                                        ].join(" ")}
                                                    >
                                                        {indice + 1}
                                                    </div>
                                                    <span className="hidden shrink-0 whitespace-nowrap text-xs uppercase tracking-widest text-boss-gray sm:block sm:text-sm">
                                                        {enfrentamiento.ronda}
                                                    </span>
                                                    <div className="flex flex-1 items-center justify-center gap-3 overflow-hidden">
                                                        <span className="flex-1 truncate text-right font-display text-base uppercase text-boss-blue sm:text-lg">
                                                            {nombreCompetidor(enfrentamiento.competidorA)}
                                                        </span>
                                                        <span className="shrink-0 text-[10px] uppercase tracking-widest text-boss-gray">
                                                            vs
                                                        </span>
                                                        <span className="flex-1 truncate text-left font-display text-base uppercase text-boss-red sm:text-lg">
                                                            {nombreCompetidor(enfrentamiento.competidorB)}
                                                        </span>
                                                    </div>
                                                    {esSiguiente && (
                                                        <span className="hidden shrink-0 rounded-full bg-boss-red/15 px-3 py-1 font-display text-[10px] uppercase tracking-widest text-boss-red sm:block">
                                                            Siguiente
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {!datos.enCurso && datos.proximas.length === 0 && (
                                <p className="mt-6 text-center font-display text-lg uppercase tracking-widest text-boss-gray">
                                    Sin enfrentamientos pendientes en esta categoría.
                                </p>
                            )}
                        </>
                    )}

                    {datos.tipo === "preseleccion" && (
                        <>
                            <div className="relative mt-5 shrink-0 overflow-hidden rounded-2xl border-2 border-white/10 shadow-2xl shadow-black/60">
                                <div className="fondo-vs-azul absolute inset-0" />
                                <div className="relative flex items-center justify-between bg-black/50 px-5 py-2 backdrop-blur-sm">
                                    <span className="font-display text-xs uppercase tracking-[0.25em] text-white sm:text-sm">
                                        Preselección
                                    </span>
                                    <span className="flex items-center gap-2 font-display text-xs uppercase tracking-[0.25em] text-white">
                                        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                                        En tarima
                                    </span>
                                </div>
                                <div className="relative flex items-center justify-center py-8 sm:py-10">
                                    <p className="truncate px-4 text-center font-display text-4xl uppercase text-white drop-shadow-[0_0_18px_rgba(31,111,255,0.85)] sm:text-6xl">
                                        {nombreCompetidor(datos.turno.participante)}
                                    </p>
                                </div>
                            </div>

                            {datos.proximos.length > 0 && (
                                <div className="mt-6 flex min-h-0 flex-1 flex-col">
                                    <p className="shrink-0 font-display text-lg uppercase tracking-widest text-boss-gray sm:text-2xl">
                                        Próximas presentaciones
                                    </p>
                                    <div className="mt-3 grid flex-1 grid-rows-5 gap-2.5">
                                        {datos.proximos.map((participante, indice) => {
                                            const esSiguiente = indice === 0;
                                            return (
                                                <div
                                                    key={participante.id}
                                                    className={[
                                                        "flex min-h-0 items-center gap-4 rounded-xl border px-4 transition-colors",
                                                        esSiguiente
                                                            ? "border-boss-red/60 bg-gradient-to-r from-boss-red/15 via-boss-panel to-boss-panel shadow-[0_0_22px_rgba(226,9,26,0.2)]"
                                                            : "border-boss-border bg-boss-panel/40",
                                                    ].join(" ")}
                                                >
                                                    <div
                                                        className={[
                                                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-base sm:h-9 sm:w-9 sm:text-lg",
                                                            esSiguiente
                                                                ? "bg-boss-red text-white shadow-[0_0_14px_rgba(226,9,26,0.7)]"
                                                                : "border border-boss-border bg-boss-black text-boss-gray",
                                                        ].join(" ")}
                                                    >
                                                        {indice + 1}
                                                    </div>
                                                    <span className="flex-1 truncate text-center font-display text-base uppercase text-white sm:text-lg">
                                                        {nombreParticipante(participante)}
                                                    </span>
                                                    {esSiguiente && (
                                                        <span className="hidden shrink-0 rounded-full bg-boss-red/15 px-3 py-1 font-display text-[10px] uppercase tracking-widest text-boss-red sm:block">
                                                            Siguiente
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </main>
    );
}
