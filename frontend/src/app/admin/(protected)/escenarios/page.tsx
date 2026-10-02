"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireRol } from "../layout";
import { inputClass, Field } from "../../../registro/components/Field";
import { createEscenario, getEscenarios, updateEscenario, type Escenario } from "@/lib/adminApi";

export default function AdminEscenariosPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN"]}>
            <EscenariosContenido />
        </RequireRol>
    );
}

function EscenariosContenido() {
    const [escenarios, setEscenarios] = useState<Escenario[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const recargar = async () => {
        const resultado = await getEscenarios();
        if (resultado.ok) {
            setEscenarios(resultado.data.escenarios);
            setError(null);
        } else {
            setError(resultado.error);
        }
    };

    useEffect(() => {
        let cancelado = false;
        getEscenarios().then((resultado) => {
            if (cancelado) return;
            if (resultado.ok) {
                setEscenarios(resultado.data.escenarios);
                setError(null);
            } else {
                setError(resultado.error);
            }
        });
        return () => {
            cancelado = true;
        };
    }, []);

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Escenarios</h1>
            <p className="mt-1 text-boss-gray">
                Tarimas físicas donde corre la Preselección en paralelo. Asigna jueces a cada uno desde{" "}
                <span className="text-white">Usuarios</span>; al iniciar la Preselección de una categoría, los
                competidores se reparten proporcionalmente entre los escenarios activos que tengan al menos un juez
                activo asignado.
            </p>

            {error && (
                <p className="mt-4 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300">
                    {error}
                </p>
            )}

            <FormularioNuevoEscenario onCreado={recargar} />

            <div className="mt-8 space-y-3">
                {escenarios === null && <p className="text-boss-gray">Cargando...</p>}
                {escenarios?.map((escenario) => (
                    <FilaEscenario key={escenario.id} escenario={escenario} onCambio={recargar} />
                ))}
            </div>
        </div>
    );
}

function FormularioNuevoEscenario({ onCreado }: { onCreado: () => void }) {
    const [nombre, setNombre] = useState("");
    const [orden, setOrden] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setEnviando(true);

        const resultado = await createEscenario({ nombre, orden });
        setEnviando(false);

        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }

        setNombre("");
        setOrden(0);
        onCreado();
    };

    return (
        <form
            onSubmit={onSubmit}
            className="mt-6 grid gap-4 rounded-lg border border-boss-border bg-boss-panel/60 p-5 sm:grid-cols-2"
        >
            <h2 className="font-display text-lg uppercase tracking-wide text-white sm:col-span-2">Nuevo escenario</h2>

            {error && (
                <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300 sm:col-span-2">
                    {error}
                </p>
            )}

            <Field label="Nombre">
                <input
                    required
                    placeholder="Escenario A"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className={inputClass}
                />
            </Field>
            <Field label="Orden" hint="Desempata el reparto de sobrantes y el orden en pantalla">
                <input
                    type="number"
                    value={orden}
                    onChange={(e) => setOrden(Number(e.target.value))}
                    className={inputClass}
                />
            </Field>

            <button
                type="submit"
                disabled={enviando}
                className="rounded-md bg-boss-red px-4 py-2.5 font-display text-base uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
            >
                {enviando ? "Creando..." : "Crear escenario"}
            </button>
        </form>
    );
}

function FilaEscenario({ escenario, onCambio }: { escenario: Escenario; onCambio: () => void }) {
    const [error, setError] = useState<string | null>(null);

    const alternarActivo = async () => {
        setError(null);
        const resultado = await updateEscenario(escenario.id, { activo: !escenario.activo });
        if (!resultado.ok) setError(resultado.error);
        onCambio();
    };

    return (
        <div className="rounded-lg border border-boss-border bg-boss-panel/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="font-medium text-white">
                        {escenario.nombre} {!escenario.activo && <span className="text-xs text-boss-gray">(desactivado)</span>}
                    </p>
                    <p className="text-sm text-boss-gray">Orden: {escenario.orden}</p>
                </div>

                <button
                    type="button"
                    onClick={alternarActivo}
                    className="rounded-md border border-boss-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-red hover:text-boss-red"
                >
                    {escenario.activo ? "Desactivar" : "Reactivar"}
                </button>
            </div>

            {error && <p className="mt-2 text-xs font-medium text-red-400">{error}</p>}
        </div>
    );
}
