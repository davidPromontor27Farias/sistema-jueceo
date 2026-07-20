import { useFormContext } from "react-hook-form";
import { useState } from "react";
import { Field, inputClass } from "../components/Field";
import {
    CATEGORIAS,
    CATEGORIAS_COMENTARIO,
    ESTADOS_MEXICO,
    REGLAS_POR_CATEGORIA,
    ACADEMIAS_CONOCIDAS,
    PAQUETES_BASE,
    PAQUETES_BASE_DESCRIPCION,
    PAQUETES_COMPETIDOR,
    PAQUETES_PUBLICO,
    PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE,
    PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE_PREVENTA,
    PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL,
    PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3,
    PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3_PREVENTA,
    PRECIO_MXN_CENTAVOS_OPEN_STYLE_ADDON,
    PAQUETES_CON_PREVENTA,
    preventaVigentePorFecha,
    calcularPrecioTotal,
    formatearMXN,
    type Categoria,
    type PaqueteBase,
} from "@/config/catalog";
import { calcularEdadDesde, type RegistrationFormValues } from "@/types/registrationForm";

const PAQUETES_CON_WORKSHOPS_INCLUIDOS: PaqueteBase[] = ["BOSS_EXPERIENCE", "BOSS_VIP"];

export function StepCategoria() {
    const {
        register,
        watch,
        setValue,
        formState: { errors },
    } = useFormContext<RegistrationFormValues>();

    const tipoParticipacion = watch("tipoParticipacion");
    const sexo = watch("sexo");
    const fechaNacimiento = watch("fechaNacimiento");
    const categoria = watch("categoria");
    const academiaCrew = watch("academiaCrew");
    const paqueteBase = watch("paqueteBase");
    const workshopsSeleccionados = watch("workshopsSeleccionados") ?? [];
    const agregarOpenStyle = watch("agregarOpenStyle") ?? false;

    const esPublico = tipoParticipacion === "PUBLICO";
    const preventaActiva = preventaVigentePorFecha();

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

    const categoriasCompetidor = (Object.entries(CATEGORIAS) as [Categoria, string][]).filter(
        ([value]) => value !== "PUBLICO_GENERAL",
    );

    const paquetesDisponibles = (Object.entries(PAQUETES_BASE) as [PaqueteBase, string][]).filter(([value]) =>
        (esPublico ? PAQUETES_PUBLICO : PAQUETES_COMPETIDOR).includes(value),
    );

    const permiteWorkshopsAdicionales =
        !esPublico && !!paqueteBase && !PAQUETES_CON_WORKSHOPS_INCLUIDOS.includes(paqueteBase);
    const mostrarPreguntaOpenStyle = !esPublico && !!categoria && categoria !== "OPEN_STYLE_1V1";

    const precioTotal = paqueteBase
        ? calcularPrecioTotal(paqueteBase, workshopsSeleccionados, { agregarOpenStyle, preventaActiva })
        : 0;

    const toggleWorkshop = (numero: number) => {
        const actual = workshopsSeleccionados ?? [];
        const siguiente = actual.includes(numero) ? actual.filter((n) => n !== numero) : [...actual, numero];
        setValue("workshopsSeleccionados", siguiente, { shouldValidate: true });
    };

    const precioPaquete = (key: PaqueteBase) => {
        if (key === "SOLO_WORKSHOPS") return PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL;
        if (preventaActiva && PAQUETES_CON_PREVENTA.includes(key)) {
            return PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE_PREVENTA[key] ?? PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[key];
        }
        return PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[key];
    };

    return (
        <>
            {!esPublico && (
                <Field label="Selecciona tu categoría" error={errors.categoria?.message}>
                    <select
                        {...register("categoria", {
                            onChange: (e) => {
                                if (e.target.value === "OPEN_STYLE_1V1") {
                                    setValue("agregarOpenStyle", false, { shouldValidate: false });
                                }
                            },
                        })}
                        className={inputClass}
                        defaultValue=""
                    >
                        <option value="">Selecciona una categoría</option>
                        {categoriasCompetidor.map(([value, label]) => (
                            <option key={value} value={value} disabled={!categoriaDisponible(value)}>
                                {label}
                                {CATEGORIAS_COMENTARIO[value] ? ` (${CATEGORIAS_COMENTARIO[value]})` : ""}
                                {!categoriaDisponible(value) ? " (no disponible)" : ""}
                            </option>
                        ))}
                    </select>
                </Field>
            )}

            {mostrarPreguntaOpenStyle && (
                <Field label="¿Quieres competir en Open Style 1 vs 1?">
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                            <input
                                type="radio"
                                name="agregarOpenStyle"
                                className="h-4 w-4 accent-boss-red"
                                checked={agregarOpenStyle === true}
                                onChange={() => setValue("agregarOpenStyle", true, { shouldValidate: true })}
                            />
                            Sí — Agregar {formatearMXN(PRECIO_MXN_CENTAVOS_OPEN_STYLE_ADDON)}
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground">
                            <input
                                type="radio"
                                name="agregarOpenStyle"
                                className="h-4 w-4 accent-boss-red"
                                checked={agregarOpenStyle === false}
                                onChange={() => setValue("agregarOpenStyle", false, { shouldValidate: true })}
                            />
                            No
                        </label>
                    </div>
                </Field>
            )}

            <Field label="Estado" error={errors.estado?.message}>
                <select {...register("estado")} className={inputClass} defaultValue="">
                    <option value="">
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

            {!esPublico && (
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
            )}

            <div className="rounded-lg border border-boss-border bg-boss-black/40 p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-boss-gray">
                    Costos
                </h3>
                <ul className="space-y-3 text-sm text-foreground">
                    {paquetesDisponibles.map(([key, label]) => {
                        const conDescuento = preventaActiva && PAQUETES_CON_PREVENTA.includes(key);
                        return (
                            <li key={key}>
                                <div className="flex justify-between gap-3">
                                    <span>{label}{key === "SOLO_WORKSHOPS" ? " (desde)" : ""}</span>
                                    <span className="flex items-center gap-2">
                                        {conDescuento && (
                                            <span className="text-xs text-boss-gray line-through">
                                                {formatearMXN(PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[key])}
                                            </span>
                                        )}
                                        <span className="text-boss-green">{formatearMXN(precioPaquete(key))}</span>
                                    </span>
                                </div>
                                <p className="text-xs text-boss-gray">{PAQUETES_BASE_DESCRIPCION[key]}</p>
                            </li>
                        );
                    })}
                    {!esPublico && (
                        <li className="pt-1 text-xs text-boss-gray">
                            Workshop individual {formatearMXN(PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL)} c/u, o los 3
                            por{" "}
                            {preventaActiva ? (
                                <>
                                    <span className="line-through">
                                        {formatearMXN(PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3)}
                                    </span>{" "}
                                    <span className="text-boss-green">
                                        {formatearMXN(PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3_PREVENTA)}
                                    </span>
                                </>
                            ) : (
                                formatearMXN(PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3)
                            )}
                            .
                        </li>
                    )}
                </ul>
            </div>

            <Field label="Paquete" error={errors.paqueteBase?.message}>
                <select {...register("paqueteBase")} className={inputClass} defaultValue="">
                    <option value="">
                        Selecciona un paquete
                    </option>
                    {paquetesDisponibles.map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
                {paqueteBase && <p className="mt-1.5 text-xs text-boss-gray">{PAQUETES_BASE_DESCRIPCION[paqueteBase]}</p>}
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
