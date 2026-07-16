import { useFormContext } from "react-hook-form";
import Image from "next/image";
import { CATEGORIAS, calcularPrecioTotal, formatearMXN, preventaVigentePorFecha } from "@/config/catalog";
import type { RegistrationFormValues } from "@/types/registrationForm";

export function StepResumen() {
    const { watch } = useFormContext<RegistrationFormValues>();

    const tipoParticipacion = watch("tipoParticipacion");
    const nombres = watch("nombres");
    const apellidos = watch("apellidos");
    const categoria = watch("categoria");
    const ciudad = watch("ciudad");
    const academiaCrew = watch("academiaCrew");
    const paqueteBase = watch("paqueteBase");
    const workshopsSeleccionados = watch("workshopsSeleccionados") ?? [];
    const agregarOpenStyle = watch("agregarOpenStyle") ?? false;
    const fotoUrl = watch("fotoUrl");

    const esPublico = tipoParticipacion === "PUBLICO";
    const preventaActiva = preventaVigentePorFecha();
    const precioTotal = paqueteBase
        ? calcularPrecioTotal(paqueteBase, workshopsSeleccionados, { agregarOpenStyle, preventaActiva })
        : 0;

    const filas: { label: string; valor: string }[] = [
        { label: "Nombre", valor: `${nombres ?? ""} ${apellidos ?? ""}`.trim() || "—" },
        { label: "Categoría", valor: categoria ? CATEGORIAS[categoria] : "—" },
        { label: "Ciudad", valor: ciudad || "—" },
        ...(esPublico ? [] : [{ label: "Academia / Crew", valor: academiaCrew || "Ninguna" }]),
        ...(agregarOpenStyle ? [{ label: "Extra", valor: "Open Style 1 vs 1" }] : []),
    ];

    return (
        <>
            {fotoUrl && (
                <div className="mb-4 flex justify-center">
                    <Image
                        src={fotoUrl}
                        alt="Foto del competidor"
                        width={150}
                        height={150}
                        unoptimized
                        className="h-50 w-50 rounded-full border-2 border-boss-red object-cover"
                    />
                </div>
            )}

            <div className="space-y-3 rounded-lg border border-boss-border bg-boss-black/40 p-4">
                {filas.map((fila) => (
                    <div key={fila.label} className="mx-auto flex max-w-56 items-center justify-between gap-3 text-sm">
                        <span className="text-boss-gray">{fila.label}</span>
                        <span className="font-medium text-foreground">{fila.valor}</span>
                    </div>
                ))}
                <div className="mx-auto flex max-w-56 items-center justify-between gap-3 border-t border-boss-border pt-3">
                    <span className="text-sm font-semibold uppercase tracking-wide text-white">Costo Total</span>
                    <span className="font-display text-xl text-boss-red">{formatearMXN(precioTotal)}</span>
                </div>
            </div>

            <p className="mt-6 text-center font-display text-xl uppercase leading-snug tracking-wide text-white sm:text-2xl">
                Estás a un paso de formar parte de la primera edición de{" "}
                <span className="text-boss-red">&ldquo;THE BOSS&rdquo;</span>, el evento que establecerá un nuevo
                estándar para el breaking en México.
            </p>
        </>
    );
}
