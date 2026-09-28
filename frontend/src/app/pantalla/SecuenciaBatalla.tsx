"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { CATEGORIAS } from "@/config/catalog";
import type { DesglosePuntaje, Enfrentamiento } from "@/lib/adminApi";
import { BracketMirror } from "./BracketMirror";

const DURACION_ANUNCIO_VS_MS = 5_000;
// Reusadas también por la secuencia de Preselección (turno individual), ver
// frontend/src/app/pantalla/SecuenciaPreseleccion.tsx: mismos 8s de
// presentación y 30s de turno, una sola fuente de verdad para ambos tiempos.
export const DURACION_PRESENTACION_MS = 8_000;
export const DURACION_TURNO_MS = 30_000;
const DURACION_RESULTADOS_MS = 7_000;
const DURACION_GANADOR_MS = 10_000;
const DURACION_BRACKET_MS = 8_000;
// Cuánto se queda /pantalla mostrando el aviso "¡EMPATE!" antes de reiniciar
// la secuencia completa para la ronda de desempate (ver iniciarEmpate).
const DURACION_EMPATE_MS = 6_000;

type FaseSecuencia =
    | "normal"
    | "anuncio_vs"
    | "presentando_a"
    | "turno_a"
    | "presentando_b"
    | "turno_b"
    | "esperando_jueces"
    | "empate"
    | "resultados"
    | "ganador"
    | "bracket";

export type EstadoSecuencia = {
    fase: FaseSecuencia;
    enfrentamiento: Enfrentamiento | null;
    segundosRestantes: number;
};

function nombreCompetidor(c: Enfrentamiento["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

// Límites (en ms desde que arrancó la batalla) de cada fase. Si el SUPER_ADMIN
// cortó un turno (ver POST /enfrentamientos/:id/cortar-turno), ese corte
// reemplaza la duración fija del turno para todo lo que viene después —
// el competidor B no espera a que se agote el minuto completo de A.
function calcularLimites(enf: Enfrentamiento) {
    const inicio = new Date(enf.updatedAt).getTime();
    const finAnuncio = DURACION_ANUNCIO_VS_MS;
    const finPresentacionA = finAnuncio + DURACION_PRESENTACION_MS;
    const finTurnoAProgramado = finPresentacionA + DURACION_TURNO_MS;
    const finTurnoA = enf.turnoACortadoEn
        ? Math.min(Math.max(new Date(enf.turnoACortadoEn).getTime() - inicio, finPresentacionA), finTurnoAProgramado)
        : finTurnoAProgramado;
    const finPresentacionB = finTurnoA + DURACION_PRESENTACION_MS;
    const finTurnoBProgramado = finPresentacionB + DURACION_TURNO_MS;
    const finTurnoB = enf.turnoBCortadoEn
        ? Math.min(Math.max(new Date(enf.turnoBCortadoEn).getTime() - inicio, finPresentacionB), finTurnoBProgramado)
        : finTurnoBProgramado;
    return { finAnuncio, finPresentacionA, finTurnoA, finPresentacionB, finTurnoB };
}

// Máquina de estados que reacciona sola al ciclo de vida de la batalla en
// curso de la categoría enfocada. Desde que el staff pone un enfrentamiento
// en EN_CURSO ("Iniciar batalla"):
//   anuncio_vs (5s, "Fulano VS Mengano" juntos) -> presentando_a (8s, nombre
//   del competidor A solo) -> turno_a (30s, su participación) ->
//   presentando_b (8s) -> turno_b (30s) -> esperando_jueces (sin límite: los
//   jueces ya pudieron calificar desde que arrancó la batalla; aquí solo se
//   espera a que TODOS terminen) -> ganador (10s) -> vuelve a normal.
// No hace poll propio: usa los mismos `enfrentamientos` que ya está sondeando
// /pantalla cada 3s.
export function useSecuenciaBatalla(enfrentamientos: Enfrentamiento[]): EstadoSecuencia {
    const [fase, setFase] = useState<FaseSecuencia>("normal");
    const [activo, setActivo] = useState<Enfrentamiento | null>(null);
    const [segundosRestantes, setSegundosRestantes] = useState(30);

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
    // siempre, pero ya con el desglose de puntajes de ambos competidores
    // debajo de su nombre. Si el enfrentamiento se resolvió sin puntajes
    // (respaldo manual sin calificaciones) esto no se llama, se salta directo
    // a iniciarGanador.
    const iniciarResultados = (enf: Enfrentamiento) => {
        limpiarTimers();
        setActivo(enf);
        setFase("resultados");
        timeoutRef.current = setTimeout(() => iniciarGanador(enf), DURACION_RESULTADOS_MS);
    };

    const iniciarTurno = (fase: "turno_a" | "turno_b", enf: Enfrentamiento, duracionMs: number) => {
        limpiarTimers();
        setActivo(enf);
        setFase(fase);
        let restantes = Math.max(Math.ceil(duracionMs / 1000), 0);
        setSegundosRestantes(restantes);
        intervalRef.current = setInterval(() => {
            restantes -= 1;
            setSegundosRestantes(Math.max(restantes, 0));
        }, 1000);
        const siguiente =
            fase === "turno_a" ? () => iniciarPresentando("presentando_b", enf, DURACION_PRESENTACION_MS) : () => iniciarEsperando(enf);
        timeoutRef.current = setTimeout(siguiente, Math.max(duracionMs, 0));
    };

    const iniciarPresentando = (fase: "presentando_a" | "presentando_b", enf: Enfrentamiento, duracionMs: number) => {
        limpiarTimers();
        setActivo(enf);
        setFase(fase);
        const siguiente = fase === "presentando_a" ? "turno_a" : "turno_b";
        timeoutRef.current = setTimeout(() => iniciarTurno(siguiente, enf, DURACION_TURNO_MS), Math.max(duracionMs, 0));
    };

    const iniciarAnuncioVs = (enf: Enfrentamiento, duracionMs: number) => {
        limpiarTimers();
        setActivo(enf);
        setFase("anuncio_vs");
        timeoutRef.current = setTimeout(
            () => iniciarPresentando("presentando_a", enf, DURACION_PRESENTACION_MS),
            Math.max(duracionMs, 0),
        );
    };

    // Empate: el backend ya incrementó numeroDesempate y dejó la batalla
    // EN_CURSO para una ronda extra (ver intentarResolverEnfrentamiento). Se
    // muestra un aviso fijo (sin depender del tiempo transcurrido, es un
    // reinicio deliberado) y después se reinicia la secuencia completa desde
    // el anuncio VS para esta misma pareja.
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
            const transcurrido = Date.now() - new Date(enCurso.updatedAt).getTime();
            const { finAnuncio, finPresentacionA, finTurnoA, finPresentacionB, finTurnoB } = calcularLimites(enCurso);

            if (transcurrido < finAnuncio) {
                iniciarAnuncioVs(enCurso, finAnuncio - transcurrido);
            } else if (transcurrido < finPresentacionA) {
                iniciarPresentando("presentando_a", enCurso, finPresentacionA - transcurrido);
            } else if (transcurrido < finTurnoA) {
                iniciarTurno("turno_a", enCurso, finTurnoA - transcurrido);
            } else if (transcurrido < finPresentacionB) {
                iniciarPresentando("presentando_b", enCurso, finPresentacionB - transcurrido);
            } else if (transcurrido < finTurnoB) {
                iniciarTurno("turno_b", enCurso, finTurnoB - transcurrido);
            } else {
                iniciarEsperando(enCurso);
            }
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
    // sigue EN_CURSO sin ganador). Si hay ganador y desglose de puntajes (se
    // calificó con jueces, no fue respaldo manual) pasa primero por
    // "resultados"; si no hay desglose, va directo a "ganador"; si empató,
    // pasa por el aviso de "empate" antes de repetir la secuencia completa.
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
            } else if (actualizado.desgloseA && actualizado.desgloseB) {
                iniciarResultados(actualizado);
            } else {
                iniciarGanador(actualizado);
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
    useEffect(() => {
        if ((fase !== "turno_a" && fase !== "turno_b") || !activo) return;
        const actualizado = enfrentamientos.find((e) => e.id === activo.id);
        if (!actualizado) return;

        const yaCortado = fase === "turno_a" ? !!activo.turnoACortadoEn : !!activo.turnoBCortadoEn;
        const ahoraCortado = fase === "turno_a" ? !!actualizado.turnoACortadoEn : !!actualizado.turnoBCortadoEn;
        if (yaCortado || !ahoraCortado) return;

        Promise.resolve().then(() => {
            if (fase === "turno_a") {
                iniciarPresentando("presentando_b", actualizado, DURACION_PRESENTACION_MS);
            } else {
                iniciarEsperando(actualizado);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enfrentamientos, fase, activo]);

    useEffect(() => limpiarTimers, []);

    return { fase, enfrentamiento: activo, segundosRestantes };
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

// Marco neón angular (dos segmentos que forman una punta hacia el centro),
// dibujado una sola vez y reflejado con scaleX(-1) para el lado derecho.
function MarcoNeon({ color, espejo = false }: { color: string; espejo?: boolean }) {
    return (
        <svg
            viewBox="0 0 400 800"
            preserveAspectRatio="none"
            className="absolute inset-0 z-0 h-full w-full"
            style={espejo ? { transform: "scaleX(-1)" } : undefined}
            aria-hidden
        >
            <polyline
                points="60,50 260,400 90,750"
                fill="none"
                stroke={color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-neon-pulso"
                style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 22px ${color})` }}
            />
            <circle cx="260" cy="400" r="7" fill="#ffffff" style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
        </svg>
    );
}

// Foto del competidor a tamaño completo (sin marco redondo): se funde con el
// fondo con un degradado hacia abajo en vez de un borde duro. Si no tiene
// foto, cae a sus iniciales, igual que el resto del panel de admin.
const DEGRADADO_FOTO = "linear-gradient(to bottom, black 55%, transparent 100%)";

export function FotoCompetidorVs({
    competidor,
    grande = false,
}: {
    competidor: Enfrentamiento["competidorA"];
    grande?: boolean;
}) {
    const nombre = nombreCompetidor(competidor);
    // Ancho atado al alto real del viewport (no al ancho ni a breakpoints
    // fijos), con el alto derivado por aspect-ratio: así la foto se achica
    // sola en pantallas con menos alto disponible y nunca empuja el nombre
    // fuera de la vista (el bug que reportó el cliente).
    const tamanoClase = grande ? "w-[min(30vh,18rem)] aspect-[4/5]" : "w-[min(20vh,11rem)] aspect-[4/5]";
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

// Pantalla de dos lados (azul A / rojo B) con marcos neón, fotos y nombres —
// la reutilizan el anuncio inicial ("VS"), la espera de calificación
// ("CALIFICANDO") y los resultados (desglose de puntajes debajo de cada
// nombre), que solo cambian qué va en el centro y debajo de cada nombre.
function PanelVersus({
    enfrentamiento,
    centro,
    debajoA,
    debajoB,
}: {
    enfrentamiento: Enfrentamiento;
    centro: ReactNode;
    debajoA?: ReactNode;
    debajoB?: ReactNode;
}) {
    return (
        <div className="absolute inset-0">
            <div className="fondo-vs-azul absolute inset-0" />
            <div className="fondo-vs-rojo absolute inset-0" />

            <ChispasFondo />

            <div className="absolute inset-0 flex">
                <div className="animate-anuncio-izq-fuego relative flex flex-1 flex-col items-center justify-center gap-3">
                    <MarcoNeon color="var(--color-boss-blue)" />
                    <FotoCompetidorVs competidor={enfrentamiento.competidorA} />
                    <p className="relative z-10 max-w-[85%] truncate font-display text-2xl uppercase text-white [text-shadow:0_0_16px_var(--color-boss-blue)] sm:text-4xl">
                        {nombreCompetidor(enfrentamiento.competidorA)}
                    </p>
                    {debajoA}
                </div>
                <div className="animate-anuncio-der-fuego relative flex flex-1 flex-col items-center justify-center gap-3">
                    <MarcoNeon color="var(--color-boss-red)" espejo />
                    <FotoCompetidorVs competidor={enfrentamiento.competidorB} />
                    <p className="relative z-10 max-w-[85%] truncate font-display text-2xl uppercase text-white [text-shadow:0_0_16px_var(--color-boss-red)] sm:text-4xl">
                        {nombreCompetidor(enfrentamiento.competidorB)}
                    </p>
                    {debajoB}
                </div>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{centro}</div>
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

// Desglose por sección + puntaje total, debajo del nombre de un competidor en
// la fase "resultados": una tarjeta por sección (nombre arriba, calificación
// abajo), en fila horizontal, con el color de su lado (azul/rojo).
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
    todosLosEnfrentamientos,
}: EstadoSecuencia & {
    // Todos los enfrentamientos de la categoría enfocada (no solo el activo),
    // para poder dibujar el bracket completo en la fase "bracket".
    todosLosEnfrentamientos: Enfrentamiento[];
}) {
    if (fase === "normal" || !enfrentamiento) return null;

    const esTurnoDeA = fase === "presentando_a" || fase === "turno_a";
    const competidorEnTurno = esTurnoDeA ? enfrentamiento.competidorA : enfrentamiento.competidorB;

    // nombreRonda() (backend) siempre le pone "Final" a la última ronda de una
    // categoría sin importar cuántas rondas tenga en total, así que es una señal
    // confiable de que este ganador es el campeón de toda la categoría.
    const esCampeonDeCategoria = enfrentamiento.ronda === "Final";
    const hayPuntajes = enfrentamiento.puntajeA != null && enfrentamiento.puntajeB != null;
    const ganoA = enfrentamiento.ganador?.id === enfrentamiento.competidorA?.id;

    return (
        <main className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-boss-black px-8 text-center">
            <p className="absolute inset-x-0 top-10 z-10 font-display text-lg uppercase tracking-widest text-boss-gray">
                {CATEGORIAS[enfrentamiento.categoria]} · {enfrentamiento.ronda}
                {enfrentamiento.numeroDesempate > 0 && (
                    <span className="text-yellow-400"> · Ronda de desempate {enfrentamiento.numeroDesempate}</span>
                )}
            </p>

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
                />
            )}

            {fase === "anuncio_vs" && (
                <PanelVersus
                    enfrentamiento={enfrentamiento}
                    centro={
                        <>
                            <span className="animate-vs-destello absolute h-24 w-24 rounded-full bg-white/70 blur-2xl sm:h-40 sm:w-40" />
                            <span className="animate-impacto-fuego relative font-display text-6xl italic text-white [text-shadow:0_4px_0_rgba(0,0,0,0.5),0_0_24px_rgba(255,255,255,0.9)] sm:text-8xl">
                                VS
                            </span>
                        </>
                    }
                />
            )}

            {(fase === "presentando_a" || fase === "turno_a" || fase === "presentando_b" || fase === "turno_b") && (
                <div
                    key={fase === "presentando_a" || fase === "turno_a" ? "reflector-a" : "reflector-b"}
                    className="animate-reflector-entrada absolute inset-0"
                >
                    <div className={`absolute inset-0 ${esTurnoDeA ? "fondo-reflector-azul" : "fondo-reflector-rojo"}`} />

                    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 pt-10">
                        {(fase === "presentando_a" || fase === "presentando_b") && (
                            <p
                                className="font-display text-xl uppercase tracking-widest sm:text-2xl"
                                style={{ color: esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)" }}
                            >
                                Le toca a...
                            </p>
                        )}

                        <FotoCompetidorVs competidor={competidorEnTurno} grande />

                        <p className="max-w-[85%] truncate font-display text-3xl uppercase text-white sm:text-5xl">
                            {nombreCompetidor(competidorEnTurno)}
                        </p>

                        {(fase === "turno_a" || fase === "turno_b") && (
                            <p
                                key={segundosRestantes}
                                className="animate-numero-pop font-display text-7xl sm:text-8xl"
                                style={{
                                    color: esTurnoDeA ? "var(--color-boss-blue)" : "var(--color-boss-red)",
                                    textShadow: esTurnoDeA
                                        ? "0 0 28px var(--color-boss-blue), 0 0 56px var(--color-boss-blue)"
                                        : "0 0 28px var(--color-boss-red), 0 0 56px var(--color-boss-red)",
                                }}
                            >
                                {segundosRestantes}
                            </p>
                        )}
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

            {fase === "resultados" && enfrentamiento.desgloseA && enfrentamiento.desgloseB && (
                <PanelVersus
                    enfrentamiento={enfrentamiento}
                    centro={
                        <p className="font-display text-3xl uppercase italic text-white [text-shadow:0_4px_0_rgba(0,0,0,0.5),0_0_24px_rgba(255,255,255,0.6)] sm:text-5xl">
                            Resultados
                        </p>
                    }
                    debajoA={
                        <DesgloseCompetidor
                            desglose={enfrentamiento.desgloseA}
                            puntaje={enfrentamiento.puntajeA ?? 0}
                            color="var(--color-boss-blue)"
                        />
                    }
                    debajoB={
                        <DesgloseCompetidor
                            desglose={enfrentamiento.desgloseB}
                            puntaje={enfrentamiento.puntajeB ?? 0}
                            color="var(--color-boss-red)"
                        />
                    }
                />
            )}

            {fase === "ganador" && (
                <div key={ganoA ? "ganador-a" : "ganador-b"} className="animate-reflector-entrada absolute inset-0">
                    <div className={`absolute inset-0 ${ganoA ? "fondo-ganador-azul" : "fondo-ganador-rojo"}`} />

                    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4 pt-10">
                        <p
                            className={`font-display uppercase tracking-widest ${
                                esCampeonDeCategoria ? "text-2xl text-yellow-400 sm:text-3xl" : "text-xl text-white/80 sm:text-2xl"
                            }`}
                        >
                            {esCampeonDeCategoria ? "¡Campeón de la categoría!" : "¡Ganador!"}
                        </p>

                        <FotoCompetidorVs competidor={enfrentamiento.ganador} grande />

                        <p
                            className={`max-w-[85%] truncate font-display uppercase ${
                                esCampeonDeCategoria ? "animate-campeon text-4xl text-yellow-400 sm:text-6xl" : "animate-ganador text-4xl text-white sm:text-6xl"
                            }`}
                        >
                            {nombreCompetidor(enfrentamiento.ganador)}
                        </p>

                        {hayPuntajes && (
                            <p className="font-display text-2xl text-white/90 sm:text-3xl">
                                {ganoA ? enfrentamiento.puntajeA : enfrentamiento.puntajeB} pts
                            </p>
                        )}
                    </div>
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
