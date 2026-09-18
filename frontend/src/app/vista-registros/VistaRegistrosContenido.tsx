"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getVistaRegistros, type CategoriaVistaRegistros, type VistaRegistros } from "@/lib/api";
import { BracketFijo } from "./BracketFijo";

const INTERVALO_MS = 20_000;

export default function VistaRegistrosContenido() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token") ?? "";

    const [datos, setDatos] = useState<VistaRegistros | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

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
            setCategoriaActiva((actual) => actual ?? resultado.data.categorias[0]?.categoria ?? null);
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

    const activa: CategoriaVistaRegistros | undefined =
        datos.categorias.find((c) => c.categoria === categoriaActiva) ?? datos.categorias[0];

    return (
        <div className="mt-6 flex min-h-0 w-full max-w-6xl flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap justify-center gap-2">
                {datos.categorias.map((c) => (
                    <button
                        key={c.categoria}
                        type="button"
                        onClick={() => setCategoriaActiva(c.categoria)}
                        className={[
                            "rounded-md border px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors",
                            c.categoria === activa?.categoria
                                ? "border-boss-red bg-boss-red/10 text-white"
                                : "border-boss-border text-boss-gray hover:border-boss-red hover:text-white",
                        ].join(" ")}
                    >
                        {c.label} <span className="text-boss-red">({c.totalInscritos})</span>
                    </button>
                ))}
            </div>

            {activa && (
                <div className="mt-6 min-h-0 flex-1">
                    <BracketFijo enfrentamientos={activa.enfrentamientos} />
                </div>
            )}
        </div>
    );
}
