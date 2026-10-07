"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Enfrentamiento } from "@/lib/adminApi";

function nombreCompetidor(c: Enfrentamiento["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}



type Lado = "izquierda" | "derecha" | "centro";
type Posicion = { x: number; y: number };

// Mismos tamaños que el bracket de una sola dirección que reemplaza este
// archivo, más los nuevos para la caja Final central.
const ALTO_SLOT = 150;
const ANCHO_COLUMNA = 380;
const ANCHO_TARJETA = 250;
const ALTO_TARJETA = 108;
const ANCHO_CENTRO = 300;
const ANCHO_TARJETA_FINAL = 250;
const ALTO_TARJETA_FINAL = 128;
const COLOR_LINEA = "#3a3a3a";
const ALTO_ENCABEZADO = 104;

// Mismo criterio que el backend (backend/src/lib/brackets.ts) para nombrar
// rondas hacia atrás desde la Final y calcular cuántas rondas tendrá un
// bracket — se replica aquí porque el frontend necesita "adelantarse" a
// rondas que el backend todavía no creó (ver generarRondasFantasma).
const NOMBRES_DESDE_LA_FINAL = [
    "Final",
    "Semifinal",
    "Cuartos de Final",
    "Octavos de Final",
    "Dieciseisavos de Final",
    "Treintaidosavos de Final",
];

function nombreRonda(numero: number, total: number): string {
    const faltan = total - numero;
    return NOMBRES_DESDE_LA_FINAL[faltan] ?? `Ronda ${numero}`;
}

function totalRondasParaParticipantes(cantidad: number): number {
    return Math.max(1, Math.ceil(Math.log2(cantidad)));
}

// El bracket real solo tiene las rondas que el backend ya creó (una ronda
// completa a la vez, cuando la anterior termina — ver intentarAvanzarRonda).
// Para poder mostrar el camino completo (Cuartos/Semifinal/Final) desde el
// arranque, se "inventan" acá las rondas que todavía no existen, con
// partidos vacíos (sin competidores, sin ganador) — son solo para dibujar la
// forma del árbol; en cuanto el backend crea la ronda de verdad, sus datos
// reales reemplazan por completo a los fantasma en el siguiente sondeo.
function generarRondasFantasma(reales: Enfrentamiento[]): Enfrentamiento[] {
    const ronda1 = reales.filter((e) => e.rondaNumero === 1);
    if (ronda1.length === 0 || reales.some((e) => e.ronda === "Final")) {
        return reales;
    }

    const totalParticipantes = ronda1.reduce((acc, e) => acc + (e.competidorB ? 2 : 1), 0);
    const totalRondas = totalRondasParaParticipantes(totalParticipantes);
    const rondaMaxReal = Math.max(...reales.map((e) => e.rondaNumero));
    if (rondaMaxReal >= totalRondas) {
        return reales;
    }

    const categoria = ronda1[0]!.categoria;
    const resultado = [...reales];
    let countAnterior = reales.filter((e) => e.rondaNumero === rondaMaxReal).length;

    // La ronda inmediata siguiente a la última real ya se puede ir llenando
    // con los ganadores que ya se conocen, aunque esa ronda todavía no exista
    // de verdad en el backend (que solo la crea hasta que TODA la ronda
    // anterior termine): en cuanto alguien gana en dieciseisavos, su nombre
    // ya debe aparecer en el lugar que le toca en cuartos. El alimentador
    // `orden*2` siempre cae en el competidor A del partido siguiente y
    // `orden*2+1` en el competidor B — el mismo invariante que ya usa todo el
    // layout (ver calcularLados/calcularLayoutBracket).
    const rondaAnteriorReal = reales.filter((e) => e.rondaNumero === rondaMaxReal);

    for (let ronda = rondaMaxReal + 1; ronda <= totalRondas; ronda++) {
        const count = Math.ceil(countAnterior / 2);
        const nombre = nombreRonda(ronda, totalRondas);
        const esPrimeraFantasma = ronda === rondaMaxReal + 1;

        for (let orden = 0; orden < count; orden++) {
            const id = `fantasma-${ronda}-${orden}`;

            let competidorA: Enfrentamiento["competidorA"] = null;
            let competidorB: Enfrentamiento["competidorB"] = null;
            if (esPrimeraFantasma) {
                const feederA = rondaAnteriorReal.find((e) => e.orden === orden * 2);
                const feederB = rondaAnteriorReal.find((e) => e.orden === orden * 2 + 1);
                competidorA = feederA?.ganador ?? null;
                competidorB = feederB?.ganador ?? null;
            }

            resultado.push({
                id,
                categoria,
                ronda: nombre,
                rondaNumero: ronda,
                orden,
                competidorA,
                competidorB,
                ganador: null,
                estatus: "PENDIENTE",
                updatedAt: "",
                turnoACortadoEn: null,
                turnoBCortadoEn: null,
                numeroDesempate: 0,
                rondasBaile: 1,
                puntajeA: null,
                puntajeB: null,
            });
        }
        countAnterior = count;
    }

    return resultado;
}

function siguientePotenciaDeDos(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

// Partir la ronda 1 justo a la mitad de su cantidad NO es seguro cuando esa
// cantidad es impar: un partido de rondas posteriores podría terminar
// alimentado por partidos de ambos lados. Alinear el corte a la siguiente
// potencia de 2 garantiza que el invariante orden=k <- {2k, 2k+1} nunca cruce
// de un lado al otro, sin importar cuántos byes haya.
function tamanoLadoIzquierdo(n1: number): number {
    if (n1 <= 1) return 0;
    return siguientePotenciaDeDos(n1) / 2;
}

function calcularLados(enfrentamientos: Enfrentamiento[]): Map<string, Lado> {
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
            // El lado se hereda del primer alimentador — nunca se recalcula
            // por el tamaño de esta ronda, que es justo lo que se puede
            // desalinear en ramas con bye en profundidades impares.
            const ladoFeeder1 = lados.get(clave(ronda - 1, e.orden * 2));
            const ladoFeeder2 = lados.get(clave(ronda - 1, e.orden * 2 + 1));
            const heredado = ladoFeeder1 ?? ladoFeeder2;
            if (heredado && heredado !== "centro") {
                lados.set(clave(ronda, e.orden), heredado);
            } else {
                console.warn(`[BracketMirror] no se pudo derivar lado para ${ronda}-${e.orden}`);
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
    centro: Enfrentamiento | null;
};

function calcularLayoutBracket(enfrentamientos: Enfrentamiento[]): LayoutBracket {
    const centro = enfrentamientos.find((e) => e.ronda === "Final") ?? null;

    // Caso degenerado: un solo partido en todo el bracket (ronda 1 ya nace
    // como la Final). Solo se ve la caja central, sin columnas.
    if (centro && centro.rondaNumero === 1) {
        const clave = `${centro.rondaNumero}-${centro.orden}`;
        return {
            posiciones: new Map([[clave, { x: 0, y: ALTO_TARJETA_FINAL / 2 }]]),
            lados: new Map([[clave, "centro"]]),
            anchoTotal: ANCHO_TARJETA_FINAL,
            altoTotal: ALTO_TARJETA_FINAL,
            columnasPorLado: 0,
            centro,
        };
    }

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

// Único primitivo de conector: un "codo" en ángulo recto entre dos tarjetas,
// parametrizado por qué borde de cada una usa. El lado derecho es
// exactamente el mismo helper con los bordes invertidos — no hace falta una
// función de espejo aparte.
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

function ConectoresBracket({ enfrentamientos, layout }: { enfrentamientos: Enfrentamiento[]; layout: LayoutBracket }) {
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

// resaltado marca al competidor que ACABA de avanzar (ver BracketMirror
// resaltarId): un brillo dorado que pulsa, distinto del check verde normal
// de "ya ganó este partido" — puede coincidir con esGanador (su fila en el
// partido que acaba de ganar) o aparecer solo (su nuevo lugar en la
// siguiente ronda, todavía sin jugarse).
function FilaCompetidorBracket({
    competidor,
    esGanador,
    resaltado = false,
}: {
    competidor: Enfrentamiento["competidorA"];
    esGanador: boolean;
    resaltado?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between border-b border-boss-border/60 px-2.5 py-2 last:border-b-0 ${
                esGanador ? "bg-boss-green/10" : ""
            } ${resaltado ? "animate-pulso-suave bg-yellow-400/15 ring-2 ring-inset ring-yellow-400" : ""}`}
        >
            <span
                className={`truncate text-3xl font-semibold ${esGanador ? "text-boss-green" : "text-white"} ${
                    resaltado ? "text-yellow-300" : ""
                }`}
            >
                {nombreCompetidor(competidor)}
            </span>
            {esGanador && <span className="ml-1 shrink-0 text-boss-green">✓</span>}
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

function TarjetaBracket({
    enfrentamiento,
    pos,
    resaltarId,
}: {
    enfrentamiento: Enfrentamiento;
    pos: Posicion;
    resaltarId?: string;
}) {
    const esBye = !enfrentamiento.competidorB && !!enfrentamiento.ganador;
    const idPartido = `${prefijoRonda(enfrentamiento.ronda)}${enfrentamiento.orden + 1}`;

    return (
        <div className="absolute text-left" style={{ left: pos.x, top: pos.y - ALTO_TARJETA / 2, width: ANCHO_TARJETA }}>
            <div className="overflow-hidden rounded-md border border-boss-border bg-boss-panel shadow-lg shadow-black/40">
                <div className="border-b border-boss-border px-2.5 py-1.5 text-sm uppercase tracking-wide text-boss-gray">
                    {enfrentamiento.estatus === "FINALIZADO" ? "Finalizado" : "Pendiente"}
                </div>
                <FilaCompetidorBracket
                    competidor={enfrentamiento.competidorA}
                    esGanador={!!enfrentamiento.ganador && enfrentamiento.ganador.id === enfrentamiento.competidorA?.id}
                    resaltado={!!resaltarId && enfrentamiento.competidorA?.id === resaltarId}
                />
                {esBye ? (
                    <div className="px-2.5 py-2 text-base italic text-boss-gray">BYE</div>
                ) : (
                    <FilaCompetidorBracket
                        competidor={enfrentamiento.competidorB}
                        esGanador={!!enfrentamiento.ganador && enfrentamiento.ganador.id === enfrentamiento.competidorB?.id}
                        resaltado={!!resaltarId && enfrentamiento.competidorB?.id === resaltarId}
                    />
                )}
            </div>
            <EtiquetaIdPartido texto={idPartido} />
        </div>
    );
}

function TarjetaBracketFinal({
    enfrentamiento,
    pos,
    resaltarId,
}: {
    enfrentamiento: Enfrentamiento;
    pos: Posicion;
    resaltarId?: string;
}) {
    return (
        <div className="relative ">
            <img  src="/thebosslogo.jpeg" className="absolute w-80 top-3/4 left-1/2 -translate-x-1/2 -translate-y-1/2"/>
            <div
                className="animate-brillo-final absolute overflow-hidden rounded-lg border-2 border-boss-red bg-boss-panel text-left shadow-2xl shadow-black/60"
                style={{ left: pos.x, top: pos.y - ALTO_TARJETA_FINAL / 2, width: ANCHO_TARJETA_FINAL }}
            >

                <div className="flex items-center justify-center gap-1.5 border-b border-boss-red/50 bg-boss-red/10 px-2 py-2 font-display text-xl uppercase tracking-widest text-boss-red">
                    Final
                </div>
                <FilaCompetidorBracket
                    competidor={enfrentamiento.competidorA}
                    esGanador={!!enfrentamiento.ganador && enfrentamiento.ganador.id === enfrentamiento.competidorA?.id}
                    resaltado={!!resaltarId && enfrentamiento.competidorA?.id === resaltarId}
                />
                <FilaCompetidorBracket
                    competidor={enfrentamiento.competidorB}
                    esGanador={!!enfrentamiento.ganador && enfrentamiento.ganador.id === enfrentamiento.competidorB?.id}
                    resaltado={!!resaltarId && enfrentamiento.competidorB?.id === resaltarId}
                />
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

// Decoración pura: salpicaduras rojas difuminadas en las esquinas,
// aproximando el estilo grunge de la referencia sin un asset de textura real.
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

export function BracketMirror({
    enfrentamientos: enfrentamientosReales,
    resaltarId,
}: {
    enfrentamientos: Enfrentamiento[];
    // Id del competidor que acaba de avanzar de ronda (ver fase "bracket" en
    // SecuenciaBatalla.tsx): resalta en dorado su fila donde sea que
    // aparezca (el partido que ganó y su nuevo lugar en la siguiente ronda).
    resaltarId?: string;
}) {
    if (enfrentamientosReales.length === 0) {
        return <p className="text-boss-gray">Bracket todavía no publicado.</p>;
    }

    // Se completan las rondas que el backend todavía no creó (Cuartos,
    // Semifinal, Final...) con partidos vacíos, para que se vea el camino
    // completo desde el arranque — se van reemplazando solos por los datos
    // reales conforme el backend los va creando. Se ven igual que cualquier
    // partido "Pendiente" real, sin ningún tratamiento visual distinto.
    const enfrentamientos = generarRondasFantasma(enfrentamientosReales);

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
                            return <TarjetaBracketFinal key={e.id} enfrentamiento={e} pos={pos} resaltarId={resaltarId} />;
                        }

                        return <TarjetaBracket key={e.id} enfrentamiento={e} pos={pos} resaltarId={resaltarId} />;
                    })}
                </div>
            </div>
        </EscaladoAAjuste>
    );
}

// Esto se muestra en una pantalla fija en el evento (sin mouse/teclado para
// hacer scroll), así que en vez de dejarlo desbordarse se mide el espacio
// disponible del contenedor y se escala el bracket completo para que quepa
// siempre en una sola vista, sin importar cuántas rondas tenga.
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
    // null = todavía no se midió el contenedor; no se dibuja a escala 1 (su
    // tamaño real, casi siempre más ancho que la pantalla) mientras tanto,
    // para no mostrar ni un instante el contenido sin escalar.
    const [escala, setEscala] = useState<number | null>(null);

    useEffect(() => {
        const contenedor = contenedorRef.current;
        if (!contenedor) return;

        const actualizar = () => {
            const anchoDisponible = contenedor.clientWidth;
            const altoDisponible = contenedor.clientHeight;
            if (anchoDisponible === 0 || altoDisponible === 0 || anchoContenido === 0 || altoContenido === 0) return;
            // Sin tope en 1: también agranda brackets chicos para llenar la
            // pantalla, no solo encoge los grandes.
            const factor = Math.min(anchoDisponible / anchoContenido, altoDisponible / altoContenido);
            setEscala(factor);
        };

        // requestAnimationFrame en vez de un microtask: garantiza que el
        // layout de flexbox del contenedor (altura/ancho reales) ya se haya
        // resuelto antes de medir, evitando quedarse pegado en una medición
        // de 0 o del tamaño previo al montar.
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
