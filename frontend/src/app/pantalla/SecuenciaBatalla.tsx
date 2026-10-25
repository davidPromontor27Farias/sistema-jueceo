"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { CATEGORIAS } from "@/config/catalog";
import type { DesglosePuntaje, Enfrentamiento } from "@/lib/adminApi";
import { BracketMirror } from "./BracketMirror";

const DURACION_ANUNCIO_VS_MS = 5_000;
export const DURACION_TURNO_MS = 60_000;
const DURACION_RESULTADOS_MS = 7_000;
const DURACION_GANADOR_MS = 10_000;
const DURACION_BRACKET_MS = 8_000;
// Cuánto se queda /pantalla mostrando el aviso "¡EMPATE!" antes de reiniciar
// la secuencia completa para la ronda de desempate (ver iniciarEmpate).
const DURACION_EMPATE_MS = 6_000;
// Cuenta regresiva de suspenso (5, 4, 3, 2, 1) antes de revelar el
// resultado — solo para Semifinal y Final (ver RONDAS_CON_CONTEO_SUSPENSO),
// nunca para rondas tempranas.
const DURACION_CONTEO_MS = 5_000;
const RONDAS_CON_CONTEO_SUSPENSO = new Set(["Semifinal", "Final"]);

type FaseSecuencia =
    | "normal"
    | "anuncio_vs"
    | "turno_a"
    | "turno_b"
    | "esperando_jueces"
    | "empate"
    | "conteo"
    | "resultados"
    | "ganador"
    | "bracket";

export type EstadoSecuencia = {
    fase: FaseSecuencia;
    enfrentamiento: Enfrentamiento | null;
    segundosRestantes: number;
    // 1-indexado. Normalmente vuelta=1 de totalVueltas=1 (lo de siempre); en
    // una Final (rondasBaile=2) sube a vuelta=2 a la mitad de la secuencia —
    // ver el banner "RONDA X DE Y" en SecuenciaOverlay.
    vuelta: number;
    totalVueltas: number;
};

function nombreCompetidor(c: Enfrentamiento["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

type LimitesVuelta = {
    finTurnoA: number;
    finTurnoB: number;
};

// Límites (en ms desde que arrancó la batalla) de cada fase, UNA entrada por
// vuelta (rondasBaile: 1 de costumbre, 2 en Semifinal, 3 en la Final — ver
// filasParaRonda en backend/src/routes/competencia.ts). `enf.iniciadoEn` es
// la referencia fija de "cuándo arrancó" (a diferencia de updatedAt, que se
// mueve con cualquier cambio — cortar un turno lo pisaba y desincronizaba
// todo el cronómetro en vez de acortarlo). Sin fase de presentación: el
// turno de A arranca apenas termina el anuncio VS (o el turno B de la
// vuelta anterior), directo al conteo de 60s. Si el SUPER_ADMIN cortó un
// turno (ver POST /enfrentamientos/:id/cortar-turno), ese corte es UN solo
// timestamp absoluto en toda la base de datos (no uno por vuelta): se le
// asigna a la vuelta cuya ventana SIN cortar lo contiene — así un corte en
// la vuelta 1 no afecta por accidente el cálculo de la vuelta 2. Limitación
// conocida y aceptada: si se corta el mismo lado (A o B) en más de una
// vuelta de la misma Final, solo el corte más reciente queda guardado (el
// campo se sobreescribe) — para eso está el botón "Finalizar rondas de
// baile" (ver bailesFinalizadosEn), que no depende de estos cálculos.
export function calcularLimites(enf: Enfrentamiento): { finAnuncio: number; vueltas: LimitesVuelta[] } {
    const inicio = new Date(enf.iniciadoEn ?? enf.updatedAt).getTime();
    const finAnuncio = DURACION_ANUNCIO_VS_MS;
    const totalVueltas = Math.max(1, enf.rondasBaile || 1);
    const cortoA = enf.turnoACortadoEn ? new Date(enf.turnoACortadoEn).getTime() - inicio : null;
    const cortoB = enf.turnoBCortadoEn ? new Date(enf.turnoBCortadoEn).getTime() - inicio : null;

    const vueltas: LimitesVuelta[] = [];
    let cursor = finAnuncio;
    for (let i = 0; i < totalVueltas; i++) {
        const finTurnoAProgramado = cursor + DURACION_TURNO_MS;
        const finTurnoA = cortoA !== null && cortoA >= cursor && cortoA <= finTurnoAProgramado ? cortoA : finTurnoAProgramado;
        const finTurnoBProgramado = finTurnoA + DURACION_TURNO_MS;
        const finTurnoB =
            cortoB !== null && cortoB >= finTurnoA && cortoB <= finTurnoBProgramado ? cortoB : finTurnoBProgramado;
        vueltas.push({ finTurnoA, finTurnoB });
        cursor = finTurnoB;
    }
    return { finAnuncio, vueltas };
}

// Máquina de estados que reacciona sola al ciclo de vida de la batalla en
// curso de la categoría enfocada. Desde que el staff pone un enfrentamiento
// en EN_CURSO ("Iniciar batalla"):
//   anuncio_vs (5s, "Fulano VS Mengano" juntos) -> [turno_a (1min) ->
//   turno_b (1min)] x rondasBaile -> esperando_jueces (sin límite: los
//   jueces ya pudieron calificar desde que arrancó la batalla; aquí solo se
//   espera a que TODOS terminen) -> ganador (10s) -> vuelve a normal. Sin
//   fase intermedia de "le toca a": el turno de cada quien arranca directo
//   al conteo de 60s apenas termina el anuncio VS (o el turno anterior). El
//   bloque entre corchetes se repite rondasBaile veces seguidas SIN pasar
//   por esperando_jueces entre una vuelta y la siguiente (normal: 1 vez;
//   Final: 2 — ver rondasBaile en schema.prisma) — los jueces califican una
//   sola vez, sobre el total de todas las vueltas.
// No hace poll propio: usa los mismos `enfrentamientos` que ya está sondeando
// /pantalla cada 3s.
export function useSecuenciaBatalla(enfrentamientos: Enfrentamiento[]): EstadoSecuencia {
    const [fase, setFase] = useState<FaseSecuencia>("normal");
    const [activo, setActivo] = useState<Enfrentamiento | null>(null);
    const [segundosRestantes, setSegundosRestantes] = useState(30);
    const [vuelta, setVuelta] = useState(1);

    // Ids ya mostrados de punta a punta, para no repetir la secuencia si el
    // mismo enfrentamiento sigue apareciendo (ya FINALIZADO) en polls futuros.
    const mostradosRef = useRef<Set<string>>(new Set());
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const limpiarTimers = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
        timeoutRef.current = null;
        intervalRef.current = null;
    };

    // Última parada de la secuencia: el bracket completo de la categoría con
    // el ganador resaltado en su nuevo lugar (ver BracketMirror resaltarId).
    // Después de esto sí se marca mostradosRef y se vuelve a "normal".
    const iniciarBracket = (enf: Enfrentamiento) => {
        limpiarTimers();
        setActivo(enf);
        setFase("bracket");
        timeoutRef.current = setTimeout(() => {
            mostradosRef.current.add(enf.id);
            setFase("normal");
            setActivo(null);
        }, DURACION_BRACKET_MS);
    };

    const iniciarGanador = (enf: Enfrentamiento) => {
        limpiarTimers();
        setActivo(enf);
        setFase("ganador");
        timeoutRef.current = setTimeout(() => iniciarBracket(enf), DURACION_GANADOR_MS);
    };

    const iniciarEsperando = (enf: Enfrentamiento) => {
        limpiarTimers();
        setActivo(enf);
        setFase("esperando_jueces");
    };

    // Se intercala entre "esperando_jueces" y "ganador": mismo panel VS de
    // siempre, pero ya con el puntaje TOTAL de ambos competidores debajo de
    // su nombre (sin desglose por rubro — ver Simplificación del resultado
    // en pantalla principal; el desglose completo solo lo puede consultar
    // cada competidor desde su teléfono, ver /mi-desglose). Si el
    // enfrentamiento se resolvió sin puntajes (respaldo manual sin
    // calificaciones) esto no se llama, se salta directo a iniciarGanador.
    const iniciarResultados = (enf: Enfrentamiento) => {
        limpiarTimers();
        setActivo(enf);
        setFase("resultados");
        timeoutRef.current = setTimeout(() => iniciarGanador(enf), DURACION_RESULTADOS_MS);
    };

    // Suspenso antes de revelar el resultado: cuenta 5, 4, 3, 2, 1 y
    // entonces sigue la secuencia normal (resultados si hay puntajes, si no
    // directo a ganador). Solo se usa para Semifinal y Final (ver
    // iniciarRevelacion / RONDAS_CON_CONTEO_SUSPENSO) — las rondas tempranas
    // van directo, sin conteo.
    const iniciarConteo = (enf: Enfrentamiento, alTerminar: () => void) => {
        limpiarTimers();
        setActivo(enf);
        setFase("conteo");
        let restantes = Math.ceil(DURACION_CONTEO_MS / 1000);
        setSegundosRestantes(restantes);
        intervalRef.current = setInterval(() => {
            restantes -= 1;
            setSegundosRestantes(Math.max(restantes, 0));
        }, 1000);
        timeoutRef.current = setTimeout(alTerminar, DURACION_CONTEO_MS);
    };

    // Punto de entrada tras "esperando_jueces" cuando ya hay ganador: en
    // Semifinal y Final pasa primero por el conteo de suspenso antes de
    // mostrar nada del resultado; en el resto de las rondas va directo,
    // igual que siempre.
    const iniciarRevelacion = (enf: Enfrentamiento) => {
        // puntajeA/B (no desgloseA/B): el endpoint público de /enfrentamientos
        // ya no manda el desglose por rubro (ver Simplificación del resultado
        // en pantalla principal), así que esto ya no puede depender de que
        // venga — solo de que haya puntaje total que mostrar.
        const siguiente = () => (enf.puntajeA != null && enf.puntajeB != null ? iniciarResultados(enf) : iniciarGanador(enf));
        if (RONDAS_CON_CONTEO_SUSPENSO.has(enf.ronda)) {
            iniciarConteo(enf, siguiente);
        } else {
            siguiente();
        }
    };

    const iniciarTurno = (faseTurno: "turno_a" | "turno_b", enf: Enfrentamiento, duracionMs: number, vueltaActual: number) => {
        limpiarTimers();
        setActivo(enf);
        setFase(faseTurno);
        setVuelta(vueltaActual);
        let restantes = Math.max(Math.ceil(duracionMs / 1000), 0);
        setSegundosRestantes(restantes);
        intervalRef.current = setInterval(() => {
            restantes -= 1;
            setSegundosRestantes(Math.max(restantes, 0));
        }, 1000);
        const totalVueltas = Math.max(1, enf.rondasBaile || 1);
        const siguiente =
            faseTurno === "turno_a"
                ? () => iniciarTurno("turno_b", enf, DURACION_TURNO_MS, vueltaActual)
                : vueltaActual < totalVueltas
                  ? () => iniciarTurno("turno_a", enf, DURACION_TURNO_MS, vueltaActual + 1)
                  : () => iniciarEsperando(enf);
        timeoutRef.current = setTimeout(siguiente, Math.max(duracionMs, 0));
    };

    const iniciarAnuncioVs = (enf: Enfrentamiento, duracionMs: number) => {
        limpiarTimers();
        setActivo(enf);
        setFase("anuncio_vs");
        setVuelta(1);
        timeoutRef.current = setTimeout(() => iniciarTurno("turno_a", enf, DURACION_TURNO_MS, 1), Math.max(duracionMs, 0));
    };

    // Empate: el backend ya incrementó numeroDesempate y dejó la batalla
    // EN_CURSO para una ronda extra (ver intentarResolverEnfrentamiento). Se
    // muestra un aviso fijo (sin depender del tiempo transcurrido, es un
    // reinicio deliberado) y después se reinicia la secuencia completa desde
    // el anuncio VS para esta misma pareja (las dos vueltas de nuevo, si
    // rondasBaile=2).
    const iniciarEmpate = (enf: Enfrentamiento) => {
        limpiarTimers();
        setActivo(enf);
        setFase("empate");
        timeoutRef.current = setTimeout(() => iniciarAnuncioVs(enf, DURACION_ANUNCIO_VS_MS), DURACION_EMPATE_MS);
    };

    // Detecta que arrancó una batalla nueva en la categoría enfocada. El
    // trabajo se difiere con Promise.resolve().then(...) para no llamar
    // setState de forma síncrona dentro del cuerpo del efecto.
    useEffect(() => {
        if (fase !== "normal") return;
        const enCurso = enfrentamientos.find((e) => e.estatus === "EN_CURSO");
        if (!enCurso || mostradosRef.current.has(enCurso.id)) return;

        Promise.resolve().then(() => {
            // Misma referencia que calcularLimites (iniciadoEn, no
            // updatedAt): updatedAt se mueve con CUALQUIER cambio posterior
            // (cortar un turno, que un juez califique...), no solo con el
            // arranque real de la batalla. Usarlo acá desincronizaba el
            // cálculo de "en qué punto vamos" cada vez que esta pantalla (o
            // el panel de admin) se montaba de nuevo a mitad de una batalla
            // de varias vueltas (Semifinal/Final) — después del primer corte
            // ya no coincidía con iniciadoEn, y podía saltarse vueltas
            // enteras o repetir una ya pasada.
            const inicio = new Date(enCurso.iniciadoEn ?? enCurso.updatedAt).getTime();
            const transcurrido = Date.now() - inicio;
            const { finAnuncio, vueltas } = calcularLimites(enCurso);

            if (transcurrido < finAnuncio) {
                iniciarAnuncioVs(enCurso, finAnuncio - transcurrido);
                return;
            }
            for (let i = 0; i < vueltas.length; i++) {
                const v = vueltas[i]!;
                const numeroVuelta = i + 1;
                if (transcurrido < v.finTurnoA) {
                    iniciarTurno("turno_a", enCurso, v.finTurnoA - transcurrido, numeroVuelta);
                    return;
                }
                if (transcurrido < v.finTurnoB) {
                    iniciarTurno("turno_b", enCurso, v.finTurnoB - transcurrido, numeroVuelta);
                    return;
                }
            }
            iniciarEsperando(enCurso);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enfrentamientos, fase]);

    // Si el enfrentamiento que se estaba siguiendo ya no aparece en la lista
    // (cambió la categoría enfocada, o alguien lo borró a mano desde el
    // admin), no tiene caso seguir congelado mostrando su secuencia vieja —
    // se reinicia a "normal" para que el primer efecto pueda detectar desde
    // cero una batalla real de la categoría nueva (si la hay). Sin esto, una
    // batalla vieja sin resolver (ej. quedó en "esperando_jueces" de una
    // sesión de pruebas anterior) se queda pegada aunque se enfoque otra
    // categoría.
    useEffect(() => {
        if (fase === "normal" || !activo) return;
        if (enfrentamientos.some((e) => e.id === activo.id)) return;

        limpiarTimers();
        setFase("normal");
        setActivo(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enfrentamientos, fase, activo]);

    // Detecta que la batalla que esperábamos ya tiene ganador — o que empató
    // y el backend ya lanzó una ronda de desempate (numeroDesempate subió,
    // sigue EN_CURSO sin ganador). Si hay ganador, pasa a iniciarRevelacion
    // (conteo de suspenso solo en Semifinal/Final, luego resultados/ganador
    // según haya puntajes o no); si empató, pasa por el aviso de "empate"
    // antes de repetir la secuencia completa.
    useEffect(() => {
        if (fase !== "esperando_jueces" || !activo) return;
        const actualizado = enfrentamientos.find((e) => e.id === activo.id);
        if (!actualizado) return;

        const yaTieneGanador = actualizado.estatus === "FINALIZADO" && actualizado.ganador;
        const huboEmpateNuevo = actualizado.numeroDesempate > activo.numeroDesempate;
        if (!yaTieneGanador && !huboEmpateNuevo) return;

        Promise.resolve().then(() => {
            if (huboEmpateNuevo) {
                iniciarEmpate(actualizado);
            } else {
                iniciarRevelacion(actualizado);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enfrentamientos, fase, activo]);

    // Detecta que el SUPER_ADMIN cortó el turno EN VIVO (mientras esta pantalla
    // ya está mostrando ese turno, con su propio setTimeout corriendo hacia la
    // duración completa): si el corte llega por el siguiente poll, cancela ese
    // timer y pasa de inmediato a la siguiente fase, sin esperar el resto del
    // tiempo. Sin esto, calcularLimites() solo ayudaría a la próxima pantalla
    // que cargue de cero, no a las que ya están a la mitad del turno.
    //
    // Compara el VALOR del timestamp (no solo si ya había alguno) porque en
    // Semifinal/Final (rondasBaile 2-3) el mismo lado se corta una vez por
    // vuelta: `activo` sigue cargando el timestamp de la vuelta anterior
    // (nunca se limpia entre vueltas, ver backend POST
    // .../enfrentamientos/:id/cortar-turno), así que comparar solo "¿ya tenía
    // algo?" ignoraba cualquier corte a partir de la segunda vuelta. Comparar
    // el valor detecta que SÍ cambió (es un corte nuevo) aunque el campo ya
    // viniera con algo de una vuelta anterior.
    useEffect(() => {
        if ((fase !== "turno_a" && fase !== "turno_b") || !activo) return;
        const actualizado = enfrentamientos.find((e) => e.id === activo.id);
        if (!actualizado) return;

        const cortadoActivo = fase === "turno_a" ? activo.turnoACortadoEn : activo.turnoBCortadoEn;
        const cortadoActualizado = fase === "turno_a" ? actualizado.turnoACortadoEn : actualizado.turnoBCortadoEn;
        if (!cortadoActualizado || cortadoActualizado === cortadoActivo) return;

        Promise.resolve().then(() => {
            const totalVueltas = Math.max(1, actualizado.rondasBaile || 1);
            if (fase === "turno_a") {
                iniciarTurno("turno_b", actualizado, DURACION_TURNO_MS, vuelta);
            } else if (vuelta < totalVueltas) {
                iniciarTurno("turno_a", actualizado, DURACION_TURNO_MS, vuelta + 1);
            } else {
                iniciarEsperando(actualizado);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enfrentamientos, fase, activo, vuelta]);

    // Detecta que el SUPER_ADMIN marcó "Finalizar rondas de baile" (ver
    // bailesFinalizadosEn) mientras esta pantalla todavía está mostrando
    // alguna presentación o turno: salta directo a "esperando_jueces" sin
    // importar en qué vuelta/lado esté — es la señal autoritativa de que ya
    // se acabó de bailar, por encima de cualquier cálculo de tiempo.
    useEffect(() => {
        const enTurno = fase === "turno_a" || fase === "turno_b";
        if (!enTurno || !activo) return;
        const actualizado = enfrentamientos.find((e) => e.id === activo.id);
        if (!actualizado || activo.bailesFinalizadosEn || !actualizado.bailesFinalizadosEn) return;

        Promise.resolve().then(() => iniciarEsperando(actualizado));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enfrentamientos, fase, activo]);

    useEffect(() => limpiarTimers, []);

    return { fase, enfrentamiento: activo, segundosRestantes, vuelta, totalVueltas: Math.max(1, activo?.rondasBaile || 1) };
}

// "34" -> "00:34" (minutos:segundos), como en el diseño de referencia de
// Open Style — DURACION_TURNO_MS son 60s de costumbre, pero esto igual
// soporta turnos más largos sin desbordar el formato.
function formatoMmSs(totalSegundos: number): string {
    const segs = Math.max(0, totalSegundos);
    const minutos = Math.floor(segs / 60);
    const segundos = segs % 60;
    return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

// Acentos angulares rojos en las esquinas (ver diseño de referencia de Open
// Style): puramente decorativos, detrás del contenido, con clip-path en vez
// de imágenes para no depender de un asset adicional.
function AcentosEsquina() {
    const base = "absolute h-64 w-64 bg-boss-red/20";
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className={`${base} -left-16 -top-24 rotate-[18deg]`} style={{ clipPath: "polygon(0 0, 100% 15%, 35% 100%)" }} />
            <div className={`${base} -bottom-24 -left-10 -rotate-[24deg]`} style={{ clipPath: "polygon(0 0, 100% 10%, 40% 100%)" }} />
            <div className={`${base} -right-16 -top-20 rotate-[160deg]`} style={{ clipPath: "polygon(0 0, 100% 15%, 35% 100%)" }} />
            <div className={`${base} -bottom-28 -right-10 rotate-[135deg]`} style={{ clipPath: "polygon(0 0, 100% 10%, 40% 100%)" }} />
        </div>
    );
}

// Foto enmarcada con borde y resplandor del color del lado (azul/rojo), sin
// el degradado a negro de FotoCompetidorVs — ese degradado es para la foto
// "flotando" sobre el fondo a pantalla completa; aquí la foto vive dentro de
// un marco propio, como en el diseño de referencia.
function FotoCompetidorEncuadrada({ competidor, color }: { competidor: Enfrentamiento["competidorA"]; color: string }) {
    const nombre = nombreCompetidor(competidor);
    return (
        <div
            className="relative aspect-[4/5] w-[min(34vw,24rem)] shrink-0 overflow-hidden rounded-sm border-4 bg-boss-panel"
            style={{ borderColor: color, boxShadow: `0 0 24px ${color}, 0 0 64px ${color}` }}
        >
            {competidor?.fotoUrl ? (
                <Image src={competidor.fotoUrl} alt={nombre} fill unoptimized className="object-cover" />
            ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-6xl text-white">
                    {inicialesDe(nombre)}
                </div>
            )}
        </div>
    );
}

export function inicialesDe(nombre: string): string {
    const iniciales = nombre
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((palabra) => palabra[0]?.toUpperCase() ?? "")
        .join("");
    return iniciales || "?";
}

// Posiciones fijas (no aleatorias en cada render, para no reflowar) de las
// chispas de fondo de la pantalla de anuncio "VS".
const CHISPAS_FONDO = [
    { left: "6%", top: "18%", size: 6, delay: "0s" },
    { left: "16%", top: "70%", size: 4, delay: "0.4s" },
    { left: "28%", top: "38%", size: 5, delay: "1.1s" },
    { left: "40%", top: "82%", size: 3, delay: "0.7s" },
    { left: "50%", top: "22%", size: 4, delay: "1.9s" },
    { left: "60%", top: "78%", size: 3, delay: "1.4s" },
    { left: "72%", top: "40%", size: 5, delay: "0.2s" },
    { left: "84%", top: "66%", size: 4, delay: "1.3s" },
    { left: "92%", top: "28%", size: 6, delay: "0.9s" },
    { left: "22%", top: "88%", size: 3, delay: "2.1s" },
] as const;

export function ChispasFondo() {
    return (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
            {CHISPAS_FONDO.map((chispa, i) => (
                <span
                    key={i}
                    className="animate-ascua absolute rounded-full bg-gradient-to-b from-yellow-200 via-orange-400 to-red-600"
                    style={{
                        left: chispa.left,
                        top: chispa.top,
                        width: chispa.size,
                        height: chispa.size,
                        animationDelay: chispa.delay,
                        boxShadow: "0 0 8px 2px rgba(255,140,0,0.7)",
                    }}
                />
            ))}
        </div>
    );
}

// Silueta genérica de persona, para el marco de un competidor sin foto (ver
// FotoConBanner) — mismo recurso visual que el "FOTO NO DISPONIBLE" del
// diseño de referencia.
function SiluetaPersona({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden>
            <circle cx="50" cy="34" r="20" />
            <path d="M50 58c-25 0-40 15-40 34v6h80v-6c0-19-15-34-40-34z" />
        </svg>
    );
}

// Marco cuadrado con resplandor del color del lado (azul A / rojo B) y el
// nombre en una franja oscura sobrepuesta al pie de la foto — ver diseño de
// referencia de Open Style. Sin foto, cae a una silueta + "Foto no
// disponible" en vez de las iniciales (que sí se usan en el resto del panel
// admin): acá el marco es grande y una silueta se lee mejor que una o dos
// letras sueltas.
function FotoConBanner({ competidor, color }: { competidor: Enfrentamiento["competidorA"]; color: string }) {
    const nombre = nombreCompetidor(competidor);
    return (
        <div
            // Tamaño atado al alto disponible (no al ancho): con el header +
            // pie de fase + los dos marcos + "VS" compartiendo una sola
            // pantalla sin scroll, basarlo en el ancho desbordaba hacia abajo
            // en viewports bajos (el bug que reportó el cliente).
            className="relative aspect-square h-[min(54vh,32rem)] w-auto shrink-0 overflow-hidden rounded-sm border-4 bg-boss-panel"
            style={{ borderColor: color, boxShadow: `0 0 20px ${color}, 0 0 50px ${color}` }}
        >
            {competidor?.fotoUrl ? (
                <Image src={competidor.fotoUrl} alt={nombre} fill unoptimized className="object-cover" />
            ) : (
                <div
                    className="flex h-full w-full flex-col items-center justify-center gap-2 pb-[18%]"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, black)` }}
                >
                    <SiluetaPersona className="h-[45%] w-auto text-black/60" />
                    <span className="font-display text-xs uppercase tracking-widest text-white/70 sm:text-sm">
                        Foto no disponible
                    </span>
                </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-2 sm:px-5 sm:py-3">
                <p
                    className="w-full text-center font-display uppercase leading-tight text-white"
                    style={{ fontSize: "clamp(1rem, 2.6vw, 1.875rem)", overflowWrap: "break-word" }}
                >
                    {nombre}
                </p>
            </div>
        </div>
    );
}

// Foto del competidor a tamaño completo (sin marco redondo): se funde con el
// fondo con un degradado hacia abajo en vez de un borde duro. Si no tiene
// foto, cae a sus iniciales, igual que el resto del panel de admin.
const DEGRADADO_FOTO = "linear-gradient(to bottom, black 55%, transparent 100%)";

export function FotoCompetidorVs({
    competidor,
    grande = false,
    anchoClase,
}: {
    competidor: Enfrentamiento["competidorA"];
    grande?: boolean;
    // Override del ancho/alto por defecto de `grande` — lo usa la pantalla de
    // "ganador" para una foto más grande que la del recorrido de resultados
    // de Preselección (RecapPreseleccionOverlay), que sigue con el tamaño de
    // siempre.
    anchoClase?: string;
}) {
    const nombre = nombreCompetidor(competidor);
    // Ancho atado al alto real del viewport (no al ancho ni a breakpoints
    // fijos), con el alto derivado por aspect-ratio: así la foto se achica
    // sola en pantallas con menos alto disponible y nunca empuja el nombre
    // fuera de la vista (el bug que reportó el cliente).
    const tamanoClase = anchoClase ?? (grande ? "w-[min(30vh,18rem)] aspect-[4/5]" : "w-[min(20vh,11rem)] aspect-[4/5]");
    return (
        <div
            className={`relative z-10 shrink-0 overflow-hidden bg-boss-panel ${tamanoClase}`}
            style={{ maskImage: DEGRADADO_FOTO, WebkitMaskImage: DEGRADADO_FOTO }}
        >
            {competidor?.fotoUrl ? (
                <Image
                    src={competidor.fotoUrl}
                    alt={nombre}
                    width={grande ? 320 : 208}
                    height={grande ? 416 : 256}
                    unoptimized
                    className="h-full w-full object-cover"
                />
            ) : (
                <div className={`flex h-full w-full items-center justify-center font-display text-white ${grande ? "text-6xl" : "text-4xl"}`}>
                    {inicialesDe(nombre)}
                </div>
            )}
        </div>
    );
}

// Pantalla de dos lados (azul A / rojo B) con marcos cuadrados, nombre
// sobrepuesto al pie de cada foto y un "VS" fijo al centro — la reutilizan el
// anuncio inicial, la espera de calificación, el conteo de suspenso, el aviso
// de empate y los resultados (desglose de puntajes debajo de cada marco); lo
// único que cambia entre fases es el texto del pie (`centro`, ahora debajo de
// los marcos en vez de encimado) y si el "VS" lleva el destello de impacto
// (`vsDestacado`, solo en el anuncio inicial).
function PanelVersus({

    enfrentamiento,
    centro,
    debajoA,
    debajoB,
    vsDestacado = false,

}: {

    enfrentamiento: Enfrentamiento;
    centro?: ReactNode;
    debajoA?: ReactNode;
    debajoB?: ReactNode;
    vsDestacado?: boolean;

}) {
    return (
        <div className="absolute inset-0 flex flex-col overflow-hidden bg-boss-black">
            <AcentosEsquina />
            {/* Encabezado: logo grande + categoría/ronda grandes. */}
            <div className="relative z-10 flex shrink-0 items-center justify-between gap-6 px-8 pt-8 sm:px-16 sm:pt-10">
                <Image
                    src="/thebosslogo.jpeg"
                    alt="THE BOSS — Breaking Battles"
                    width={220}
                    height={180}
                    priority
                    className="h-auto w-28 shrink-0 rounded-md sm:w-44"
                />

                <div className="min-w-0 text-right">

                    {/* pr-*: el itálico (sintético, Anton no tiene variante itálica
                        real) dibuja tinta más allá del ancho lógico del texto en el
                        último carácter — sin este colchón, truncate lo recortaba justo
                        en el borde de la pantalla (se veía cortado aunque el texto
                        cupiera entero). */}
                    <p className="truncate font-display text-2xl uppercase italic leading-none text-white sm:text-5xl pr-1 sm:pr-2">
                        {CATEGORIAS[enfrentamiento.categoria]}
                    </p>
                    <p
                        className="mt-1 truncate font-display text-3xl uppercase italic leading-none text-white sm:text-6xl pr-1 sm:pr-3"
                        style={{ textShadow: "0 0 18px var(--color-boss-red), 0 0 40px var(--color-boss-red)" }}
                    >
                        {enfrentamiento.ronda}
                    </p>
                </div>
            </div>

            {/* Cuerpo: marco de A, "VS", marco de B. */}

            <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center gap-4 px-6 py-6 sm:gap-10 sm:px-14">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
                    <FotoConBanner competidor={enfrentamiento.competidorA} color="var(--color-boss-blue)" />
                    {debajoA}
                </div>
                <div className="relative shrink-0 px-1 sm:px-3">
                    {vsDestacado && (
                        <span className="animate-vs-destello absolute inset-0 m-auto h-20 w-20 rounded-full bg-white/70 blur-2xl sm:h-32 sm:w-32" />
                    )}
                    <span
                        className={`relative font-display text-4xl italic text-white sm:text-7xl ${vsDestacado ? "animate-impacto-fuego" : ""}`}
                        style={{
                            WebkitTextStroke: "3px var(--color-boss-red)",
                            textShadow: "0 4px 0 rgba(0,0,0,0.5), 0 0 24px var(--color-boss-red)",
                        }}
                    >

                        VS
                    </span>

                </div>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
                    <FotoConBanner competidor={enfrentamiento.competidorB} color="var(--color-boss-red)" />
                    {debajoB}
                </div>

            </div>
            {/* Pie: mensaje de la fase (Calificando, Resultados, Empate...). */}
            {centro && (
                <>

                    <div className="relative z-10 flex shrink-0 items-center justify-center px-8 py-6 text-center sm:py-8">

                        {centro}

                    </div>

                </>

            )}

        </div>

    );

} 

// Las 5 secciones del reglamento (Art. 35), en el mismo orden y con el mismo
// nombre que ya se usa en /admin/jueceo para calificar (nombre completo, no
// abreviado, aunque la tarjeta sea angosta).
const CRITERIOS_DESGLOSE: { clave: keyof DesglosePuntaje; label: string }[] = [
    { clave: "tecnica", label: "Técnica" },
    { clave: "ejecucion", label: "Ejecución" },
    { clave: "vocabulario", label: "Vocabulario" },
    { clave: "musicalidad", label: "Musicalidad" },
    { clave: "originalidad", label: "Originalidad" },
];

// Solo el puntaje TOTAL de un competidor en la fase "resultados" — sin
// desglose por rubro (ver Simplificación del resultado en pantalla
// principal). El desglose completo (DesgloseCompetidor, debajo) ya no se usa
// en la pantalla pública, solo en /mi-desglose.
function PuntajeTotalCompetidor({ puntaje, color }: { puntaje: number; color: string }) {
    return (
        <p className="relative z-10 font-display text-5xl sm:text-7xl" style={{ color }}>
            {puntaje}
        </p>
    );
}

// Desglose por sección + puntaje total, debajo del nombre de un competidor.
// Ya no se usa en la pantalla pública (ver PuntajeTotalCompetidor, arriba) —
// solo lo consume la página de consulta individual /mi-desglose, que sí
// puede mostrar el desglose completo a cada competidor desde su teléfono.
export function DesgloseCompetidor({ desglose, puntaje, color }: { desglose: DesglosePuntaje; puntaje: number; color: string }) {
    return (
        <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="flex flex-wrap justify-center gap-2">
                {CRITERIOS_DESGLOSE.map(({ clave, label }) => (
                    <div
                        key={clave}
                        className="flex w-20 flex-col items-center rounded-md border px-1 py-2 sm:w-28"
                        style={{ borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)` }}
                    >
                        <span className="break-words text-center text-xs font-semibold uppercase leading-tight tracking-wide text-white/85 sm:text-sm">
                            {label}
                        </span>
                        <span className="font-display text-xl text-white sm:text-2xl">{desglose[clave]}</span>
                    </div>
                ))}
            </div>
            <p className="font-display text-3xl sm:text-5xl" style={{ color }}>
                {puntaje}
            </p>
        </div>
    );
}

export function SecuenciaOverlay({
    fase,
    enfrentamiento,
    segundosRestantes,
    vuelta,
    totalVueltas,
    todosLosEnfrentamientos,
}: EstadoSecuencia & {
    // Todos los enfrentamientos de la categoría enfocada (no solo el activo),
    // para poder dibujar el bracket completo en la fase "bracket".
    todosLosEnfrentamientos: Enfrentamiento[];
}) {
    if (fase === "normal" || !enfrentamiento) return null;

    const esTurnoDeA = fase === "turno_a";
    const competidorEnTurno = esTurnoDeA ? enfrentamiento.competidorA : enfrentamiento.competidorB;

    // nombreRonda() (backend) siempre le pone "Final" a la última ronda de una
    // categoría sin importar cuántas rondas tenga en total, así que es una señal
    // confiable de que este ganador es el campeón de toda la categoría.
    const esCampeonDeCategoria = enfrentamiento.ronda === "Final";
    const hayPuntajes = enfrentamiento.puntajeA != null && enfrentamiento.puntajeB != null;
    const ganoA = enfrentamiento.ganador?.id === enfrentamiento.competidorA?.id;
    // Solo tiene sentido mostrarla durante el turno de A/B — "esperando"/
    // "resultados"/"ganador" ya terminaron todas las vueltas.
    const mostrarVuelta = totalVueltas > 1 && (fase === "turno_a" || fase === "turno_b");

    const enTurno = fase === "turno_a" || fase === "turno_b";
    // Tanto el turno de A/B como PanelVersus (empate, anuncio_vs,
    // esperando_jueces, conteo, resultados) y la pantalla de "ganador" ya
    // traen su propio encabezado grande (logo + categoría + ronda, ver
    // diseño de referencia), así que no se duplica acá arriba el renglón
    // genérico chico — solo lo necesita "bracket".
    const tieneEncabezadoPropio =
        enTurno ||
        fase === "empate" ||
        fase === "anuncio_vs" ||
        fase === "esperando_jueces" ||
        fase === "conteo" ||
        fase === "ganador" ||
        (fase === "resultados" && hayPuntajes);

    return (
        <main className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-boss-black px-8 text-center">
            {!tieneEncabezadoPropio && (
                <p className="absolute inset-x-0 top-10 z-10 font-display text-lg uppercase tracking-widest text-boss-gray">
                    {CATEGORIAS[enfrentamiento.categoria]} · {enfrentamiento.ronda}
                    {mostrarVuelta && <span className="text-white"> · Ronda {vuelta} de {totalVueltas}</span>}
                    {enfrentamiento.numeroDesempate > 0 && (
                        <span className="text-yellow-400"> · Ronda de desempate {enfrentamiento.numeroDesempate}</span>
                    )}
                </p>
            )}

            {fase === "empate" && (
                <PanelVersus
                    enfrentamiento={enfrentamiento}
                    centro={
                        <div className="flex flex-col items-center gap-2">
                            <span className="animate-impacto-fuego font-display text-6xl italic text-yellow-400 [text-shadow:0_4px_0_rgba(0,0,0,0.5),0_0_24px_rgba(250,204,21,0.9)] sm:text-8xl">
                                ¡EMPATE!
                            </span>
                            <span className="font-display text-lg uppercase tracking-widest text-white sm:text-2xl">
                                Ronda de desempate {enfrentamiento.numeroDesempate}
                            </span>
                        </div>
                    }
                    debajoA={<PuntajeTotalCompetidor puntaje={enfrentamiento.puntajeEmpateA ?? 0} color="var(--color-boss-blue)" />}
                    debajoB={<PuntajeTotalCompetidor puntaje={enfrentamiento.puntajeEmpateB ?? 0} color="var(--color-boss-red)" />}
                />
            )}

            {fase === "anuncio_vs" && <PanelVersus enfrentamiento={enfrentamiento} vsDestacado />}

            {enTurno && (
                <div
                    key={esTurnoDeA ? "reflector-a" : "reflector-b"}
                    className="animate-reflector-entrada absolute inset-0 flex flex-col overflow-hidden bg-boss-black text-left"
                >
                    <AcentosEsquina />

                    {/* Encabezado: logo grande + categoría/ronda grandes, como en el
                        diseño de referencia de Open Style. */}
                    <div className="relative z-10 flex shrink-0 items-center justify-between gap-6 px-8 pt-8 sm:px-16 sm:pt-10">
                        <Image
                            src="/thebosslogo.jpeg"
                            alt="THE BOSS — Breaking Battles"
                            width={220}
                            height={180}
                            priority
                            className="h-auto w-28 shrink-0 rounded-md sm:w-44"
                        />
                        <div className="min-w-0 text-right">
                            {/* pr-*: ver nota en PanelVersus — el itálico sintético
                                desborda tinta del lado derecho del último carácter. */}
                            <p className="truncate font-display text-2xl uppercase italic leading-none text-white sm:text-5xl pr-1 sm:pr-2">
                                {CATEGORIAS[enfrentamiento.categoria]}
                            </p>
                            <p
                                className="mt-1 truncate font-display text-3xl uppercase italic leading-none text-white sm:text-6xl pr-1 sm:pr-3"
                                style={{
                                    textShadow: `0 0 18px ${esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)"}, 0 0 40px ${
                                        esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)"
                                    }`,
                                }}
                            >
                                {enfrentamiento.ronda}
                            </p>
                        </div>
                    </div>

                    <div className="relative z-10 mt-6 h-1 shrink-0 bg-boss-red shadow-[0_0_12px_var(--color-boss-red)] sm:mt-8" />

                    {/* Cuerpo: foto enmarcada a la izquierda, info a la derecha. */}
                    <div className="relative z-10 flex min-h-0 flex-1 items-center gap-8 px-8 py-8 sm:gap-14 sm:px-16">
                        <FotoCompetidorEncuadrada
                            competidor={competidorEnTurno}
                            color={esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)"}
                        />

                        <div className="flex min-w-0 flex-1 flex-col items-start gap-4 sm:gap-6">
                            <span
                                className="inline-block -skew-x-6 px-5 py-1.5 sm:px-8 sm:py-2.5"
                                style={{ backgroundColor: esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)" }}
                            >
                                <span className="inline-block skew-x-6 font-display text-xl uppercase tracking-wide text-white sm:text-3xl">
                                    En batalla
                                </span>
                            </span>

                            <p
                                className="w-full font-display uppercase italic leading-[0.95] text-white"
                                style={{
                                    // clamp en vez de truncar: con nombres largos se achica solo
                                    // (hasta cierto punto) y si de plano no alcanza, se envuelve a
                                    // una segunda línea — nunca se corta con "...".
                                    fontSize: "clamp(2.25rem, 6vw, 6rem)",
                                    overflowWrap: "break-word",
                                    WebkitTextStroke: `2px ${esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)"}`,
                                    textShadow: `0 0 24px ${esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)"}`,
                                }}
                            >
                                {nombreCompetidor(competidorEnTurno)}
                            </p>

                            {mostrarVuelta && (
                                <div className="flex items-center gap-3">
                                    <span
                                        className="h-px w-10 sm:w-14"
                                        style={{ backgroundColor: esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)" }}
                                    />
                                    <span className="font-display text-sm uppercase tracking-[0.3em] text-white/80 sm:text-lg">
                                        Round {vuelta} de {totalVueltas}
                                    </span>
                                    <span
                                        className="h-px w-10 sm:w-14"
                                        style={{ backgroundColor: esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)" }}
                                    />
                                </div>
                            )}

                            <p
                                key={segundosRestantes}
                                className="animate-numero-pop font-display text-7xl text-white sm:text-9xl"
                                style={{
                                    textShadow: esTurnoDeA
                                        ? "0 0 28px var(--color-boss-blue), 0 0 56px var(--color-boss-blue)"
                                        : "0 0 28px var(--color-boss-red), 0 0 56px var(--color-boss-red)",
                                }}
                            >
                                {formatoMmSs(segundosRestantes)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {fase === "esperando_jueces" && (
                <PanelVersus
                    enfrentamiento={enfrentamiento}
                    centro={
                        <p className="animate-pulso-suave font-display text-4xl uppercase italic text-white [text-shadow:0_4px_0_rgba(0,0,0,0.5),0_0_24px_rgba(255,255,255,0.6)] sm:text-6xl">
                            Calificando
                        </p>
                    }
                />
            )}

            {fase === "conteo" && (
                <PanelVersus
                    enfrentamiento={enfrentamiento}
                    centro={
                        <div className="flex flex-col items-center gap-2">
                            <span className="font-display text-lg uppercase tracking-widest text-white sm:text-2xl">
                                Revelando resultado en...
                            </span>
                            <span
                                key={segundosRestantes}
                                className="animate-numero-pop font-display text-7xl text-white sm:text-9xl"
                                style={{ textShadow: "0 0 28px rgba(255,255,255,0.8), 0 0 56px rgba(255,255,255,0.5)" }}
                            >
                                {segundosRestantes}
                            </span>
                        </div>
                    }
                />
            )}

            {fase === "resultados" && hayPuntajes && (
                <PanelVersus
                    enfrentamiento={enfrentamiento}
                    centro={
                        <p className="font-display text-3xl uppercase italic text-white [text-shadow:0_4px_0_rgba(0,0,0,0.5),0_0_24px_rgba(255,255,255,0.6)] sm:text-5xl">
                            Resultados
                        </p>
                    }
                    debajoA={<PuntajeTotalCompetidor puntaje={enfrentamiento.puntajeA ?? 0} color="var(--color-boss-blue)" />}
                    debajoB={<PuntajeTotalCompetidor puntaje={enfrentamiento.puntajeB ?? 0} color="var(--color-boss-red)" />}
                />
            )}

            {fase === "ganador" && (
                <div
                    key={ganoA ? "ganador-a" : "ganador-b"}
                    className="animate-reflector-entrada absolute inset-0 flex flex-col justify-between overflow-hidden bg-black p-4 sm:p-8 select-none"
                >
                    {/* Fondo temático / gradiente */}
                    <div
                    className={`absolute inset-0 pointer-events-none opacity-40 bg-radial from-transparent to-black ${
                        ganoA ? "fondo-ganador-azul" : "fondo-ganador-rojo"
                    }`}
                    />

                    {/* ================= HEADER SUPERIOR ================= */}
                    <header className="relative z-10 flex items-center justify-between gap-6 border-b border-red-600/60 pb-3">
                    {/* Logotipo del evento — mismo logo e igual de grande que en
                        PanelVersus y el encabezado de "en batalla", no el wordmark
                        de texto chico que había antes. */}
                    <Image
                        src="/thebosslogo.jpeg"
                        alt="THE BOSS — Breaking Battles"
                        width={220}
                        height={180}
                        priority
                        className="h-auto w-24 shrink-0 rounded-md drop-shadow-[0_0_15px_rgba(255,0,0,0.7)] sm:w-40"
                    />

                    {/* Categoría y Fase de la batalla — mismo tamaño grande que el
                        resto de la secuencia (ver PanelVersus); pr-*: colchón para
                        el itálico sintético, ver nota ahí. */}
                    <div className="min-w-0 text-right">
                        <h2 className="truncate font-display text-xl uppercase italic leading-none text-white drop-shadow-md sm:text-4xl pr-1 sm:pr-2">
                        {CATEGORIAS[enfrentamiento.categoria]}
                        </h2>
                        <p className="mt-1 truncate font-display text-2xl uppercase italic leading-none text-red-500 drop-shadow-md sm:text-5xl pr-1 sm:pr-3">
                        {enfrentamiento.ronda}
                        </p>
                    </div>
                    </header>

                    {/* ================= CONTENIDO PRINCIPAL ================= */}
                    <main className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 items-center flex-1 py-4">
                    
                    {/* Columna Izquierda: Foto del Competidor */}
                    <div className="md:col-span-5 flex justify-center items-center">
                        <div
                        className={`relative p-1 rounded-sm shadow-2xl transition-all ${
                            ganoA
                            ? "border-2 border-blue-500 shadow-[0_0_25px_rgba(59,130,246,0.6)]"
                            : "border-2 border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.6)]"
                        }`}
                        >
                        {/* Marco decorativo de esquina o brillo */}
                        <div className="overflow-hidden rounded-sm bg-neutral-900 max-w-[420px] sm:max-w-[520px]">
                            <FotoCompetidorVs competidor={enfrentamiento.ganador} grande anchoClase="w-[min(46vh,30rem)] aspect-[4/5]" />
                        </div>
                        </div>
                    </div>

                    {/* Columna Derecha: Bloque de Información y Ganador */}
                    <div className="md:col-span-7 flex flex-col items-center justify-center text-center space-y-3 sm:space-y-4">
                        
                        {/* Banner ¡GANADOR! */}
                        <div
                        className={`relative px-8 py-2 transform -skew-x-12 border-2 ${
                            ganoA
                            ? "bg-blue-600/90 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.8)]"
                            : "bg-red-600/90 border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.8)]"
                        }`}
                        >
                        <span className="block transform skew-x-12 font-display text-2xl sm:text-4xl md:text-5xl font-black italic tracking-wider text-white uppercase drop-shadow-md">
                            {esCampeonDeCategoria ? "¡CAMPEÓN!" : "¡GANADOR!"}
                        </span>
                        </div>

                        {/* Nombre del Ganador */}
                        <h1
                        className={`font-display text-5xl sm:text-7xl md:text-8xl font-black uppercase tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] ${
                            esCampeonDeCategoria ? "animate-campeon text-yellow-400" : "animate-ganador"
                        }`}
                        >
                        {nombreCompetidor(enfrentamiento.ganador)}
                        </h1>

                        {/* Puntajes */}
                        {hayPuntajes && (
                        <div className="flex items-center gap-3 w-full justify-center">
                            <span className="h-[2px] w-12 sm:w-20 bg-blue-500/80" />
                            <p className="font-display text-2xl sm:text-4xl font-bold tracking-wide text-white drop-shadow">
                            {ganoA ? enfrentamiento.puntajeA : enfrentamiento.puntajeB} PUNTOS
                            </p>
                            <span className="h-[2px] w-12 sm:w-20 bg-blue-500/80" />
                        </div>
                        )}

                        {/* Placa Inferior / Siguiente Ronda */}
                        <div
                        className={`relative px-6 py-1.5 transform -skew-x-12 border ${
                            ganoA
                            ? "bg-blue-950/80 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)]"
                            : "bg-red-950/80 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                        }`}
                        >
                        <span className="block transform skew-x-12 font-display text-sm sm:text-lg md:text-xl font-bold italic tracking-widest text-white uppercase">
                            {esCampeonDeCategoria ? "CAMPEÓN DE LA CATEGORÍA" : "AVANZA A LA SIGUIENTE RONDA"}
                        </span>
                        </div>

                    </div>
                    </main>

                    {/* Borde inferior decorativo */}
                    <div className="relative z-10 border-t border-red-600/60 pt-2" />
                </div>
            )}

            {fase === "bracket" && (
                <div className="absolute inset-0 flex flex-col items-center bg-boss-black px-4 pb-6 pt-20 sm:px-8">
                    <p className="mb-2 font-display text-base uppercase tracking-widest text-yellow-300 sm:text-lg">
                        {nombreCompetidor(enfrentamiento.ganador)} avanza a la siguiente ronda
                    </p>
                    <div className="min-h-0 w-full flex-1">
                        <BracketMirror enfrentamientos={todosLosEnfrentamientos} resaltarId={enfrentamiento.ganador?.id} />
                    </div>
                </div>
            )}
        </main>
    );
}
