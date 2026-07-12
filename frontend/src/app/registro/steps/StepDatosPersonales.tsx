import { useFormContext } from "react-hook-form";
import { useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { Field, inputClass } from "../components/Field";
import { NACIONALIDADES } from "@/config/catalog";
import type { RegistrationFormValues } from "@/types/registrationForm";

const TECLAS_PERMITIDAS = ["Tab", "Shift", "Escape", "Enter"];

function bloquearEscritura(e: KeyboardEvent<HTMLInputElement>) {
    if (!TECLAS_PERMITIDAS.includes(e.key)) e.preventDefault();
}

function bloquearPegado(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
}

export function StepDatosPersonales() {
    const {
        register,
        watch,
        setValue,
        formState: { errors },
    } = useFormContext<RegistrationFormValues>();

    const nacionalidad = watch("nacionalidad");
    const [otraNacionalidad, setOtraNacionalidad] = useState(
        () => nacionalidad !== undefined && nacionalidad !== "" && !(NACIONALIDADES as readonly string[]).includes(nacionalidad),
    );

    return (
        <>
            <Field label="Nombre(s)" error={errors.nombres?.message}>
                <input {...register("nombres")} className={inputClass} />
            </Field>
            <Field label="Apellidos" error={errors.apellidos?.message}>
                <input {...register("apellidos")} className={inputClass} />
            </Field>
            <Field label="Bboy / Bgirl Name" error={errors.nombreArtistico?.message}>
                <input {...register("nombreArtistico")} className={inputClass} maxLength={50} />
            </Field>
            <Field
                label="Fecha de nacimiento"
                error={errors.fechaNacimiento?.message}
                hint="Selecciona la fecha con el calendario; no se puede escribir."
            >
                <input
                    type="date"
                    {...register("fechaNacimiento")}
                    onKeyDown={bloquearEscritura}
                    onPaste={bloquearPegado}
                    className={`${inputClass} [color-scheme:dark]`}
                />
            </Field>
            <Field label="Sexo" error={errors.sexo?.message}>
                <select {...register("sexo")} className={inputClass} defaultValue="">
                    <option value="">
                        Selecciona una opción
                    </option>
                    <option value="MASCULINO">Masculino</option>
                    <option value="FEMENINO">Femenino</option>
                </select>
            </Field>
            <Field label="Nacionalidad" error={errors.nacionalidad?.message}>
                {/* nacionalidad se controla vía setValue (select + input "otra"); este input
                    oculto registra el campo en react-hook-form para que trigger()/validación lo detecte. */}
                <input type="hidden" {...register("nacionalidad")} />
                <select
                    className={inputClass}
                    value={otraNacionalidad ? "Otra" : (nacionalidad ?? "")}
                    onChange={(e) => {
                        const valor = e.target.value;
                        if (valor === "Otra") {
                            setOtraNacionalidad(true);
                            setValue("nacionalidad", "", { shouldValidate: false });
                        } else {
                            setOtraNacionalidad(false);
                            setValue("nacionalidad", valor, { shouldValidate: true });
                        }
                    }}
                >
                    <option value="">
                        Selecciona una opción
                    </option>
                    {NACIONALIDADES.map((n) => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
                {otraNacionalidad && (
                    <input
                        value={nacionalidad ?? ""}
                        onChange={(e) => setValue("nacionalidad", e.target.value, { shouldValidate: true })}
                        className={`${inputClass} mt-2`}
                        placeholder="Escribe tu nacionalidad"
                        autoFocus
                    />
                )}
            </Field>
        </>
    );
}
