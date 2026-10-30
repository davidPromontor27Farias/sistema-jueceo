"use client";

import { useEffect, useMemo, useState } from "react";
import { RequireRol } from "../layout";
import { inputClass } from "../../../registro/components/Field";
import { getWorkshops, type WorkshopComprador } from "@/lib/adminApi";
import { WORKSHOPS_BREAKING, WORKSHOPS_OPEN_STYLE } from "@/config/catalog";

const ESTADO_ACCESO_LABEL: Record<WorkshopComprador["estadoAcceso"], string> = {
    NO_USADO: "No ha entrado",
    DENTRO: "Dentro",
    FUERA_TEMPORAL: "Fuera temporal",
    REINGRESO: "Reingresó",
    BLOQUEADO: "Bloqueado",
};

function nombreCompleto(w: WorkshopComprador): string {
    return `${w.nombres} ${w.apellidos}`;
}

// Normaliza para que el filtro no dependa de acentos/mayúsculas ("jose" debe
// encontrar a "José").
const DIACRITICOS = new RegExp("[̀-ͯ]", "g");

function normalizar(texto: string): string {
    return texto.normalize("NFD").replace(DIACRITICOS, "").toLowerCase();
}

export default function AdminWorkshopsPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN", "STAFF_ACCESO"]}>
            <WorkshopsContenido />
        </RequireRol>
    );
}

function WorkshopsContenido() {
    const [workshops, setWorkshops] = useState<WorkshopComprador[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState("");

    useEffect(() => {
        let cancelado = false;
        const cargar = () => {
            getWorkshops().then((resultado) => {
                if (cancelado) return;
                if (resultado.ok) {
                    setWorkshops(resultado.data.workshops);
                    setError(null);
                } else {
                    setError(resultado.error);
                }
            });
        };
        cargar();
        const id = setInterval(cargar, 15000);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, []);

    const filtrados = useMemo(() => {
        if (!workshops) return [];
        const q = normalizar(busqueda.trim());
        if (!q) return workshops;
        return workshops.filter(
            (w) => normalizar(nombreCompleto(w)).includes(q) || normalizar(w.nombreArtistico).includes(q),
        );
    }, [workshops, busqueda]);

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-widest text-white">Workshops</h1>
            <p className="mt-1 text-sm text-boss-gray">
                Quién compró al menos un Workshop (Breaking u Open Style) — competidores y público en general.
            </p>

            <input
                type="text"
                placeholder="Buscar por nombre..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className={`${inputClass} mt-5`}
            />

            {error && <p className="mt-4 text-sm font-medium text-red-400">{error}</p>}
            {workshops === null && !error && <p className="mt-4 text-boss-gray">Cargando...</p>}

            {workshops !== null && (
                <>
                    <p className="mt-4 text-xs uppercase tracking-widest text-boss-gray">
                        {filtrados.length} de {workshops.length} compradores
                    </p>

                    {filtrados.length === 0 ? (
                        <p className="mt-6 text-boss-gray">
                            {workshops.length === 0 ? "Nadie ha comprado workshops todavía." : "Sin resultados para esa búsqueda."}
                        </p>
                    ) : (
                        <div className="mt-3 space-y-2">
                            {filtrados.map((w) => (
                                <FilaComprador key={w.id} w={w} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function FilaComprador({ w }: { w: WorkshopComprador }) {
    return (
        <div className="rounded-md border border-boss-border bg-boss-panel/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-white">{w.nombreArtistico || nombreCompleto(w)}</p>
                        <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                                w.tipo === "COMPETIDOR" ? "bg-boss-red/15 text-boss-red" : "bg-boss-blue/15 text-boss-blue"
                            }`}
                        >
                            {w.tipo === "COMPETIDOR" ? w.categoriaLabel : "Público general"}
                        </span>
                        {w.competidorId && <span className="shrink-0 text-xs text-boss-gray">{w.competidorId}</span>}
                    </div>
                    {w.nombreArtistico && <p className="truncate text-sm text-boss-gray">{nombreCompleto(w)}</p>}
                    <p className="mt-1 text-xs text-boss-gray">
                        {w.telefono} · {w.correo}
                    </p>
                </div>

                <span
                    className={`shrink-0 self-start rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide ${
                        w.estadoAcceso === "DENTRO" || w.estadoAcceso === "REINGRESO"
                            ? "bg-boss-green/15 text-boss-green"
                            : w.estadoAcceso === "BLOQUEADO"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-boss-black text-boss-gray"
                    }`}
                >
                    {ESTADO_ACCESO_LABEL[w.estadoAcceso]}
                </span>
            </div>

            {(w.workshopsSeleccionados.length > 0 || w.workshopsOpenStyleSeleccionados.length > 0) && (
                <div className="mt-3 space-y-1.5 border-t border-boss-border pt-3">
                    {w.workshopsSeleccionados.length > 0 && (
                        <WorkshopLista etiqueta="Breaking" numeros={w.workshopsSeleccionados} catalogo={WORKSHOPS_BREAKING} />
                    )}
                    {w.workshopsOpenStyleSeleccionados.length > 0 && (
                        <WorkshopLista
                            etiqueta="Open Style"
                            numeros={w.workshopsOpenStyleSeleccionados}
                            catalogo={WORKSHOPS_OPEN_STYLE}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function WorkshopLista({
    etiqueta,
    numeros,
    catalogo,
}: {
    etiqueta: string;
    numeros: number[];
    catalogo: Record<number, string>;
}) {
    return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-boss-red">{etiqueta}:</span>
            <span className="text-white">
                {[...numeros]
                    .sort((a, b) => a - b)
                    .map((n) => catalogo[n] ?? `Workshop ${n}`)
                    .join(" · ")}
            </span>
        </div>
    );
}
