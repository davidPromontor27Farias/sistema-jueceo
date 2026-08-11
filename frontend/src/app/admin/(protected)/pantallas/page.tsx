"use client";

import { useEffect, useState } from "react";
import { RequireRol } from "../layout";
import { CATEGORIAS, type Categoria } from "@/config/catalog";
import { getPantallaEstado, patchPantallaEstado, type PantallaEstado, type VistaPantalla } from "@/lib/adminApi";

const VISTAS: { valor: VistaPantalla; label: string; descripcion: string }[] = [
    { valor: "APAGADA", label: "Apagada", descripcion: "No se proyecta nada en las pantallas." },
    { valor: "BRACKETS", label: "Brackets", descripcion: "Bracket de la categoría enfocada." },
    { valor: "ENFRENTAMIENTOS", label: "Enfrentamientos", descripcion: "Enfrentamiento(s) en curso." },
    { valor: "RESULTADOS", label: "Resultados", descripcion: "Resultados de la categoría enfocada." },
    { valor: "GANADORES", label: "Ganadores", descripcion: "Ganador(es) de la categoría enfocada." },
];

export default function AdminPantallasPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN"]}>
            <PantallasContenido />
        </RequireRol>
    );
}

function PantallasContenido() {
    const [estado, setEstado] = useState<PantallaEstado | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        let cancelado = false;
        getPantallaEstado().then((resultado) => {
            if (cancelado) return;
            if (resultado.ok) {
                setEstado(resultado.data.estado);
                setError(null);
            } else {
                setError(resultado.error);
            }
        });
        return () => {
            cancelado = true;
        };
    }, []);

    const aplicar = async (cambios: { vista?: VistaPantalla; categoriaEnfocada?: Categoria | null }) => {
        if (!estado) return;
        setGuardando(true);
        setError(null);

        const resultado = await patchPantallaEstado({
            vista: cambios.vista ?? estado.vista,
            categoriaEnfocada: "categoriaEnfocada" in cambios ? cambios.categoriaEnfocada : estado.categoriaEnfocada,
        });

        setGuardando(false);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        setEstado(resultado.data.estado);
    };

    if (!estado) {
        return <p className="text-boss-gray">{error ?? "Cargando..."}</p>;
    }

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Control de pantallas</h1>
            <p className="mt-1 text-boss-gray">
                Lo que elijas aquí se refleja en la pantalla pública (<code>/pantalla</code>) en unos segundos.
            </p>

            {error && (
                <p className="mt-4 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300">
                    {error}
                </p>
            )}

            <div className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
                <h2 className="font-display text-lg uppercase tracking-wide text-white">Vista activa</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {VISTAS.map((vista) => (
                        <button
                            key={vista.valor}
                            type="button"
                            disabled={guardando}
                            onClick={() => aplicar({ vista: vista.valor })}
                            className={[
                                "rounded-md border p-4 text-left transition-colors disabled:opacity-50",
                                estado.vista === vista.valor
                                    ? "border-boss-red bg-boss-red/10"
                                    : "border-boss-border hover:border-boss-red",
                            ].join(" ")}
                        >
                            <p className="font-display uppercase tracking-wide text-white">{vista.label}</p>
                            <p className="mt-1 text-xs text-boss-gray">{vista.descripcion}</p>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
                <h2 className="font-display text-lg uppercase tracking-wide text-white">Categoría enfocada</h2>
                <select
                    disabled={guardando}
                    value={estado.categoriaEnfocada ?? ""}
                    onChange={(e) => aplicar({ categoriaEnfocada: (e.target.value || null) as Categoria | null })}
                    className="mt-3 w-full max-w-sm rounded-md border border-boss-border bg-boss-black px-3 py-2.5 text-foreground"
                >
                    <option value="">Ninguna</option>
                    {Object.entries(CATEGORIAS).map(([valor, label]) => (
                        <option key={valor} value={valor}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
