"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Categoria } from "@/config/catalog";
import { CATEGORIAS } from "@/config/catalog";
import type { ResultadoPreseleccionItem } from "@/lib/adminApi";
import { ChispasFondo, FotoCompetidorVs } from "./SecuenciaBatalla";

// Cuánto se muestra cada participante en el recorrido de resultados (ver
// useRecapPreseleccion) una vez que todos ya tienen su calificación.
const DURACION_RECAP_POR_PARTICIPANTE_MS = 3_000;

// Sin tarima ni turno compartido (ver listado por escenario, tanto en
// admin/jueceo como acá): cada juez califica a su ritmo desde su propio
// listado, así que la pantalla pública ya no tiene nada que animar en vivo
// mientras están calificando — solo muestra, por escenario, quién va
// presentándose y quién ya tiene su calificación completa.
export function agruparPorEscenario(
    resultados: ResultadoPreseleccionItem[],
    escenarioId?: string | null,
): { nombre: string; participantes: ResultadoPreseleccionItem[] }[] {
    const filtrados = escenarioId ? resultados.filter((r) => r.escenarioId === escenarioId) : resultados;
    const mapa = new Map<string, ResultadoPreseleccionItem[]>();
    for (const r of filtrados) {
        const clave = r.escenarioNombre ?? "Sin escenario";
        if (!mapa.has(clave)) mapa.set(clave, []);
        mapa.get(clave)!.push(r);
    }
    return [...mapa.entries()].map(([nombre, participantes]) => ({ nombre, participantes }));
}

// Solo la grilla de columnas (sin "chrome" de pantalla completa) — la usa
// TableroPreseleccion (pantalla principal, con su propio <main> y encabezado)
// y también el tablero secundario (frontend/src/app/pantalla/tablero/page.tsx),
// que ya trae su propio layout/encabezado y solo necesita el roster en sí.
export function GridRosterPreseleccion({
    resultados,
    escenarioId,
}: {
    resultados: ResultadoPreseleccionItem[];
    escenarioId?: string | null;
}) {
    const grupos = agruparPorEscenario(resultados, escenarioId);
    if (grupos.length === 0) return null;

    const colsClase = grupos.length === 1 ? "grid-cols-1" : grupos.length === 2 ? "grid-cols-2" : "grid-cols-3";

    return (
        <div className={`grid h-full w-full ${colsClase}`}>
            {grupos.map((g) => (
                <ColumnaRosterEscenario key={g.nombre} escenarioNombre={g.nombre} participantes={g.participantes} />
            ))}
        </div>
    );
}

// Tablero de Preselección a pantalla completa: el roster de cada escenario
// activo, con quién ya tiene su calificación completa — sin puntajes (ver
// Privacidad de calificaciones en filtros, el endpoint público ya los manda
// ocultos mientras la categoría sigue en Preselección/Repechaje). Con
// `escenarioId` (pantalla física de un escenario) se ve solo esa columna;
// sin él, una columna por cada escenario que tenga competidores en esta
// categoría.
export function TableroPreseleccion({
    categoria,
    resultados,
    escenarioId,
}: {
    categoria: Categoria;
    resultados: ResultadoPreseleccionItem[];
    escenarioId?: string | null;
}) {
    if (agruparPorEscenario(resultados, escenarioId).length === 0) return null;

    return (
        <main className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-boss-black">
            <ChispasFondo />

            {/* Encabezado: logo + "1RA EDICIÓN" + categoría/fase grandes —
                mismo lenguaje que /pantalla/tablero (ver TableroBatalla) y el
                resto de la secuencia pública. */}
            <div className="relative z-10 flex shrink-0 items-center justify-between gap-6 px-6 pt-6 sm:px-10 sm:pt-8">
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
                        {CATEGORIAS[categoria]}
                    </h2>
                    <p
                        className="mt-1 truncate font-display text-2xl uppercase italic leading-none text-white sm:text-5xl pr-1 sm:pr-3"
                        style={{
                            WebkitTextStroke: "2px var(--color-boss-red)",
                            textShadow: "0 0 18px var(--color-boss-red), 0 0 40px var(--color-boss-red)",
                        }}
                    >
                        Preselección
                    </p>
                </div>
            </div>

            <div className="relative z-10 mx-6 mt-5 h-[3px] shrink-0 bg-boss-red shadow-[0_0_12px_var(--color-boss-red)] sm:mx-10 sm:mt-6" />

            <div className="relative z-10 min-h-0 flex-1">
                <GridRosterPreseleccion resultados={resultados} escenarioId={escenarioId} />
            </div>
        </main>
    );
}

function ColumnaRosterEscenario({
    escenarioNombre,
    participantes,
}: {
    escenarioNombre: string;
    participantes: ResultadoPreseleccionItem[];
}) {
    return (
        <div className="relative flex h-full flex-col overflow-hidden border-l border-white/10 px-4 pb-6 pt-6 first:border-l-0 sm:px-6">
            {/* Mismo banner rojo inclinado que usan los encabezados de
                sección en /resultados y /tablero (ver BannerSeccion). */}
            <div className="flex shrink-0 justify-center">
                <div className="relative -skew-x-6 bg-boss-red px-6 py-1.5 shadow-[0_0_20px_rgba(226,9,26,0.4)]">
                    <h3 className="skew-x-6 whitespace-nowrap font-display text-sm uppercase tracking-[0.2em] text-white sm:text-base">
                        {escenarioNombre}
                    </h3>
                </div>
            </div>

            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {participantes.map((p, i) => (
                    <div
                        key={p.id}
                        className="flex items-stretch overflow-hidden rounded-sm border border-white/15 bg-black/40"
                    >
                        <span className={`w-1.5 shrink-0 ${p.completo ? "bg-boss-green" : "bg-boss-red"}`} />
                        <div className="flex flex-1 items-center gap-3 px-3 py-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/25 font-display text-xs text-white sm:h-8 sm:w-8 sm:text-sm">
                                {i + 1}
                            </span>
                            <span className="flex-1 truncate font-display text-base uppercase text-white sm:text-lg">
                                {p.nombreArtistico || `${p.nombres} ${p.apellidos}`}
                            </span>
                            {p.completo ? (
                                <span className="shrink-0 rounded-full bg-boss-green/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-boss-green sm:text-xs">
                                    Calificado
                                </span>
                            ) : (
                                <span className="shrink-0 rounded-full bg-black/60 px-2 py-0.5 font-display text-[10px] uppercase tracking-wide text-boss-gray sm:text-xs">
                                    {p.calificacionesRecibidas}/{p.calificacionesEsperadas}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export type EstadoRecapPreseleccion = {
    activo: boolean;
    participante: ResultadoPreseleccionItem | null;
    posicion: number;
    total: number;
};

// Una vez que TODOS los participantes de la categoría quedaron calificados,
// recorre el ranking completo (mejor a peor puntaje) uno por uno antes de
// volver a la pantalla normal — así el público ve a todos los que pasaron
// antes de que el admin muestre el bracket. Es justo el momento en que se
// revelan los puntajes por primera vez (ver Privacidad de calificaciones en
// filtros: el backend solo manda puntajes reales en /preseleccion/resultados
// cuando TODOS ya terminaron). `mostradosRef` evita que se repita en cada
// poll mientras la categoría se queda en ese estado (puede ser mucho rato,
// hasta que el admin genere el Top Bracket) — pero es memoria del
// componente, se pierde si la pantalla se recarga. `permitirRecap` (true
// solo mientras la categoría sigue en PRESELECCION/REPECHAJE_DESEMPATE) es
// la guarda que de verdad importa: sin ella, recargar /pantalla con una
// categoría que ya pasó a bracket o ya finalizó hacía que el recorrido se
// repitiera desde cero, por encima de Brackets/Ganadores.
export function useRecapPreseleccion(
    categoria: Categoria | null,
    permitirRecap: boolean,
    resultados: ResultadoPreseleccionItem[],
): EstadoRecapPreseleccion {
    const [indice, setIndice] = useState<number | null>(null);
    const mostradosRef = useRef<Set<Categoria>>(new Set());
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // `puntajeTotal !== null` confirma que el backend YA reveló puntajes
    // reales (ver preseleccionRevelada en backend/src/routes/competencia.ts)
    // — sin este chequeo el recorrido podía arrancar apenas todos quedaban
    // calificados, mostrando "0 pts" para todos ANTES de que el admin
    // generara el Top Bracket (ver Privacidad de calificaciones en filtros).
    const listos =
        resultados.length > 0 && resultados.every((r) => r.completo) && resultados.every((r) => r.puntajeTotal !== null);

    useEffect(() => {
        if (!categoria || !listos || !permitirRecap) return;
        if (mostradosRef.current.has(categoria)) return;
        setIndice(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoria, listos, permitirRecap]);

    // Si el admin genera el Top Bracket mientras el recorrido ya está en
    // curso, lo corta de inmediato en vez de dejarlo terminar — la categoría
    // ya pasó a bracket, seguir mostrando el recorrido se vería desfasado.
    useEffect(() => {
        if (indice === null || permitirRecap) return;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIndice(null);
    }, [permitirRecap, indice]);

    useEffect(() => {
        if (indice === null) return;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (indice >= resultados.length) {
            if (categoria) mostradosRef.current.add(categoria);
            setIndice(null);
            return;
        }

        timeoutRef.current = setTimeout(
            () => setIndice((i) => (i === null ? null : i + 1)),
            DURACION_RECAP_POR_PARTICIPANTE_MS,
        );
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [indice]);

    if (indice === null || indice >= resultados.length) {
        return { activo: false, participante: null, posicion: 0, total: resultados.length };
    }
    return { activo: true, participante: resultados[indice] ?? null, posicion: indice + 1, total: resultados.length };
}

export function RecapPreseleccionOverlay({
    estado,
    categoria,
}: {
    estado: EstadoRecapPreseleccion;
    categoria: Categoria;
}) {
    if (!estado.activo || !estado.participante) return null;

    const p = estado.participante;
    const nombre = p.nombreArtistico || `${p.nombres} ${p.apellidos}`;

    return (
        <main className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-boss-black px-8 text-center">
            <p className="absolute inset-x-0 top-10 z-10 font-display text-lg uppercase tracking-widest text-boss-gray">
                {CATEGORIAS[categoria]} · Resultados de preselección · {estado.posicion}/{estado.total}
            </p>

            <div key={p.id} className="animate-reflector-entrada absolute inset-0">
                <div className="fondo-vs-azul absolute inset-0" />
                <ChispasFondo />

                <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 pt-10">
                    <FotoCompetidorVs competidor={p} grande />
                    <p className="max-w-[85%] truncate font-display text-4xl uppercase text-white sm:text-6xl">{nombre}</p>
                    <p className="font-display text-5xl sm:text-7xl" style={{ color: "var(--color-boss-blue)" }}>
                        {p.puntajeTotal ?? 0} <span className="text-xl uppercase tracking-widest text-boss-gray">pts</span>
                    </p>
                </div>
            </div>
        </main>
    );
}
