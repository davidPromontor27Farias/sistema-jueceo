"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireRol } from "../layout";
import { inputClass, Field } from "../../../registro/components/Field";
import { CATEGORIAS, type Categoria } from "@/config/catalog";
import {
    createEnfrentamiento,
    getCategoriasEstado,
    getCompetidoresPorCategoria,
    getEnfrentamientos,
    patchCategoriaEstado,
    updateEnfrentamiento,
    type CategoriaEstado,
    type CompetidorResumen,
    type Enfrentamiento,
    type EstatusCompetencia,
    type EstatusEnfrentamiento,
} from "@/lib/adminApi";

const ESTATUS_CATEGORIA_LABEL: Record<EstatusCompetencia, string> = {
    NO_INICIADA: "No iniciada",
    EN_CURSO: "En curso",
    FINALIZADA: "Finalizada",
};
const ESTATUS_CATEGORIA_OPCIONES: EstatusCompetencia[] = ["NO_INICIADA", "EN_CURSO", "FINALIZADA"];

const ESTATUS_ENFRENTAMIENTO_LABEL: Record<EstatusEnfrentamiento, string> = {
    PENDIENTE: "Pendiente",
    EN_CURSO: "En curso",
    FINALIZADO: "Finalizado",
};

export default function AdminCompetenciaPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN", "STAFF_JUECEO"]}>
            <CompetenciaContenido />
        </RequireRol>
    );
}

function CompetenciaContenido() {
    const [categorias, setCategorias] = useState<CategoriaEstado[] | null>(null);
    const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<Categoria | null>(null);
    const [error, setError] = useState<string | null>(null);

    const cargarCategorias = async () => {
        const resultado = await getCategoriasEstado();
        if (resultado.ok) {
            setCategorias(resultado.data.categorias);
            setError(null);
        } else {
            setError(resultado.error);
        }
    };

    useEffect(() => {
        let cancelado = false;
        getCategoriasEstado().then((resultado) => {
            if (cancelado) return;
            if (resultado.ok) {
                setCategorias(resultado.data.categorias);
                setError(null);
            } else {
                setError(resultado.error);
            }
        });
        return () => {
            cancelado = true;
        };
    }, []);

    const cambiarEstatus = async (categoria: Categoria, estatus: EstatusCompetencia) => {
        const resultado = await patchCategoriaEstado(categoria, estatus);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        cargarCategorias();
    };

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Control de competencia</h1>
            <p className="mt-1 text-boss-gray">Arranca cada categoría y captura sus enfrentamientos y resultados.</p>

            {error && (
                <p className="mt-4 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300">
                    {error}
                </p>
            )}

            <div className="mt-6 space-y-2">
                {categorias === null && <p className="text-boss-gray">Cargando...</p>}
                {categorias?.map((c) => (
                    <div
                        key={c.categoria}
                        className={[
                            "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
                            categoriaSeleccionada === c.categoria
                                ? "border-boss-red bg-boss-red/10"
                                : "border-boss-border bg-boss-panel/60",
                        ].join(" ")}
                    >
                        <button
                            type="button"
                            onClick={() => setCategoriaSeleccionada(c.categoria)}
                            className="text-left font-medium text-white hover:text-boss-red"
                        >
                            {c.label}
                        </button>

                        <select
                            value={c.estatus}
                            onChange={(e) => cambiarEstatus(c.categoria, e.target.value as EstatusCompetencia)}
                            className="rounded-md border border-boss-border bg-boss-black px-2 py-1.5 text-sm text-foreground"
                        >
                            {ESTATUS_CATEGORIA_OPCIONES.map((estatus) => (
                                <option key={estatus} value={estatus}>
                                    {ESTATUS_CATEGORIA_LABEL[estatus]}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>

            {categoriaSeleccionada && <PanelEnfrentamientos categoria={categoriaSeleccionada} />}
        </div>
    );
}

function PanelEnfrentamientos({ categoria }: { categoria: Categoria }) {
    const [enfrentamientos, setEnfrentamientos] = useState<Enfrentamiento[] | null>(null);
    const [competidores, setCompetidores] = useState<NonNullable<CompetidorResumen>[]>([]);
    const [error, setError] = useState<string | null>(null);

    const cargar = async () => {
        const [resEnfrentamientos, resCompetidores] = await Promise.all([
            getEnfrentamientos(categoria),
            getCompetidoresPorCategoria(categoria),
        ]);
        if (resEnfrentamientos.ok) {
            setEnfrentamientos(resEnfrentamientos.data.enfrentamientos);
        } else {
            setError(resEnfrentamientos.error);
        }
        if (resCompetidores.ok) {
            setCompetidores(resCompetidores.data.competidores);
        }
    };

    useEffect(() => {
        let cancelado = false;
        Promise.all([getEnfrentamientos(categoria), getCompetidoresPorCategoria(categoria)]).then(
            ([resEnfrentamientos, resCompetidores]) => {
                if (cancelado) return;
                if (resEnfrentamientos.ok) {
                    setEnfrentamientos(resEnfrentamientos.data.enfrentamientos);
                } else {
                    setError(resEnfrentamientos.error);
                }
                if (resCompetidores.ok) {
                    setCompetidores(resCompetidores.data.competidores);
                }
            },
        );
        return () => {
            cancelado = true;
        };
    }, [categoria]);

    const marcarGanador = async (enfrentamientoId: string, ganadorId: string) => {
        const resultado = await updateEnfrentamiento(enfrentamientoId, { ganadorId, estatus: "FINALIZADO" });
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        cargar();
    };

    return (
        <div className="mt-6 rounded-lg border border-boss-border bg-boss-panel/60 p-5">
            <h2 className="font-display text-lg uppercase tracking-wide text-white">
                Enfrentamientos — {CATEGORIAS[categoria]}
            </h2>

            {error && <p className="mt-2 text-sm font-medium text-red-400">{error}</p>}

            <NuevoEnfrentamientoForm categoria={categoria} competidores={competidores} onCreado={cargar} />

            <div className="mt-5 space-y-3">
                {enfrentamientos === null && <p className="text-boss-gray">Cargando...</p>}
                {enfrentamientos?.length === 0 && (
                    <p className="text-boss-gray">Todavía no hay enfrentamientos para esta categoría.</p>
                )}
                {enfrentamientos?.map((enf) => (
                    <div key={enf.id} className="rounded-md border border-boss-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold uppercase tracking-wide text-boss-gray">
                                {enf.ronda} · {ESTATUS_ENFRENTAMIENTO_LABEL[enf.estatus]}
                            </p>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <BotonCompetidor
                                competidor={enf.competidorA}
                                esGanador={enf.ganador?.id === enf.competidorA?.id}
                                onElegir={() => enf.competidorA && marcarGanador(enf.id, enf.competidorA.id)}
                            />
                            <span className="text-boss-gray">vs</span>
                            <BotonCompetidor
                                competidor={enf.competidorB}
                                esGanador={enf.ganador?.id === enf.competidorB?.id}
                                onElegir={() => enf.competidorB && marcarGanador(enf.id, enf.competidorB.id)}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function BotonCompetidor({
    competidor,
    esGanador,
    onElegir,
}: {
    competidor: CompetidorResumen;
    esGanador: boolean;
    onElegir: () => void;
}) {
    if (!competidor) {
        return <span className="text-boss-gray">— sin asignar —</span>;
    }

    return (
        <button
            type="button"
            onClick={onElegir}
            className={[
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                esGanador ? "border-boss-green bg-boss-green/10 text-boss-green" : "border-boss-border text-white hover:border-boss-red",
            ].join(" ")}
        >
            {competidor.nombreArtistico || `${competidor.nombres} ${competidor.apellidos}`}
            {esGanador && " 🏆"}
        </button>
    );
}

function NuevoEnfrentamientoForm({
    categoria,
    competidores,
    onCreado,
}: {
    categoria: Categoria;
    competidores: NonNullable<CompetidorResumen>[];
    onCreado: () => void;
}) {
    const [ronda, setRonda] = useState("");
    const [competidorAId, setCompetidorAId] = useState("");
    const [competidorBId, setCompetidorBId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setEnviando(true);

        const resultado = await createEnfrentamiento({
            categoria,
            ronda,
            ...(competidorAId ? { competidorAId } : {}),
            ...(competidorBId ? { competidorBId } : {}),
        });

        setEnviando(false);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }

        setRonda("");
        setCompetidorAId("");
        setCompetidorBId("");
        onCreado();
    };

    return (
        <form onSubmit={onSubmit} className="mt-4 grid gap-3 border-t border-boss-border pt-4 sm:grid-cols-4">
            {error && <p className="text-sm font-medium text-red-400 sm:col-span-4">{error}</p>}

            <Field label="Ronda">
                <input
                    required
                    placeholder="Ej. Cuartos"
                    value={ronda}
                    onChange={(e) => setRonda(e.target.value)}
                    className={inputClass}
                />
            </Field>
            <Field label="Competidor A">
                <select value={competidorAId} onChange={(e) => setCompetidorAId(e.target.value)} className={inputClass}>
                    <option value="">— sin asignar —</option>
                    {competidores.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.nombreArtistico || `${c.nombres} ${c.apellidos}`}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Competidor B">
                <select value={competidorBId} onChange={(e) => setCompetidorBId(e.target.value)} className={inputClass}>
                    <option value="">— sin asignar —</option>
                    {competidores.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.nombreArtistico || `${c.nombres} ${c.apellidos}`}
                        </option>
                    ))}
                </select>
            </Field>

            <div className="flex items-end">
                <button
                    type="submit"
                    disabled={enviando}
                    className="w-full rounded-md bg-boss-red px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark disabled:opacity-50"
                >
                    {enviando ? "Creando..." : "Agregar"}
                </button>
            </div>
        </form>
    );
}
