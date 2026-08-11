"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CATEGORIAS } from "@/config/catalog";
import { getEnfrentamientos, getPantallaEstado, type Enfrentamiento, type PantallaEstado } from "@/lib/adminApi";

const INTERVALO_MS = 3000;

function nombreCompetidor(c: Enfrentamiento["competidorA"]): string {
    if (!c) return "Por definir";
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

export default function PantallaPublicaPage() {
    const [estado, setEstado] = useState<PantallaEstado | null>(null);
    const [enfrentamientos, setEnfrentamientos] = useState<Enfrentamiento[]>([]);

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
        if (!estado?.categoriaEnfocada || estado.vista === "APAGADA") {
            return;
        }

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
    }, [estado?.categoriaEnfocada, estado?.vista]);

    if (!estado || estado.vista === "APAGADA") {
        return (
            <main className="flex min-h-screen items-center justify-center bg-boss-black">
                <Image src="/the-boss-logo.png" alt="THE BOSS — Breaking Battles" width={280} height={233} />
            </main>
        );
    }

    const tituloCategoria = estado.categoriaEnfocada ? CATEGORIAS[estado.categoriaEnfocada] : null;

    return (
        <main className="min-h-screen bg-boss-black px-8 py-10 text-center">
            <Image src="/the-boss-logo.png" alt="THE BOSS — Breaking Battles" width={120} height={100} className="mx-auto" />
            {tituloCategoria && (
                <h1 className="mt-4 font-display text-3xl uppercase tracking-widest text-boss-red">{tituloCategoria}</h1>
            )}

            <div className="mt-10">
                {estado.vista === "BRACKETS" && <VistaBrackets enfrentamientos={enfrentamientos} />}
                {estado.vista === "ENFRENTAMIENTOS" && <VistaEnfrentamientosEnCurso enfrentamientos={enfrentamientos} />}
                {estado.vista === "RESULTADOS" && <VistaResultados enfrentamientos={enfrentamientos} />}
                {estado.vista === "GANADORES" && <VistaGanadores enfrentamientos={enfrentamientos} />}
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

function VistaBrackets({ enfrentamientos }: { enfrentamientos: Enfrentamiento[] }) {
    if (enfrentamientos.length === 0) {
        return <p className="text-boss-gray">Bracket todavía no publicado.</p>;
    }

    const rondas = Array.from(new Set(enfrentamientos.map((e) => e.ronda)));

    return (
        <div className="mx-auto grid max-w-4xl gap-6">
            {rondas.map((ronda) => (
                <div key={ronda}>
                    <h2 className="mb-3 font-display text-lg uppercase tracking-wide text-white">{ronda}</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {enfrentamientos
                            .filter((e) => e.ronda === ronda)
                            .map((e) => (
                                <TarjetaEnfrentamiento key={e.id} enfrentamiento={e} />
                            ))}
                    </div>
                </div>
            ))}
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

function VistaGanadores({ enfrentamientos }: { enfrentamientos: Enfrentamiento[] }) {
    const ganadores = enfrentamientos.filter((e) => e.ganador);

    if (ganadores.length === 0) {
        return <p className="text-boss-gray">Todavía no hay ganadores en esta categoría.</p>;
    }

    return (
        <div className="mx-auto grid max-w-2xl gap-4">
            {ganadores.map((e) => (
                <div key={e.id} className="rounded-xl border border-boss-green/50 bg-boss-green/10 p-6">
                    <p className="text-sm font-semibold uppercase tracking-widest text-boss-gray">{e.ronda}</p>
                    <p className="mt-2 font-display text-4xl uppercase text-boss-green">{nombreCompetidor(e.ganador)}</p>
                </div>
            ))}
        </div>
    );
}
