"use client";

import { useState, type FormEvent } from "react";
import { CATEGORIAS } from "@/config/catalog";
import {
    buscarMiDesglose,
    getMiDesglose,
    type DesglosePuntajeVista,
    type MiDesglose,
    type MiDesgloseResultadoBusqueda,
} from "@/lib/api";

// Mismos 5 rubros del reglamento (Art. 35), mismo orden que usa el panel de
// jueces en /admin/jueceo.
const CRITERIOS: { clave: keyof DesglosePuntajeVista; label: string }[] = [
    { clave: "tecnica", label: "Técnica" },
    { clave: "ejecucion", label: "Ejecución" },
    { clave: "vocabulario", label: "Vocabulario" },
    { clave: "musicalidad", label: "Musicalidad" },
    { clave: "originalidad", label: "Originalidad" },
];

function FilaDesglose({ desglose }: { desglose: DesglosePuntajeVista }) {
    return (
        <div className="mt-2 grid grid-cols-5 gap-1.5">
            {CRITERIOS.map(({ clave, label }) => (
                <div key={clave} className="flex flex-col items-center rounded-md border border-boss-border px-1 py-2">
                    <span className="break-words text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-boss-gray">
                        {label}
                    </span>
                    <span className="font-display text-lg text-white">{desglose[clave]}</span>
                </div>
            ))}
        </div>
    );
}

export default function MiDesgloseContenido() {
    const [nombre, setNombre] = useState("");
    const [buscando, setBuscando] = useState(false);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Varios nombres parecidos encontrados: hay que elegir cuál es antes de
    // poder pedir el detalle (ver GET /mi-desglose/buscar).
    const [opciones, setOpciones] = useState<MiDesgloseResultadoBusqueda[] | null>(null);
    const [datos, setDatos] = useState<MiDesglose | null>(null);

    const verDetalle = async (id: string) => {
        setCargandoDetalle(true);
        setError(null);
        const resultado = await getMiDesglose(id);
        setCargandoDetalle(false);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        setOpciones(null);
        setDatos(resultado.data);
    };

    const buscar = async (e: FormEvent) => {
        e.preventDefault();
        setBuscando(true);
        setError(null);
        setDatos(null);
        setOpciones(null);

        const resultado = await buscarMiDesglose(nombre.trim());
        setBuscando(false);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }

        const { resultados } = resultado.data;
        if (resultados.length === 0) {
            setError("No encontramos a ningún competidor con ese nombre.");
            return;
        }
        if (resultados.length === 1) {
            await verDetalle(resultados[0]!.id);
            return;
        }
        setOpciones(resultados);
    };

    return (
        <div className="mx-auto mt-6 w-full max-w-md">
            <form onSubmit={buscar} className="space-y-3 rounded-lg border border-boss-border bg-boss-panel/60 p-4 text-left">
                <div>
                    <label className="block text-xs uppercase tracking-wide text-boss-gray" htmlFor="nombre">
                        Nombre de competidor
                    </label>
                    <input
                        id="nombre"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej. Fire23"
                        className="mt-1 w-full rounded-md border border-boss-border bg-boss-black px-3 py-2 text-white outline-none focus:border-boss-red"
                        required
                    />
                </div>

                {error && <p className="text-sm font-medium text-red-400">{error}</p>}

                <button
                    type="submit"
                    disabled={buscando || cargandoDetalle}
                    className="w-full rounded-md bg-boss-red px-4 py-2 font-display uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {buscando ? "Buscando..." : "Buscar"}
                </button>
            </form>

            {opciones && (
                <div className="mt-6 space-y-2 text-left">
                    <p className="text-xs uppercase tracking-wide text-boss-gray">
                        Encontramos varios parecidos — elige el tuyo:
                    </p>
                    {opciones.map((o) => (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => verDetalle(o.id)}
                            disabled={cargandoDetalle}
                            className="flex w-full items-center justify-between rounded-md border border-boss-border bg-boss-panel/60 px-3 py-2 text-left transition-colors hover:border-boss-red disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <span className="font-display uppercase text-white">{o.nombre}</span>
                            <span className="text-xs text-boss-gray">
                                {CATEGORIAS[o.categoria]}
                                {o.competidorId && ` · ${o.competidorId}`}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {datos && (
                <div className="mt-6 space-y-5 text-left">
                    <div>
                        <p className="font-display text-lg uppercase text-white">{datos.competidor.nombre}</p>
                        <p className="text-xs text-boss-gray">
                            {CATEGORIAS[datos.competidor.categoria]}
                            {datos.competidor.competidorId && ` · ${datos.competidor.competidorId}`}
                        </p>
                    </div>

                    {datos.preseleccion && (
                        <section>
                            <h2 className="font-display text-sm uppercase tracking-widest text-boss-red">Preselección</h2>
                            <p className="mt-1 font-display text-2xl text-white">{datos.preseleccion.puntajeTotal} pts</p>
                            <FilaDesglose desglose={datos.preseleccion.desglose} />
                        </section>
                    )}

                    {datos.batallas.map((b) => (
                        <section key={b.id}>
                            <h2 className="font-display text-sm uppercase tracking-widest text-boss-red">
                                {b.ronda} <span className={b.gane ? "text-boss-green" : "text-boss-gray"}>· {b.gane ? "Ganaste" : "Perdiste"}</span>
                            </h2>
                            <p className="mt-1 text-sm text-boss-gray">vs {b.rivalNombre ?? "—"}</p>
                            {b.miDesglose && b.miPuntaje != null && (
                                <>
                                    <p className="mt-1 font-display text-2xl text-white">{b.miPuntaje} pts</p>
                                    <FilaDesglose desglose={b.miDesglose} />
                                </>
                            )}
                        </section>
                    ))}

                    {!datos.preseleccion && datos.batallas.length === 0 && (
                        <p className="text-boss-gray">Todavía no hay resultados disponibles para consultar.</p>
                    )}
                </div>
            )}
        </div>
    );
}
