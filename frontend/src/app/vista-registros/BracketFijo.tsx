"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EnfrentamientoVista } from "@/lib/api";

// Renderer de bracket propio de esta vista: a diferencia de
// /pantalla/BracketMirror.tsx (que dibuja el bracket REAL, alimentado por
// enfrentamientos de la base de datos y que va "inventando" rondas futuras
// conforme se resuelven las anteriores), aquí el backend ya entrega el
// árbol COMPLETO y fijo de 32 lugares de una sola vez — no hace falta
// generar rondas fantasma ni resaltar ganadores. Se mantiene aparte para no
// depender del tipo Enfrentamiento del panel de admin (que trae campos de
// otras funciones en desarrollo que no aplican aquí).

type Lado = "izquierda" | "derecha" | "centro";
type Posicion = { x: number; y: number };

const ALTO_SLOT = 150;
const ANCHO_COLUMNA = 380;
const ANCHO_TARJETA = 250;
const ALTO_TARJETA = 108;
const ANCHO_CENTRO = 300;
const ANCHO_TARJETA_FINAL = 250;
const ALTO_TARJETA_FINAL = 128;
const COLOR_LINEA = "#3a3a3a";
const ALTO_ENCABEZADO = 104;

function nombreCompetidor(c: EnfrentamientoVista["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

function siguientePotenciaDeDos(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

function tamanoLadoIzquierdo(n1: number): number {
    if (n1 <= 1) return 0;
    return siguientePotenciaDeDos(n1) / 2;
}

function calcularLados(enfrentamientos: EnfrentamientoVista[]): Map<string, Lado> {
    const lados = new Map<string, Lado>();
    const clave = (rondaNumero: number, orden: number) => `${rondaNumero}-${orden}`;

    const ronda1 = enfrentamientos.filter((e) => e.rondaNumero === 1).sort((a, b) => a.orden - b.orden);
    const n1 = ronda1.length;
    const tamanoIzquierda = tamanoLadoIzquierdo(n1);

    for (const e of ronda1) {
        if (e.ronda === "Final") {
            lados.set(clave(e.rondaNumero, e.orden), "centro");
        } else {
            lados.set(clave(1, e.orden), e.orden < tamanoIzquierda ? "izquierda" : "derecha");
        }
    }

    const rondaMax = Math.max(1, ...enfrentamientos.map((e) => e.rondaNumero));
    for (let ronda = 2; ronda <= rondaMax; ronda++) {
        for (const e of enfrentamientos.filter((x) => x.rondaNumero === ronda)) {
            if (e.ronda === "Final") {
                lados.set(clave(ronda, e.orden), "centro");
                continue;
            }
            const ladoFeeder1 = lados.get(clave(ronda - 1, e.orden * 2));
            const ladoFeeder2 = lados.get(clave(ronda - 1, e.orden * 2 + 1));
            const heredado = ladoFeeder1 ?? ladoFeeder2;
            if (heredado && heredado !== "centro") {
                lados.set(clave(ronda, e.orden), heredado);
            }
        }
    }

    return lados;
}

type LayoutBracket = {
    posiciones: Map<string, Posicion>;
    lados: Map<string, Lado>;
    anchoTotal: number;
    altoTotal: number;
    columnasPorLado: number;
    centro: EnfrentamientoVista | null;
};

function calcularLayoutBracket(enfrentamientos: EnfrentamientoVista[]): LayoutBracket {
    const centro = enfrentamientos.find((e) => e.ronda === "Final") ?? null;

    const lados = calcularLados(enfrentamientos);
    const rondaMax = Math.max(1, ...enfrentamientos.map((e) => e.rondaNumero));
    const columnasPorLado = centro ? rondaMax - 1 : rondaMax;

    const ronda1 = enfrentamientos.filter((e) => e.rondaNumero === 1).sort((a, b) => a.orden - b.orden);
    const n1 = ronda1.length;
    const tamanoIzquierda = tamanoLadoIzquierdo(n1);
    const tamanoDerecha = n1 - tamanoIzquierda;

    const altoIzquierda = Math.max(tamanoIzquierda, 1) * ALTO_SLOT;
    const altoDerecha = Math.max(tamanoDerecha, 1) * ALTO_SLOT;
    const altoTotal = Math.max(altoIzquierda, altoDerecha, ALTO_SLOT);
    const offsetIzquierda = (altoTotal - tamanoIzquierda * ALTO_SLOT) / 2;
    const offsetDerecha = (altoTotal - tamanoDerecha * ALTO_SLOT) / 2;

    const anchoMitad = columnasPorLado * ANCHO_COLUMNA;
    const anchoTotal = anchoMitad * 2 + ANCHO_CENTRO;

    const xIzquierda = (ronda: number) => (ronda - 1) * ANCHO_COLUMNA;
    const xDerecha = (ronda: number) => anchoTotal - ANCHO_TARJETA - (ronda - 1) * ANCHO_COLUMNA;

    const posiciones = new Map<string, Posicion>();

    for (const e of ronda1) {
        const lado = lados.get(`1-${e.orden}`);
        if (lado === "izquierda") {
            posiciones.set(`1-${e.orden}`, { x: xIzquierda(1), y: offsetIzquierda + e.orden * ALTO_SLOT + ALTO_SLOT / 2 });
        } else if (lado === "derecha") {
            const slot = e.orden - tamanoIzquierda;
            posiciones.set(`1-${e.orden}`, { x: xDerecha(1), y: offsetDerecha + slot * ALTO_SLOT + ALTO_SLOT / 2 });
        }
    }

    for (let ronda = 2; ronda <= columnasPorLado; ronda++) {
        for (const e of enfrentamientos.filter((x) => x.rondaNumero === ronda)) {
            const lado = lados.get(`${ronda}-${e.orden}`);
            if (lado !== "izquierda" && lado !== "derecha") continue;
            const feeder1 = posiciones.get(`${ronda - 1}-${e.orden * 2}`);
            const feeder2 = posiciones.get(`${ronda - 1}-${e.orden * 2 + 1}`);
            if (!feeder1) continue;
            const y = feeder2 ? (feeder1.y + feeder2.y) / 2 : feeder1.y;
            const x = lado === "izquierda" ? xIzquierda(ronda) : xDerecha(ronda);
            posiciones.set(`${ronda}-${e.orden}`, { x, y });
        }
    }

    if (centro) {
        const feederIzq = posiciones.get(`${columnasPorLado}-${centro.orden * 2}`);
        const feederDer = posiciones.get(`${columnasPorLado}-${centro.orden * 2 + 1}`);
        const y = feederDer && feederIzq ? (feederIzq.y + feederDer.y) / 2 : (feederIzq?.y ?? altoTotal / 2);
        const x = anchoMitad + (ANCHO_CENTRO - ANCHO_TARJETA_FINAL) / 2;
        posiciones.set(`${centro.rondaNumero}-${centro.orden}`, { x, y });
    }

    return { posiciones, lados, anchoTotal, altoTotal, columnasPorLado, centro };
}

function codo(
    desde: Posicion,
    anchoDesde: number,
    bordeSalida: "izquierda" | "derecha",
    hasta: Posicion,
    anchoHasta: number,
    bordeEntrada: "izquierda" | "derecha",
): string {
    const xSalida = bordeSalida === "derecha" ? desde.x + anchoDesde : desde.x;
    const xEntrada = bordeEntrada === "derecha" ? hasta.x + anchoHasta : hasta.x;
    const xMid = (xSalida + xEntrada) / 2;
    return `M ${xSalida} ${desde.y} H ${xMid} M ${xMid} ${desde.y} V ${hasta.y} M ${xMid} ${hasta.y} H ${xEntrada}`;
}

function ConectoresBracket({
    enfrentamientos,
    layout,
}: {
    enfrentamientos: EnfrentamientoVista[];
    layout: LayoutBracket;
}) {
    const { posiciones, lados, columnasPorLado, centro } = layout;
    const trazos: string[] = [];

    for (let ronda = 2; ronda <= columnasPorLado; ronda++) {
        for (const e of enfrentamientos.filter((x) => x.rondaNumero === ronda)) {
            const lado = lados.get(`${ronda}-${e.orden}`);
            if (lado !== "izquierda" && lado !== "derecha") continue;
            const pos = posiciones.get(`${ronda}-${e.orden}`);
            const feeder1 = posiciones.get(`${ronda - 1}-${e.orden * 2}`);
            const feeder2 = posiciones.get(`${ronda - 1}-${e.orden * 2 + 1}`);
            if (!pos || !feeder1) continue;

            const bordeSalida = lado === "izquierda" ? "derecha" : "izquierda";
            const bordeEntrada = lado === "izquierda" ? "izquierda" : "derecha";

            trazos.push(codo(feeder1, ANCHO_TARJETA, bordeSalida, pos, ANCHO_TARJETA, bordeEntrada));
            if (feeder2) {
                trazos.push(codo(feeder2, ANCHO_TARJETA, bordeSalida, pos, ANCHO_TARJETA, bordeEntrada));
            }
        }
    }

    if (centro && columnasPorLado > 0) {
        const centroPos = posiciones.get(`${centro.rondaNumero}-${centro.orden}`);
        const feederIzq = posiciones.get(`${columnasPorLado}-${centro.orden * 2}`);
        const feederDer = posiciones.get(`${columnasPorLado}-${centro.orden * 2 + 1}`);
        if (centroPos && feederIzq) {
            trazos.push(codo(feederIzq, ANCHO_TARJETA, "derecha", centroPos, ANCHO_TARJETA_FINAL, "izquierda"));
        }
        if (centroPos && feederDer) {
            trazos.push(codo(feederDer, ANCHO_TARJETA, "izquierda", centroPos, ANCHO_TARJETA_FINAL, "derecha"));
        }
    }

    return (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <path d={trazos.join(" ")} fill="none" stroke={COLOR_LINEA} strokeWidth={2} />
        </svg>
    );
}

function FilaCompetidorBracket({ competidor }: { competidor: EnfrentamientoVista["competidorA"] }) {
    return (
        <div className="flex items-center justify-between border-b border-boss-border/60 px-2.5 py-2 last:border-b-0">
            <span className={`truncate text-3xl font-semibold ${competidor ? "text-white" : "text-boss-gray"}`}>
                {nombreCompetidor(competidor)}
            </span>
        </div>
    );
}

function EtiquetaIdPartido({ texto }: { texto: string }) {
    return <span className="absolute -bottom-6 right-0 text-sm uppercase tracking-widest text-boss-gray">{texto}</span>;
}

function prefijoRonda(nombre: string): string {
    const palabras = nombre.split(/\s+/).filter((p) => !["de", "del"].includes(p.toLowerCase()));
    const iniciales = palabras.map((p) => p[0]?.toUpperCase() ?? "").join("");
    return iniciales.length >= 2 ? iniciales.slice(0, 3) : nombre.slice(0, 3).toUpperCase();
}

function TarjetaBracket({ enfrentamiento, pos }: { enfrentamiento: EnfrentamientoVista; pos: Posicion }) {
    const idPartido = `${prefijoRonda(enfrentamiento.ronda)}${enfrentamiento.orden + 1}`;

    return (
        <div className="absolute text-left" style={{ left: pos.x, top: pos.y - ALTO_TARJETA / 2, width: ANCHO_TARJETA }}>
            <div className="overflow-hidden rounded-md border border-boss-border bg-boss-panel shadow-lg shadow-black/40">
                <div className="border-b border-boss-border px-2.5 py-1.5 text-sm uppercase tracking-wide text-boss-gray">
                    Pendiente
                </div>
                <FilaCompetidorBracket competidor={enfrentamiento.competidorA} />
                <FilaCompetidorBracket competidor={enfrentamiento.competidorB} />
            </div>
            <EtiquetaIdPartido texto={idPartido} />
        </div>
    );
}

function TarjetaBracketFinal({ enfrentamiento, pos }: { enfrentamiento: EnfrentamientoVista; pos: Posicion }) {
    return (
        <div className="relative">
            <img src="/the-boss-logo.png" className="absolute left-1/2 top-3/4 w-80 -translate-x-1/2 -translate-y-1/2" />
            <div
                className="absolute overflow-hidden rounded-lg border-2 border-boss-red bg-boss-panel text-left shadow-2xl shadow-black/60"
                style={{ left: pos.x, top: pos.y - ALTO_TARJETA_FINAL / 2, width: ANCHO_TARJETA_FINAL }}
            >
                <div className="flex items-center justify-center gap-1.5 border-b border-boss-red/50 bg-boss-red/10 px-2 py-2 font-display text-xl uppercase tracking-widest text-boss-red">
                    Final
                </div>
                <FilaCompetidorBracket competidor={enfrentamiento.competidorA} />
                <FilaCompetidorBracket competidor={enfrentamiento.competidorB} />
            </div>
        </div>
    );
}

function FilaRondasEspejo({
    columnasPorLado,
    nombreDeRonda,
}: {
    columnasPorLado: number;
    nombreDeRonda: (ronda: number) => string;
}) {
    if (columnasPorLado === 0) return null;
    const rondas = Array.from({ length: columnasPorLado }, (_, i) => i + 1);

    return (
        <div className="flex items-center" style={{ height: ALTO_ENCABEZADO }}>
            {rondas.map((ronda) => (
                <div
                    key={`izq-${ronda}`}
                    className="shrink-0 px-1 text-center font-display text-3xl leading-tight uppercase tracking-wide text-boss-red"
                    style={{ width: ANCHO_COLUMNA }}
                >
                    {nombreDeRonda(ronda)}
                </div>
            ))}
            <div className="shrink-0" style={{ width: ANCHO_CENTRO }} />
            {rondas
                .slice()
                .reverse()
                .map((ronda) => (
                    <div
                        key={`der-${ronda}`}
                        className="shrink-0 px-1 text-center font-display text-3xl leading-tight uppercase tracking-wide text-boss-red"
                        style={{ width: ANCHO_COLUMNA }}
                    >
                        {nombreDeRonda(ronda)}
                    </div>
                ))}
        </div>
    );
}

function SalpicadurasEsquina() {
    return (
        <>
            <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-boss-red opacity-20 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-boss-red opacity-20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-boss-red opacity-15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-boss-red opacity-15 blur-3xl" />
        </>
    );
}

export function BracketFijo({ enfrentamientos }: { enfrentamientos: EnfrentamientoVista[] }) {
    if (enfrentamientos.length === 0) {
        return <p className="text-boss-gray">Bracket todavía no disponible.</p>;
    }

    const layout = calcularLayoutBracket(enfrentamientos);
    const { posiciones, lados, anchoTotal, altoTotal, columnasPorLado, centro } = layout;

    const nombrePorRonda = new Map<number, string>();
    for (const e of enfrentamientos) {
        if (!nombrePorRonda.has(e.rondaNumero)) nombrePorRonda.set(e.rondaNumero, e.ronda);
    }
    const nombreDeRonda = (ronda: number) => nombrePorRonda.get(ronda) ?? `Ronda ${ronda}`;
    const altoConEncabezado = altoTotal + ALTO_ENCABEZADO;

    return (
        <EscaladoAAjuste anchoContenido={anchoTotal} altoContenido={altoConEncabezado}>
            <SalpicadurasEsquina />
            <div className="relative" style={{ width: anchoTotal, height: altoConEncabezado }}>
                <FilaRondasEspejo columnasPorLado={columnasPorLado} nombreDeRonda={nombreDeRonda} />

                <div className="absolute inset-x-0 bottom-0" style={{ height: altoTotal }}>
                    <ConectoresBracket enfrentamientos={enfrentamientos} layout={layout} />
                    {enfrentamientos.map((e) => {
                        const pos = posiciones.get(`${e.rondaNumero}-${e.orden}`);
                        if (!pos) return null;
                        const lado = lados.get(`${e.rondaNumero}-${e.orden}`);

                        if (lado === "centro" || e.id === centro?.id) {
                            return <TarjetaBracketFinal key={e.id} enfrentamiento={e} pos={pos} />;
                        }

                        return <TarjetaBracket key={e.id} enfrentamiento={e} pos={pos} />;
                    })}
                </div>
            </div>
        </EscaladoAAjuste>
    );
}

function EscaladoAAjuste({
    anchoContenido,
    altoContenido,
    children,
}: {
    anchoContenido: number;
    altoContenido: number;
    children: ReactNode;
}) {
    const contenedorRef = useRef<HTMLDivElement>(null);
    const [escala, setEscala] = useState<number | null>(null);

    useEffect(() => {
        const contenedor = contenedorRef.current;
        if (!contenedor) return;

        const actualizar = () => {
            const anchoDisponible = contenedor.clientWidth;
            const altoDisponible = contenedor.clientHeight;
            if (anchoDisponible === 0 || altoDisponible === 0 || anchoContenido === 0 || altoContenido === 0) return;
            const factor = Math.min(anchoDisponible / anchoContenido, altoDisponible / altoContenido);
            setEscala(factor);
        };

        const cuadro = requestAnimationFrame(actualizar);
        const observer = new ResizeObserver(actualizar);
        observer.observe(contenedor);
        window.addEventListener("resize", actualizar);
        return () => {
            cancelAnimationFrame(cuadro);
            observer.disconnect();
            window.removeEventListener("resize", actualizar);
        };
    }, [anchoContenido, altoContenido]);

    return (
        <div ref={contenedorRef} className="relative h-full w-full overflow-hidden">
            <div
                className="absolute left-1/2 top-1/2"
                style={{
                    width: anchoContenido,
                    height: altoContenido,
                    transform: `translate(-50%, -50%) scale(${escala ?? 1})`,
                    opacity: escala == null ? 0 : 1,
                }}
            >
                {children}
            </div>
        </div>
    );
}
