"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getVistaRegistros, type CategoriaVistaRegistros, type CompetidorVista, type VistaRegistros } from "@/lib/api";

const INTERVALO_MS = 20_000;

function nombreCompetidor(c: CompetidorVista): string {
    return c.nombreArtistico || `${c.nombres} ${c.apellidos}`;
}

function TarjetaPar({ par }: { par: [CompetidorVista, CompetidorVista] }) {
    return (
        <div className="overflow-hidden rounded-lg border border-boss-border bg-boss-panel/60">
            <div className="flex items-stretch">
                <div className="flex flex-1 items-center justify-center bg-boss-blue/15 px-3 py-3">
                    <p className="truncate text-center font-display text-sm uppercase text-white sm:text-base">
                        {nombreCompetidor(par[0])}
                    </p>
                </div>
                <div className="flex shrink-0 items-center px-2 text-xs text-boss-gray">vs</div>
                <div className="flex flex-1 items-center justify-center bg-boss-red/15 px-3 py-3">
                    <p className="truncate text-center font-display text-sm uppercase text-white sm:text-base">
                        {nombreCompetidor(par[1])}
                    </p>
                </div>
            </div>
        </div>
    );
}

function TarjetaCategoria({ datos }: { datos: CategoriaVistaRegistros }) {
    return (
        <div className="rounded-xl border border-boss-border bg-boss-panel/40 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-xl uppercase tracking-wide text-white">{datos.label}</h2>
                <p className="text-sm text-boss-gray">
                    <span className="font-display text-boss-red">{datos.totalInscritos}</span> inscrito
                    {datos.totalInscritos === 1 ? "" : "s"}
                </p>
            </div>

            {datos.pares.length === 0 && datos.bye === null && (
                <p className="mt-3 text-sm text-boss-gray">Aún no hay suficientes inscritos para armar un bracket.</p>
            )}

            {datos.pares.length > 0 && (
                <>
                    <p className="mt-3 text-xs uppercase tracking-widest text-boss-gray">
                        {datos.ronda} · vista previa, sujeta a cambios
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {datos.pares.map((par, indice) => (
                            <TarjetaPar key={indice} par={par} />
                        ))}
                    </div>
                </>
            )}

            {datos.bye && (
                <div className="mt-2 rounded-lg border border-boss-border bg-boss-panel/60 px-3 py-2 text-sm text-boss-gray">
                    <span className="font-display uppercase text-white">{nombreCompetidor(datos.bye)}</span> — pasa
                    directo a la siguiente ronda (número impar de inscritos)
                </div>
            )}
        </div>
    );
}

export default function VistaRegistrosContenido() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token") ?? "";

    const [datos, setDatos] = useState<VistaRegistros | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setError("Falta el token en el enlace.");
            return;
        }

        let cancelado = false;
        const poll = async () => {
            const resultado = await getVistaRegistros(token);
            if (cancelado) return;
            if (!resultado.ok) {
                setError(resultado.error);
                return;
            }
            setError(null);
            setDatos(resultado.data);
        };

        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, [token]);

    if (error) {
        return <p className="mt-6 text-boss-gray">{error}</p>;
    }

    if (!datos) {
        return <p className="mt-6 text-boss-gray">Cargando...</p>;
    }

    return (
        <div className="mt-6 w-full max-w-3xl">
            <p className="mb-4 text-center text-xs uppercase tracking-widest text-boss-gray">
                Se actualiza sola cada {Math.round(INTERVALO_MS / 1000)}s · última actualización{" "}
                {new Date(datos.generadoEn).toLocaleTimeString("es-MX")}
            </p>
            <div className="grid gap-4">
                {datos.categorias.map((c) => (
                    <TarjetaCategoria key={c.categoria} datos={c} />
                ))}
            </div>
        </div>
    );
}
