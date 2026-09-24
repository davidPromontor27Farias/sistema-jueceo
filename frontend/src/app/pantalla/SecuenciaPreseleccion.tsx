"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIAS } from "@/config/catalog";
import type { TurnoPreseleccion } from "@/lib/adminApi";
import { ChispasFondo, DesgloseCompetidor, DURACION_TURNO_MS, FotoCompetidorVs } from "./SecuenciaBatalla";

// "Le toca a..." antes de arrancar el conteo de un turno de Preselección —
// distinto del DURACION_PRESENTACION_MS de las batallas 1v1 (8s), acá son 7s.
const DURACION_PRESENTACION_PRESELECCION_MS = 7_000;

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
