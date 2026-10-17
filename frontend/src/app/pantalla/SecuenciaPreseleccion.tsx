"use client";

import { useEffect, useRef, useState } from "react";
import type { Categoria } from "@/config/catalog";
import { CATEGORIAS } from "@/config/catalog";
import type { ResultadoPreseleccionItem, TurnoPreseleccion } from "@/lib/adminApi";
import { ChispasFondo, FotoCompetidorVs } from "./SecuenciaBatalla";

// Cuánto se muestra cada participante en el recorrido de resultados (ver
// useRecapPreseleccion) una vez que se acabó la fila de turnos.
const DURACION_RECAP_POR_PARTICIPANTE_MS = 3_000;

// Sin cronómetro en Preselección (ver Control manual de rutina): el cambio
// de fase lo decide el staff a mano, nunca un tiempo fijo.
// "esperando": no hay nadie en tarima todavía, pero quedan competidores en
// la cola — el staff no ha presionado "Iniciar turno". Sin nombre ni foto a
// propósito (no adelantar quién sigue), y por supuesto sin cronómetro.
// "en_tarima": el competidor está presentándose — nombre + foto, nada más.
// "calificando": el staff ya cortó su rutina y los jueces pueden calificar
// — tampoco se muestra ningún puntaje acá (ver Privacidad de calificaciones
// en filtros): el puntaje real solo se revela en el recorrido de resultados,
// una vez que se genera el Top Bracket (ver useRecapPreseleccion más abajo).
type FaseSecuenciaPreseleccion = "normal" | "esperando" | "en_tarima" | "calificando";

export type EstadoSecuenciaPreseleccion = {
    fase: FaseSecuenciaPreseleccion;
    turno: TurnoPreseleccion;
};

// Deriva la fase directamente del turno vigente + si quedan pendientes (poll
// cada 3s desde el padre) — no hay ningún timer propio que mantener: sin
// cronómetro, no hay nada que contar hacia atrás, solo reflejar lo que diga
// el backend.
export function useSecuenciaPreseleccion(turno: TurnoPreseleccion, hayPendientes: boolean): EstadoSecuenciaPreseleccion {
    if (!turno?.participante) return { fase: hayPendientes ? "esperando" : "normal", turno: null };
    return { fase: turno.cortado ? "calificando" : "en_tarima", turno };
}

export function SecuenciaPreseleccionOverlay({
    fase,
    turno,
    categoria,
}: EstadoSecuenciaPreseleccion & { categoria: Categoria }) {
    if (fase === "normal") return null;

    const competidor = turno?.participante ?? null;
    const nombre = competidor ? competidor.nombreArtistico || `${competidor.nombres} ${competidor.apellidos}` : "";

    return (
        <main className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-boss-black px-8 text-center">
            <p className="absolute inset-x-0 top-10 z-10 font-display text-lg uppercase tracking-widest text-boss-gray">
                {CATEGORIAS[categoria]} · Preselección
            </p>

            <div key={competidor?.id ?? "esperando"} className="animate-reflector-entrada absolute inset-0">
                <div className={fase === "en_tarima" ? "fondo-reflector-azul absolute inset-0" : "fondo-vs-azul absolute inset-0"} />
                <ChispasFondo />

                <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 pt-10">
                    {fase === "esperando" ? (
                        <p className="animate-pulso-suave font-display text-3xl uppercase italic text-white sm:text-5xl">
                            Siguiente competidor en un momento
                        </p>
                    ) : (
                        <>
                            <FotoCompetidorVs competidor={competidor} grande />

                            <p className="max-w-[85%] truncate font-display text-3xl uppercase text-white sm:text-5xl">{nombre}</p>

                            {fase === "calificando" && (
                                <p className="animate-pulso-suave font-display text-4xl uppercase italic text-white [text-shadow:0_4px_0_rgba(0,0,0,0.5),0_0_24px_rgba(255,255,255,0.6)] sm:text-6xl">
                                    Calificando
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </main>
    );
}

// Una columna de la pantalla dividida: refleja el turno de SU escenario, sin
// ningún cronómetro ni timer propio, igual que SecuenciaPreseleccionOverlay
// pero en una franja angosta. El padre (SecuenciaPreseleccionMultiOverlay) ya
// filtró a solo escenarios con turno activo o esperando — si de todas formas
// llega en fase "normal", no dibuja nada.
function ColumnaEscenario({
    escenarioNombre,
    turno,
    hayPendientes,
}: {
    escenarioNombre: string;
    turno: TurnoPreseleccion;
    hayPendientes: boolean;
}) {
    const { fase, turno: t } = useSecuenciaPreseleccion(turno, hayPendientes);
    if (fase === "normal") return null;

    const competidor = t?.participante ?? null;
    const nombre = competidor ? competidor.nombreArtistico || `${competidor.nombres} ${competidor.apellidos}` : "";

    return (
        <div className="relative h-full overflow-hidden border-l border-white/10 first:border-l-0">
            <div className={fase === "en_tarima" ? "fondo-reflector-azul absolute inset-0" : "fondo-vs-azul absolute inset-0"} />
            <ChispasFondo />

            <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 px-3 pt-16 text-center">
                <span className="rounded-full border border-white/30 bg-black/40 px-3 py-1 font-display text-xs uppercase tracking-widest text-white">
                    {escenarioNombre}
                </span>

                {fase === "esperando" ? (
                    <p className="animate-pulso-suave font-display text-lg uppercase italic text-white sm:text-2xl">
                        Siguiente en un momento
                    </p>
                ) : (
                    <>
                        <FotoCompetidorVs competidor={competidor} />

                        <p className="max-w-[92%] truncate font-display text-2xl uppercase text-white sm:text-4xl">{nombre}</p>

                        {fase === "calificando" && (
                            <p className="animate-pulso-suave font-display text-base uppercase italic text-white sm:text-xl">
                                Calificando
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// Pantalla dividida según cuántos escenarios tienen a alguien en tarima O
// están esperando el siguiente turno AHORA MISMO (uno hasta tres, o los que
// sean): 1 columna si solo queda un escenario activo, 2 o 3 si varios están
// corriendo en simultáneo. El padre (pantalla/page.tsx) ya filtró `entradas`
// a solo los escenarios con turno activo o pendientes, así que la cantidad
// de columnas se ajusta sola cuando algún escenario termina su fila de
// verdad (esa columna simplemente deja de venir en la lista y las demás se
// reacomodan).
export function SecuenciaPreseleccionMultiOverlay({
    categoria,
    entradas,
}: {
    categoria: Categoria;
    entradas: { escenarioId: string; escenarioNombre: string; turno: TurnoPreseleccion; hayPendientes: boolean }[];
}) {
    if (entradas.length === 0) return null;

    const colsClase = entradas.length === 1 ? "grid-cols-1" : entradas.length === 2 ? "grid-cols-2" : "grid-cols-3";

    return (
        <main className="fixed inset-0 z-50 overflow-hidden bg-boss-black">
            <p className="absolute inset-x-0 top-4 z-20 text-center font-display text-base uppercase tracking-widest text-boss-gray sm:text-lg">
                {CATEGORIAS[categoria]} · Preselección
            </p>
            <div className={`grid h-full w-full ${colsClase}`}>
                {entradas.map((e) => (
                    <ColumnaEscenario
                        key={e.escenarioId}
                        escenarioNombre={e.escenarioNombre}
                        turno={e.turno}
                        hayPendientes={e.hayPendientes}
                    />
                ))}
            </div>
        </main>
    );
}

export type EstadoRecapPreseleccion = {
    activo: boolean;
    participante: ResultadoPreseleccionItem | null;
    posicion: number;
    total: number;
};

// Una vez que se acaba la fila de turnos (turno === null) y todos los
// participantes quedaron calificados, recorre el ranking completo (mejor a
// peor puntaje) uno por uno antes de volver a la pantalla normal — así el
// público ve a todos los que pasaron antes de que el admin muestre el
// bracket. Es justo el momento en que se revelan los puntajes por primera
// vez (ver Privacidad de calificaciones en filtros: el backend solo manda
// puntajes reales en /preseleccion/resultados cuando TODOS ya terminaron).
// `mostradosRef` evita que se repita en cada poll mientras la categoría se
// queda en ese estado (puede ser mucho rato, hasta que el admin genere el
// Top Bracket) — pero es memoria del componente, se pierde si la pantalla se
// recarga. `permitirRecap` (true solo mientras la categoría sigue en
// PRESELECCION/REPECHAJE_DESEMPATE) es la guarda que de verdad importa: sin
// ella, recargar /pantalla con una categoría que ya pasó a bracket o ya
// finalizó hacía que el recorrido se repitiera desde cero, por encima de
// Brackets/Ganadores.
export function useRecapPreseleccion(
    categoria: Categoria | null,
    hayTurnoActivo: boolean,
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
        if (!categoria || hayTurnoActivo || !listos || !permitirRecap) return;
        if (mostradosRef.current.has(categoria)) return;
        setIndice(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoria, hayTurnoActivo, listos, permitirRecap]);

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
