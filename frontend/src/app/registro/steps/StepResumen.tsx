import { useFormContext } from "react-hook-form";
import Image from "next/image";
import { CATEGORIAS, calcularPrecioTotal, formatearMXN, preventaVigentePorFecha, PAQUETES_CON_PREVENTA } from "@/config/catalog";
import type { RegistrationFormValues } from "@/types/registrationForm";
import type { PreventaEstado } from "@/lib/api";
import { Field, inputClass } from "../components/Field";

export function StepResumen({ preventaEstado }: { preventaEstado: PreventaEstado | null }) {
    const {
        watch,
        register,
        formState: { errors },
    } = useFormContext<RegistrationFormValues>();

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
    // Mientras se confirma con el backend, se usa solo la fecha como aproximación;
    // el backend siempre recalcula el total real al pagar.
    const preventaActiva = preventaEstado?.activa ?? preventaVigentePorFecha();
    const precioTotal = paqueteBase
        ? calcularPrecioTotal(paqueteBase, workshopsSeleccionados, { agregarOpenStyle, preventaActiva })
        : 0;

    const paqueteElegiblePreventa = paqueteBase ? PAQUETES_CON_PREVENTA.includes(paqueteBase) : false;
    const calificaParaPreventa = preventaActiva && paqueteElegiblePreventa;

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

            {calificaParaPreventa && (
                <div className="mb-4 rounded-md border border-boss-green/40 bg-boss-green/10 px-4 py-3 text-left">
                    <p className="font-display text-sm text-center uppercase tracking-widest text-boss-green">
                         ¡Estás dentro de los primeros 50 lugares!
                    </p>
                    <p className="mt-1 text-xl text-boss-gray">
                        Se te aplicará automáticamente un 20% de descuento de la Preventa Fundadores
                        
                        .
                    </p>
                </div>
            )}

            <div className="space-y-3 rounded-lg border border-boss-border bg-boss-black/40 p-4">
                {filas.map((fila) => (
                    <div key={fila.label} className="mx-auto flex max-w-56 items-center gap-3 text-sm">
                        <span className="w-28 shrink-0 text-boss-gray">{fila.label}</span>
                        <span className="text-left font-medium text-foreground">{fila.valor}</span>
                    </div>
                ))}
                <div className="mx-auto flex max-w-56 items-center gap-3 border-t border-boss-border pt-3">
                    <span className="w-28 shrink-0 text-sm font-semibold uppercase tracking-wide text-white">
                        Costo Total
                    </span>
                    <span className="text-left font-display text-xl text-boss-red">{formatearMXN(precioTotal)}</span>
                </div>
            </div>

            <div className="mt-5">
                <Field label="Código de descuento (opcional)" error={errors.codigoDescuento?.message}>
                    <input
                        {...register("codigoDescuento")}
                        className={inputClass}
                        placeholder="Ingresa tu código"
                        autoCapitalize="none"
                        autoCorrect="off"
                    />
                </Field>
                <p className="mt-1 text-xs text-boss-gray">
                    Si tienes un código válido, el descuento se aplicará automáticamente al monto a pagar.
                </p>
            </div>

            <p className="mt-6 text-center font-display text-xl uppercase leading-snug tracking-wide text-white sm:text-2xl">
                Estás a un paso de formar parte de la primera edición de{" "}
                <span className="text-boss-red">&ldquo;THE BOSS&rdquo;</span>, el evento que establecerá un nuevo
                estándar para el breaking en México.
            </p>
        </>
    );
}
