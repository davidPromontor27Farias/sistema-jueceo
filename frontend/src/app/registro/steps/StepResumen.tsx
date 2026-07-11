import { useFormContext } from "react-hook-form";
import { CATEGORIAS, calcularPrecioTotal, formatearMXN } from "@/config/catalog";
import type { RegistrationFormValues } from "@/types/registrationForm";

export function StepResumen() {
    const { watch } = useFormContext<RegistrationFormValues>();

    const nombres = watch("nombres");
    const apellidos = watch("apellidos");
    const categoria = watch("categoria");
    const ciudad = watch("ciudad");
    const academiaCrew = watch("academiaCrew");
    const paqueteBase = watch("paqueteBase");
    const workshopsSeleccionados = watch("workshopsSeleccionados") ?? [];

    const precioTotal = paqueteBase ? calcularPrecioTotal(paqueteBase, workshopsSeleccionados) : 0;

    const filas: { label: string; valor: string }[] = [
        { label: "Nombre", valor: `${nombres ?? ""} ${apellidos ?? ""}`.trim() || "—" },
        { label: "Categoría", valor: categoria ? CATEGORIAS[categoria] : "—" },
        { label: "Ciudad", valor: ciudad || "—" },
        { label: "Academia / Crew", valor: academiaCrew || "Ninguna" },
    ];

    return (
        <>
            <div className="space-y-3 rounded-lg border border-boss-border bg-boss-black/40 p-4">
                {filas.map((fila) => (
                    <div key={fila.label} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-boss-gray">{fila.label}</span>
                        <span className="font-medium text-foreground">{fila.valor}</span>
                    </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-boss-border pt-3">
                    <span className="text-sm font-semibold uppercase tracking-wide text-white">Costo Total</span>
                    <span className="font-display text-xl text-boss-red">{formatearMXN(precioTotal)}</span>
                </div>
            </div>

            <p className="mt-6 text-center text-sm text-boss-gray">
                Estás a un paso de formar parte de la primera edición de{" "}
                <span className="text-boss-green">&ldquo;THE BOSS&rdquo;</span>, el evento que establecerá un nuevo
                estándar para el breaking en México.
            </p>
        </>
    );
}
