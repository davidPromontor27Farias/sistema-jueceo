import { useFormContext } from "react-hook-form";
import { useState } from "react";
import Image from "next/image";
import { Field, inputClass } from "../components/Field";
import { subirFotoACloudinary } from "@/lib/cloudinary";
import { calcularEdadDesde, type RegistrationFormValues } from "@/types/registrationForm";

export function StepContacto() {
    const {
        register,
        watch,
        setValue,
        formState: { errors },
    } = useFormContext<RegistrationFormValues>();

    const fechaNacimiento = watch("fechaNacimiento");
    const fotoUrl = watch("fotoUrl");
    const [subiendo, setSubiendo] = useState(false);
    const [errorFoto, setErrorFoto] = useState<string | null>(null);

    const edad = fechaNacimiento ? calcularEdadDesde(new Date(fechaNacimiento)) : NaN;
    const esMenorDeEdad = !Number.isNaN(edad) && edad < 18;

    const onFotoSeleccionada = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;

        setErrorFoto(null);
        setSubiendo(true);
        const resultado = await subirFotoACloudinary(archivo);
        setSubiendo(false);

        if (!resultado.ok) {
            setErrorFoto(resultado.error);
            return;
        }
        setValue("fotoUrl", resultado.url, { shouldValidate: true });
    };

    return (
        <>
            <Field label="Correo" error={errors.correo?.message}>
                <input type="email" {...register("correo")} className={inputClass} />
            </Field>
            <Field label="Teléfono" error={errors.telefono?.message}>
                <input {...register("telefono")} className={inputClass} placeholder="10 dígitos" />
            </Field>
            <Field label="Instagram (opcional)" error={errors.instagram?.message}>
                <input {...register("instagram")} className={inputClass} placeholder="@usuario" />
            </Field>

            {esMenorDeEdad && (
                <Field label="Contacto de emergencia (obligatorio para menores de edad)" error={errors.contactoEmergencia?.message}>
                    <input {...register("contactoEmergencia")} className={inputClass} />
                </Field>
            )}

            <Field
                label="Foto"
                error={errorFoto ?? errors.fotoUrl?.message}
                hint="Rostro visible, sin lentes oscuros, fondo neutro preferentemente. JPG o PNG, mínimo 800x800px, máximo 5MB."
            >
                <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={onFotoSeleccionada}
                    disabled={subiendo}
                    className={`${inputClass} cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-boss-red file:px-3 file:py-1.5 file:text-white`}
                />
                {subiendo && <span className="mt-2 block text-xs text-boss-gray">Subiendo foto...</span>}
                {fotoUrl && !subiendo && (
                    <div className="mt-3 flex items-center gap-3">
                        <Image
                            src={fotoUrl}
                            alt="Foto de perfil"
                            width={64}
                            height={64}
                            unoptimized
                            className="h-16 w-16 rounded-md border border-boss-border object-cover"
                        />
                        <span className="text-xs text-boss-green">Foto subida correctamente</span>
                    </div>
                )}
            </Field>
        </>
    );
}
