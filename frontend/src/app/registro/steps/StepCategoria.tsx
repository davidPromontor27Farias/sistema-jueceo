import { useFormContext } from "react-hook-form";
import { useState } from "react";
import { Field, inputClass } from "../components/Field";
import {
    CATEGORIAS,
    ESTADOS_MEXICO,
    REGLAS_POR_CATEGORIA,
    ACADEMIAS_CONOCIDAS,
    PAQUETES_BASE,
    PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE,
    PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL,
    PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3,
    calcularPrecioTotal,
    formatearMXN,
    type Categoria,
    type PaqueteBase,
} from "@/config/catalog";
import { calcularEdadDesde, type RegistrationFormValues } from "@/types/registrationForm";

const PAQUETES_CON_WORKSHOPS_INCLUIDOS: PaqueteBase[] = ["BOSS_EXPERIENCE", "BOSS_VIP", "PRO_PACKAGE"];

export function StepCategoria() {
    const {
        register,
        watch,
        setValue,
        formState: { errors },
    } = useFormContext<RegistrationFormValues>();

    const sexo = watch("sexo");
    const fechaNacimiento = watch("fechaNacimiento");
    const academiaCrew = watch("academiaCrew");
    const paqueteBase = watch("paqueteBase");
    const workshopsSeleccionados = watch("workshopsSeleccionados") ?? [];

    const [otraAcademia, setOtraAcademia] = useState(
        () => !!academiaCrew && !(ACADEMIAS_CONOCIDAS as readonly string[]).includes(academiaCrew),
    );

    const edad = fechaNacimiento ? calcularEdadDesde(new Date(fechaNacimiento)) : NaN;

    const categoriaDisponible = (categoria: Categoria) => {
        const regla = REGLAS_POR_CATEGORIA[categoria];
        if (Number.isNaN(edad)) return true;
        if (regla.minEdad !== null && edad < regla.minEdad) return false;
        if (regla.maxEdad !== null && edad > regla.maxEdad) return false;
        if (regla.sexoPermitido !== null && sexo && !regla.sexoPermitido.includes(sexo)) return false;
        return true;
    };

    const permiteWorkshopsAdicionales = paqueteBase && !PAQUETES_CON_WORKSHOPS_INCLUIDOS.includes(paqueteBase);
    const precioTotal = paqueteBase ? calcularPrecioTotal(paqueteBase, workshopsSeleccionados) : 0;

    const toggleWorkshop = (numero: number) => {
        const actual = workshopsSeleccionados ?? [];
        const siguiente = actual.includes(numero) ? actual.filter((n) => n !== numero) : [...actual, numero];
        setValue("workshopsSeleccionados", siguiente, { shouldValidate: true });
    };

    return (
        <>
            <Field label="Categoría" error={errors.categoria?.message}>
                <select {...register("categoria")} className={inputClass} defaultValue="">
                    <option value="" disabled>
                        Selecciona una categoría
                    </option>
                    {Object.entries(CATEGORIAS).map(([value, label]) => (
                        <option key={value} value={value} disabled={!categoriaDisponible(value as Categoria)}>
                            {label}
                            {!categoriaDisponible(value as Categoria) ? " (no disponible)" : ""}
                        </option>
                    ))}
                </select>
            </Field>

            <Field label="Estado" error={errors.estado?.message}>
                <select {...register("estado")} className={inputClass} defaultValue="">
                    <option value="" disabled>
                        Selecciona un estado
                    </option>
                    {ESTADOS_MEXICO.map((estado) => (
                        <option key={estado} value={estado}>
                            {estado}
                        </option>
                    ))}
                </select>
            </Field>

            <Field label="Ciudad" error={errors.ciudad?.message}>
                <input {...register("ciudad")} className={inputClass} />
            </Field>

            <Field label="Academia / Crew (opcional)" error={errors.academiaCrew?.message}>
                <select
                    className={inputClass}
                    value={otraAcademia ? "__otra__" : (academiaCrew ?? "")}
                    onChange={(e) => {
                        const valor = e.target.value;
                        if (valor === "__otra__") {
                            setOtraAcademia(true);
                            setValue("academiaCrew", "", { shouldValidate: false });
                        } else {
                            setOtraAcademia(false);
                            setValue("academiaCrew", valor, { shouldValidate: true });
                        }
                    }}
                >
                    <option value="">Ninguna</option>
                    {ACADEMIAS_CONOCIDAS.map((a) => (
                        <option key={a} value={a}>
                            {a}
                        </option>
                    ))}
                    <option value="__otra__">Otra… (escribir)</option>
                </select>
                {otraAcademia && (
                    <input
                        {...register("academiaCrew")}
                        className={`${inputClass} mt-2`}
                        placeholder="Escribe tu academia o crew"
                        autoFocus
                    />
                )}
            </Field>

            <div className="rounded-lg border border-boss-border bg-boss-black/40 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-boss-gray">
                    Costos y paquetes
                </h3>
                <ul className="space-y-1.5 text-sm text-foreground">
                    {(Object.entries(PAQUETES_BASE) as [PaqueteBase, string][]).map(([key, label]) => (
                        <li key={key} className="flex justify-between gap-3">
                            <span>{label}{key === "SOLO_WORKSHOPS" ? " (desde)" : ""}</span>
                            <span className="text-boss-green">
                                {key === "SOLO_WORKSHOPS"
                                    ? formatearMXN(PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL)
                                    : formatearMXN(PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[key])}
                            </span>
                        </li>
                    ))}
                    <li className="pt-1 text-xs text-boss-gray">
                        Workshop individual {formatearMXN(PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL)} c/u, o los 3 por{" "}
                        {formatearMXN(PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3)}.
                    </li>
                </ul>
            </div>

            <Field label="Paquete" error={errors.paqueteBase?.message}>
                <select {...register("paqueteBase")} className={inputClass} defaultValue="">
                    <option value="" disabled>
                        Selecciona un paquete
                    </option>
                    {(Object.entries(PAQUETES_BASE) as [PaqueteBase, string][]).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </Field>

            {permiteWorkshopsAdicionales && (
                <Field label="Workshops (opcional, 1 a 3)">
                    <div className="flex flex-wrap gap-4">
                        {[1, 2, 3].map((numero) => (
                            <label key={numero} className="flex items-center gap-2 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-boss-red"
                                    checked={workshopsSeleccionados.includes(numero)}
                                    onChange={() => toggleWorkshop(numero)}
                                />
                                Workshop {numero}
                            </label>
                        ))}
                    </div>
                </Field>
            )}

            {paqueteBase && (
                <div className="flex items-center justify-between rounded-md border border-boss-red/40 bg-boss-red/10 px-4 py-3">
                    <span className="text-sm font-semibold uppercase tracking-wide text-white">Costo total</span>
                    <span className="font-display text-lg text-boss-red">{formatearMXN(precioTotal)}</span>
                </div>
            )}
        </>
    );
}
