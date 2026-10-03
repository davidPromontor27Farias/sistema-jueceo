"use client";

import { useEffect, useRef, useState } from "react";
import type { Categoria } from "@/config/catalog";
import { CATEGORIAS } from "@/config/catalog";
import type { ResultadoPreseleccionItem, TurnoPreseleccion } from "@/lib/adminApi";
import { ChispasFondo, DesgloseCompetidor, DURACION_TURNO_MS, FotoCompetidorVs } from "./SecuenciaBatalla";

// "Le toca a..." antes de arrancar el conteo de un turno de Preselección —
// distinto del DURACION_PRESENTACION_MS de las batallas 1v1 (8s), acá son 7s.
export const DURACION_PRESENTACION_PRESELECCION_MS = 7_000;

// Cuánto se muestra cada participante en el recorrido de resultados (ver
// useRecapPreseleccion) una vez que se acabó la fila de turnos.
const DURACION_RECAP_POR_PARTICIPANTE_MS = 3_000;

type FaseSecuenciaPreseleccion = "normal" | "presentando" | "turno" | "calificando" | "resultados";

export type EstadoSecuenciaPreseleccion = {
    fase: FaseSecuenciaPreseleccion;
    turno: TurnoPreseleccion;
    segundosRestantes: number;
};

// Identifica un turno puntual (participante + momento en que arrancó), para
// distinguir "sigue siendo el mismo turno, solo que ya se completó su
// calificación" de "ya es un turno distinto".
function claveDe(turno: TurnoPreseleccion): string | null {
    if (!turno?.participante) return null;
    return `${turno.participante.id}-${turno.iniciadoEn}`;
}

// Máquina de estados equivalente a useSecuenciaBatalla pero para un turno
// individual de Preselección: presentación (7s) -> turno (30s) -> calificando
// (sin límite, espera a que todos los jueces activos terminen) ->
// resultados (nombre+categoría+puntaje+desglose). El avance al SIGUIENTE
// turno es responsabilidad del backend (ver avanzarTurnoPreseleccion y
// DURACION_RESULTADOS_PRESELECCION_MS en backend/src/routes/competencia.ts):
// este hook solo reacciona cuando, por poll, `turno` cambia a otra persona —
// no llama a ningún endpoint de avance.
export function useSecuenciaPreseleccion(turno: TurnoPreseleccion): EstadoSecuenciaPreseleccion {
    const [fase, setFase] = useState<FaseSecuenciaPreseleccion>("normal");
    const [activo, setActivo] = useState<TurnoPreseleccion>(null);
    const [segundosRestantes, setSegundosRestantes] = useState(30);

    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const limpiarTimers = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
        timeoutRef.current = null;
        intervalRef.current = null;
    };

    const iniciarCalificando = (t: NonNullable<TurnoPreseleccion>) => {
        limpiarTimers();
        setActivo(t);
        setFase("calificando");
    };

    const iniciarTurno = (t: NonNullable<TurnoPreseleccion>, duracionMs: number) => {
        limpiarTimers();
        setActivo(t);
        setFase("turno");
        let restantes = Math.max(Math.ceil(duracionMs / 1000), 0);
        setSegundosRestantes(restantes);
        intervalRef.current = setInterval(() => {
            restantes -= 1;
            setSegundosRestantes(Math.max(restantes, 0));
        }, 1000);
        timeoutRef.current = setTimeout(() => iniciarCalificando(t), Math.max(duracionMs, 0));
    };

    const iniciarPresentando = (t: NonNullable<TurnoPreseleccion>, duracionMs: number) => {
        limpiarTimers();
        setActivo(t);
        setFase("presentando");
        timeoutRef.current = setTimeout(() => iniciarTurno(t, DURACION_TURNO_MS), Math.max(duracionMs, 0));
    };

    // Detecta un turno nuevo (arrancando desde "normal") y arranca la
    // secuencia en el punto correcto según cuánto tiempo ya pasó desde
    // iniciadoEn — igual idea que calcularLimites en SecuenciaBatalla, con un
    // tramo más (presentación -> turno -> calificando).
    useEffect(() => {
        if (fase !== "normal" || !turno?.participante) return;

        Promise.resolve().then(() => {
            const transcurrido = Date.now() - new Date(turno.iniciadoEn).getTime();
            const finPresentacion = DURACION_PRESENTACION_PRESELECCION_MS;
            const finTurno = finPresentacion + DURACION_TURNO_MS;

            if (transcurrido < finPresentacion) {
                iniciarPresentando(turno, finPresentacion - transcurrido);
            } else if (transcurrido < finTurno) {
                iniciarTurno(turno, finTurno - transcurrido);
            } else {
                iniciarCalificando(turno);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turno, fase]);

    // El turno que se estaba mostrando ya no es el mismo (el staff avanzó a
    // mano, el backend avanzó solo tras el tiempo de resultados, o se limpió
    // al salir de Preselección): se reinicia para que el efecto de arriba
    // detecte el turno nuevo (o la ausencia de turno) desde cero.
    useEffect(() => {
        if (fase === "normal") return;
        if (claveDe(turno) === claveDe(activo)) return;

        limpiarTimers();
        setFase("normal");
        setActivo(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turno, fase, activo]);

    // Mismo turno que se venía mostrando, pero ya se completó la calificación
    // (todos los jueces activos calificaron): pasa a mostrar el resultado. Se
    // queda ahí hasta que el backend avance solo al siguiente turno, que el
    // efecto de arriba detecta como un turno "distinto".
    useEffect(() => {
        if (fase !== "calificando" || !turno?.completo) return;
        if (claveDe(turno) !== claveDe(activo)) return;

        limpiarTimers();
        setActivo(turno);
        setFase("resultados");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turno, fase, activo]);

    useEffect(() => limpiarTimers, []);

    return { fase, turno: activo, segundosRestantes };
}

export function SecuenciaPreseleccionOverlay({ fase, turno, segundosRestantes }: EstadoSecuenciaPreseleccion) {
    if (fase === "normal" || !turno) return null;

    const competidor = turno.participante;
    const nombre = competidor ? competidor.nombreArtistico || `${competidor.nombres} ${competidor.apellidos}` : "";

    return (
        <main className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-boss-black px-8 text-center">
            <p className="absolute inset-x-0 top-10 z-10 font-display text-lg uppercase tracking-widest text-boss-gray">
                {CATEGORIAS[turno.categoria]} · Preselección
            </p>

            {(fase === "presentando" || fase === "turno") && (
                <div key={competidor?.id ?? "sin-competidor"} className="animate-reflector-entrada absolute inset-0">
                    <div className="fondo-reflector-azul absolute inset-0" />
                    <ChispasFondo />

                    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 pt-10">
                        {fase === "presentando" && (
                            <p className="font-display text-xl uppercase tracking-widest text-[color:var(--color-boss-blue)] sm:text-2xl">
                                Le toca a...
                            </p>
                        )}

                        <FotoCompetidorVs competidor={competidor} grande />

                        <p className="max-w-[85%] truncate font-display text-3xl uppercase text-white sm:text-5xl">{nombre}</p>

                        {fase === "turno" && (
                            <p
                                key={segundosRestantes}
                                className="animate-numero-pop font-display text-7xl sm:text-8xl"
                                style={{
                                    color: "var(--color-boss-blue)",
                                    textShadow: "0 0 28px var(--color-boss-blue), 0 0 56px var(--color-boss-blue)",
                                }}
                            >
                                {segundosRestantes}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {(fase === "calificando" || fase === "resultados") && (
                <div className="absolute inset-0">
                    <div className="fondo-vs-azul absolute inset-0" />
                    <ChispasFondo />

                    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 pt-10">
                        <FotoCompetidorVs competidor={competidor} grande />
                        <p className="max-w-[85%] truncate font-display text-3xl uppercase text-white sm:text-5xl">{nombre}</p>

                        {fase === "calificando" && (
                            <p className="animate-pulso-suave font-display text-4xl uppercase italic text-white [text-shadow:0_4px_0_rgba(0,0,0,0.5),0_0_24px_rgba(255,255,255,0.6)] sm:text-6xl">
                                Calificando
                            </p>
                        )}

                        {fase === "resultados" && turno.desglose && (
                            <DesgloseCompetidor
                                desglose={turno.desglose}
                                puntaje={turno.puntajeTotal ?? 0}
                                color="var(--color-boss-blue)"
                            />
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}

// Una columna de la pantalla dividida: corre su PROPIA instancia de
// useSecuenciaPreseleccion (presentando -> turno -> calificando ->
// resultados), igual que la pantalla de un solo escenario, pero en una
// franja angosta en vez de a pantalla completa. El padre
// (SecuenciaPreseleccionMultiOverlay) ya filtró a solo escenarios con turno
// activo — si de todas formas llega sin turno, no dibuja nada (misma guarda
// que SecuenciaPreseleccionOverlay).
function ColumnaEscenario({
    escenarioNombre,
    turno,
}: {
    escenarioNombre: string;
    turno: TurnoPreseleccion;
}) {
    const secuencia = useSecuenciaPreseleccion(turno);
    if (secuencia.fase === "normal" || !secuencia.turno) return null;

    const { fase, turno: t, segundosRestantes } = secuencia;
    const competidor = t.participante;
    const nombre = competidor ? competidor.nombreArtistico || `${competidor.nombres} ${competidor.apellidos}` : "";

    return (
        <div className="relative h-full overflow-hidden border-l border-white/10 first:border-l-0">
            {(fase === "presentando" || fase === "turno") && <div className="fondo-reflector-azul absolute inset-0" />}
            {(fase === "calificando" || fase === "resultados") && <div className="fondo-vs-azul absolute inset-0" />}
            <ChispasFondo />

            <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 px-3 pt-16 text-center">
                <span className="rounded-full border border-white/30 bg-black/40 px-3 py-1 font-display text-xs uppercase tracking-widest text-white">
                    {escenarioNombre}
                </span>

                {fase === "presentando" && (
                    <p className="font-display text-sm uppercase tracking-widest text-[color:var(--color-boss-blue)] sm:text-base">
                        Le toca a...
                    </p>
                )}

                <FotoCompetidorVs competidor={competidor} />

                <p className="max-w-[92%] truncate font-display text-2xl uppercase text-white sm:text-4xl">{nombre}</p>

                {fase === "turno" && (
                    <p
                        key={segundosRestantes}
                        className="animate-numero-pop font-display text-4xl sm:text-5xl"
                        style={{ color: "var(--color-boss-blue)", textShadow: "0 0 20px var(--color-boss-blue)" }}
                    >
                        {segundosRestantes}
                    </p>
                )}

                {fase === "calificando" && (
                    <p className="animate-pulso-suave font-display text-base uppercase italic text-white sm:text-xl">
                        Calificando
                    </p>
                )}

                {fase === "resultados" && t.desglose && (
                    <DesgloseCompetidor desglose={t.desglose} puntaje={t.puntajeTotal ?? 0} color="var(--color-boss-blue)" />
                )}
            </div>
        </div>
    );
}

// Pantalla dividida según cuántos escenarios tienen a alguien en tarima
// AHORA MISMO (uno hasta tres, o los que sean): 1 columna si solo queda un
// escenario activo, 2 o 3 si varios están corriendo en simultáneo. El padre
// (pantalla/page.tsx) ya filtró `entradas` a solo los escenarios con turno
// activo, así que la cantidad de columnas se ajusta sola cuando algún
// escenario termina su fila (esa columna simplemente deja de venir en la
// lista y las demás se reacomodan).
export function SecuenciaPreseleccionMultiOverlay({
    categoria,
    entradas,
}: {
    categoria: Categoria;
    entradas: { escenarioId: string; escenarioNombre: string; turno: TurnoPreseleccion }[];
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
                    <ColumnaEscenario key={e.escenarioId} escenarioNombre={e.escenarioNombre} turno={e.turno} />
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
// bracket. `mostradosRef` evita que se repita en cada poll mientras la
// categoría se queda en ese estado (puede ser mucho rato, hasta que el admin
// genere el Top Bracket).
export function useRecapPreseleccion(
    categoria: Categoria | null,
    hayTurnoActivo: boolean,
    resultados: ResultadoPreseleccionItem[],
): EstadoRecapPreseleccion {
    const [indice, setIndice] = useState<number | null>(null);
    const mostradosRef = useRef<Set<Categoria>>(new Set());
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const listos = resultados.length > 0 && resultados.every((r) => r.completo);

    useEffect(() => {
        if (!categoria || hayTurnoActivo || !listos) return;
        if (mostradosRef.current.has(categoria)) return;
        setIndice(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categoria, hayTurnoActivo, listos]);

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
