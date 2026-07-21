import Image from "next/image";
import { EVENTO_FECHA_LABEL, EVENTO_UBICACION } from "@/config/catalog";
import { CrownIcon } from "./icons";

export interface TarjetaCompartirProps {
    esPublico: boolean;
    nombreArtistico: string;
    categoriaLabel: string;
    competidorId: string | null;
    fotoUrl: string | null;
}

// Versión del pase pensada solo para compartir en redes: NO incluye el código QR
// (es el acceso al evento, información sensible que no debe publicarse). Se
// renderiza fuera de pantalla y se captura como imagen desde QrStatus.tsx.
export default function TarjetaCompartir({ esPublico, nombreArtistico, categoriaLabel, competidorId, fotoUrl }: TarjetaCompartirProps) {
    return (
        <div className="w-[480px] overflow-hidden rounded-2xl border border-boss-border bg-boss-panel text-left">
            <div className="border-b border-boss-border px-6 py-4">
                <p className="flex items-center justify-center gap-3 font-display text-xl uppercase tracking-[0.2em] text-white">
                    <CrownIcon className="h-5 w-6 text-boss-red" />
                    {esPublico ? "Official General Pass" : "Official Competitor Pass"}
                    <CrownIcon className="h-5 w-6 text-boss-red" />
                </p>
            </div>

            <div className="flex items-stretch gap-5 p-6">
                {fotoUrl && (
                    <Image
                        src={fotoUrl}
                        alt={`Foto de ${nombreArtistico}`}
                        width={160}
                        height={220}
                        unoptimized
                        className="h-full w-40 shrink-0 rounded-lg border border-boss-border object-cover"
                    />
                )}
                <div className="flex flex-col items-start justify-center">
                    <p className="text-sm font-semibold uppercase tracking-widest text-boss-red">
                        {esPublico ? "Público general" : "Competidor"}
                    </p>
                    <p className="mt-1 font-display text-3xl uppercase text-white">{nombreArtistico}</p>
                    <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-boss-red">Categoría</p>
                    <p className="mt-1 text-lg uppercase text-white">{categoriaLabel}</p>
                    {competidorId && (
                        <>
                            <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-boss-red">
                                {esPublico ? "ID de acceso" : "Competidor ID"}
                            </p>
                            <p className="mt-1 font-display text-2xl text-boss-green">{competidorId}</p>
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-center gap-2 border-t border-dashed border-boss-border px-6 py-3 text-sm uppercase tracking-widest text-boss-gray">
                {EVENTO_FECHA_LABEL} · {EVENTO_UBICACION}
            </div>

            <div className="bg-boss-red py-2 text-center font-display text-base uppercase tracking-[0.3em] text-boss-black">
                Who&apos;ll be the Boss?
            </div>
        </div>
    );
}
