"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CATEGORIAS } from "@/config/catalog";
import {
    getEnfrentamientos,
    getPantallaEstado,
    getResultadosPreseleccion,
    getTurnoPreseleccionActual,
    type Enfrentamiento,
    type PantallaEstado,
    type ResultadoPreseleccionItem,
    type TurnoPreseleccion,
} from "@/lib/adminApi";
import { SecuenciaOverlay, useSecuenciaBatalla } from "./SecuenciaBatalla";
import {
    RecapPreseleccionOverlay,
    SecuenciaPreseleccionOverlay,
    useRecapPreseleccion,
    useSecuenciaPreseleccion,
} from "./SecuenciaPreseleccion";
import { BracketMirror } from "./BracketMirror";

const INTERVALO_MS = 3000;

function nombreCompetidor(c: Enfrentamiento["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

export default function PantallaPublicaPage() {
    const [estado, setEstado] = useState<PantallaEstado | null>(null);
    const [enfrentamientos, setEnfrentamientos] = useState<Enfrentamiento[]>([]);
    const [todosLosEnfrentamientos, setTodosLosEnfrentamientos] = useState<Enfrentamiento[]>([]);
    const [turnoPreseleccion, setTurnoPreseleccion] = useState<TurnoPreseleccion>(null);
    const [resultadosPreseleccion, setResultadosPreseleccion] = useState<ResultadoPreseleccionItem[]>([]);

    useEffect(() => {
        let cancelado = false;
        const poll = async () => {
            const resultado = await getPantallaEstado();
            if (!cancelado && resultado.ok) setEstado(resultado.data.estado);
        };
        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, []);

    useEffect(() => {
        if (!estado?.categoriaEnfocada) {
            return;
        }

        // Se sondea aunque la vista esté APAGADA: la secuencia VS/cronómetro/
        // ganador (useSecuenciaBatalla) debe poder arrancar sin importar qué
        // vista esté seleccionada.
        const categoria = estado.categoriaEnfocada;
        let cancelado = false;
        const poll = async () => {
            const resultado = await getEnfrentamientos(categoria);
            if (!cancelado && resultado.ok) setEnfrentamientos(resultado.data.enfrentamientos);
        };
        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [estado?.categoriaEnfocada]);

    // Igual que el poll de enfrentamientos: corre sin importar la vista
    // elegida, porque useSecuenciaPreseleccion debe poder arrancar el overlay
    // de "Le toca a..." + cronómetro en cuanto el staff avance el turno,
    // aunque la pantalla esté mostrando otra cosa (o esté APAGADA).
    useEffect(() => {
        if (!estado?.categoriaEnfocada) {
            return;
        }

        const categoria = estado.categoriaEnfocada;
        let cancelado = false;
        const poll = async () => {
            const resultado = await getTurnoPreseleccionActual(categoria);
            if (!cancelado && resultado.ok) setTurnoPreseleccion(resultado.data.turno);
        };
        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [estado?.categoriaEnfocada]);

    // Ranking completo de Preselección (para el recorrido de resultados una
    // vez que se acaba la fila de turnos, ver useRecapPreseleccion) — mismo
    // criterio que el poll de turno-actual: corre sin importar la vista.
    useEffect(() => {
        if (!estado?.categoriaEnfocada) {
            return;
        }

        const categoria = estado.categoriaEnfocada;
        let cancelado = false;
        const poll = async () => {
            const resultado = await getResultadosPreseleccion(categoria);
            if (!cancelado && resultado.ok) setResultadosPreseleccion(resultado.data.resultados);
        };
        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [estado?.categoriaEnfocada]);

    // Vista de Ganadores: un campeón por categoría en todo el evento, no solo
    // de la categoría enfocada, así que se sondea aparte y sin filtro.
    useEffect(() => {
        if (estado?.vista !== "GANADORES") {
            return;
        }

        let cancelado = false;
        const poll = async () => {
            const resultado = await getEnfrentamientos();
            if (!cancelado && resultado.ok) setTodosLosEnfrentamientos(resultado.data.enfrentamientos);
        };
        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [estado?.vista]);

    const secuencia = useSecuenciaBatalla(enfrentamientos);
    const secuenciaPreseleccion = useSecuenciaPreseleccion(turnoPreseleccion);
    const recapPreseleccion = useRecapPreseleccion(
        estado?.categoriaEnfocada ?? null,
        turnoPreseleccion,
        resultadosPreseleccion,
    );

    // En la práctica nunca se solapan (una categoría está en un solo estatus
    // a la vez: PRESELECCION o EN_CURSO), pero por robustez la secuencia de
    // batalla 1v1 tiene prioridad si ambas llegaran a estar activas.
    if (secuencia.fase !== "normal") {
        return (
            <SecuenciaOverlay
                fase={secuencia.fase}
                enfrentamiento={secuencia.enfrentamiento}
                segundosRestantes={secuencia.segundosRestantes}
                todosLosEnfrentamientos={enfrentamientos}
            />
        );
    }

    if (secuenciaPreseleccion.fase !== "normal") {
        return (
            <SecuenciaPreseleccionOverlay
                fase={secuenciaPreseleccion.fase}
                turno={secuenciaPreseleccion.turno}
                segundosRestantes={secuenciaPreseleccion.segundosRestantes}
            />
        );
    }

    if (recapPreseleccion.activo && estado?.categoriaEnfocada) {
        return <RecapPreseleccionOverlay estado={recapPreseleccion} categoria={estado.categoriaEnfocada} />;
    }

    if (!estado || estado.vista === "APAGADA") {
        return (
            <main className="flex min-h-screen items-center justify-center bg-boss-black">
                <Image src="/the-boss-logo.png" alt="THE BOSS — Breaking Battles" width={280} height={233} />
            </main>
        );
    }

    const tituloCategoria =
        estado.vista !== "GANADORES" && estado.categoriaEnfocada ? CATEGORIAS[estado.categoriaEnfocada] : null;
    const esVistaBrackets = estado.vista === "BRACKETS";

    return (
        <main
            className={`bg-boss-black px-8 text-center ${
                esVistaBrackets ? "flex h-screen flex-col overflow-hidden py-6" : "min-h-screen py-10"
            }`}
        >
            {!esVistaBrackets && (
                <Image src="/the-boss-logo.png" alt="THE BOSS — Breaking Battles" width={120} height={100} className="mx-auto" />
            )}
            {estado.vista === "GANADORES" && (
                <h1 className="mt-4 font-display text-3xl uppercase tracking-widest text-boss-red">Campeones</h1>
            )}
            {tituloCategoria && (
                <h1
                    className={`font-display text-3xl uppercase tracking-widest text-boss-red ${
                        esVistaBrackets ? "mt-2 shrink-0" : "mt-4"
                    }`}
                >
                    {tituloCategoria}
                </h1>
            )}

            <div className={esVistaBrackets ? "mt-2 min-h-0 flex-1" : "mt-10"}>
                {estado.vista === "BRACKETS" && <BracketMirror enfrentamientos={enfrentamientos} />}
                {estado.vista === "ENFRENTAMIENTOS" && <VistaEnfrentamientosEnCurso enfrentamientos={enfrentamientos} />}
                {estado.vista === "RESULTADOS" && <VistaResultados enfrentamientos={enfrentamientos} />}
                {estado.vista === "GANADORES" && <VistaGanadores enfrentamientos={todosLosEnfrentamientos} />}
            </div>
        </main>
    );
}

function TarjetaEnfrentamiento({ enfrentamiento }: { enfrentamiento: Enfrentamiento }) {
    return (
        <div className="rounded-xl border border-boss-border bg-boss-panel/60 p-6">
            <p className="text-sm font-semibold uppercase tracking-widest text-boss-gray">{enfrentamiento.ronda}</p>
            <div className="mt-3 flex items-center justify-center gap-6 font-display text-2xl uppercase text-white">
                <span className={enfrentamiento.ganador?.id === enfrentamiento.competidorA?.id ? "text-boss-green" : ""}>
                    {nombreCompetidor(enfrentamiento.competidorA)}
                </span>
                <span className="text-boss-red">VS</span>
                <span className={enfrentamiento.ganador?.id === enfrentamiento.competidorB?.id ? "text-boss-green" : ""}>
                    {nombreCompetidor(enfrentamiento.competidorB)}
                </span>
            </div>
        </div>
    );
}

function VistaEnfrentamientosEnCurso({ enfrentamientos }: { enfrentamientos: Enfrentamiento[] }) {
    const activos = enfrentamientos.filter((e) => e.estatus !== "FINALIZADO");

    if (activos.length === 0) {
        return <p className="text-boss-gray">No hay enfrentamientos pendientes en este momento.</p>;
    }

    return (
        <div className="mx-auto grid max-w-2xl gap-5">
            {activos.map((e) => (
                <TarjetaEnfrentamiento key={e.id} enfrentamiento={e} />
            ))}
        </div>
    );
}

function VistaResultados({ enfrentamientos }: { enfrentamientos: Enfrentamiento[] }) {
    const finalizados = enfrentamientos.filter((e) => e.estatus === "FINALIZADO");

    if (finalizados.length === 0) {
        return <p className="text-boss-gray">Todavía no hay resultados en esta categoría.</p>;
    }

    return (
        <div className="mx-auto grid max-w-2xl gap-5">
            {finalizados.map((e) => (
                <TarjetaEnfrentamiento key={e.id} enfrentamiento={e} />
            ))}
        </div>
    );
}

function inicialesDe(nombre: string): string {
    const iniciales = nombre
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((palabra) => palabra[0]?.toUpperCase() ?? "")
        .join("");
    return iniciales || "?";
}

function TarjetaCampeon({ enfrentamiento }: { enfrentamiento: Enfrentamiento }) {
    const ganador = enfrentamiento.ganador;
    const nombre = nombreCompetidor(ganador);
    const ganoA = ganador?.id === enfrentamiento.competidorA?.id;
    const puntaje = ganoA ? enfrentamiento.puntajeA : enfrentamiento.puntajeB;

    return (
        <div className="relative w-28 shrink-0 rounded-lg border border-boss-green/50 bg-boss-green/10 px-3 pb-3 pt-8 sm:w-36 sm:pt-11 lg:w-40">
            <div className="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-boss-green bg-boss-panel sm:h-20 sm:w-20">
                {ganador?.fotoUrl ? (
                    <Image
                        src={ganador.fotoUrl}
                        alt={nombre}
                        width={80}
                        height={80}
                        unoptimized
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-lg text-boss-green sm:text-2xl">
                        {inicialesDe(nombre)}
                    </div>
                )}
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-boss-gray sm:text-xs">
                {CATEGORIAS[enfrentamiento.categoria]}
            </p>
            <p className="mt-0.5 font-display text-base uppercase leading-tight text-boss-green sm:text-xl">{nombre}</p>
            {puntaje != null && (
                <p className="mt-1 font-display text-lg text-white sm:text-2xl">
                    {puntaje} <span className="text-[10px] uppercase tracking-widest text-boss-gray sm:text-xs">pts</span>
                </p>
            )}
        </div>
    );
}

// "Final" es siempre el nombre de la última ronda de cada categoría (ver
// nombreRonda en el backend), así que filtrar por eso da el campeón real de
// cada una, sin importar cuántas rondas haya tenido.
function VistaGanadores({ enfrentamientos }: { enfrentamientos: Enfrentamiento[] }) {
    const campeones = enfrentamientos.filter((e) => e.ronda === "Final" && e.estatus === "FINALIZADO" && e.ganador);

    if (campeones.length === 0) {
        return <p className="text-boss-gray">Todavía no hay campeones definidos.</p>;
    }

    return (
        <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-start justify-center gap-x-3 gap-y-8 sm:mt-8 sm:gap-x-4 sm:gap-y-12">
            {campeones.map((e) => (
                <TarjetaCampeon key={e.id} enfrentamiento={e} />
            ))}
        </div>
    );
}
