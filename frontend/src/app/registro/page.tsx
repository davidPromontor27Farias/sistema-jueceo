"use client";

import { z } from "zod";
import { useState } from "react";
import type { ReactNode, InputHTMLAttributes } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registrationFormSchema, type RegistrationFormValues } from "@/types/registrationForm";
import { CATEGORIAS, ESTADOS_MEXICO } from "@/config/catalog";

type FieldName = keyof RegistrationFormValues;

const inputClass =
    "w-full rounded-md border border-boss-border bg-boss-panel px-3 py-2.5 text-foreground placeholder:text-boss-gray focus:border-boss-red focus:outline-none focus:ring-2 focus:ring-boss-red/40 transition-colors";

const STEPS: { title: string; fields: FieldName[] }[] = [
    { title: "Datos personales", fields: ["nombres", "apellidos", "nombreArtistico", "fechaNacimiento", "sexo"] },
    { title: "Categoría y procedencia", fields: ["categoria", "estado", "ciudad"] },
    {
        title: "Contacto y detalles",
        fields: ["correo", "telefono", "instagram", "academia", "crew", "contactoEmergencia"],
    },
    { title: "Legal y confirmación", fields: ["aceptaReglamento", "aceptaAvisoPrivacidad", "aceptaUsoImagen"] },
];

export default function RegistroPage() {
    const {
        register,
        handleSubmit,
        trigger,
        formState: { errors, isSubmitting },
    } = useForm<z.input<typeof registrationFormSchema>, unknown, RegistrationFormValues>({
        mode: "onChange",
        resolver: zodResolver(registrationFormSchema),
    });

    const [currentStep, setCurrentStep] = useState(0);
    const [isLeaving, setIsLeaving] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    const goToStep = (step: number) => {
        setIsLeaving(true);
        setTimeout(() => {
            setCurrentStep(step);
            setIsLeaving(false);
        }, 320);
    };

    const goNext = async () => {
        const isStepValid = await trigger(STEPS[currentStep].fields);
        if (!isStepValid) return;
        goToStep(Math.min(currentStep + 1, STEPS.length - 1));
    };

    const goBack = () => {
        goToStep(Math.max(currentStep - 1, 0));
    };

    const onSubmit = async (formValues: RegistrationFormValues) => {
        setServerError(null);

        const payload = {
            ...formValues,
            fechaNacimiento: formValues.fechaNacimiento.toISOString().slice(0, 10),
            instagram: formValues.instagram?.trim() ? formValues.instagram.trim() : undefined,
            academia: formValues.academia?.trim() ? formValues.academia.trim() : undefined,
            crew: formValues.crew?.trim() ? formValues.crew.trim() : undefined,
            contactoEmergencia: formValues.contactoEmergencia?.trim()
                ? formValues.contactoEmergencia.trim()
                : undefined,
        };

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/registrations`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                setServerError(data.error ?? "No se pudo completar el registro, revisa tus datos.");
                return;
            }

            window.location.href = data.checkoutUrl;
        } catch {
            setServerError("No se pudo conectar con el servidor. Intenta de nuevo.");
        }
    };

    // Si el envío falla la validación, el error puede estar en un campo de una
    // sección anterior que ya no está visible. Regresamos a la primera sección
    // (en orden) que contenga un campo con error, para que se pueda corregir.
    const onInvalid = (formErrors: typeof errors) => {
        const fieldsWithError = Object.keys(formErrors) as FieldName[];
        const stepWithError = STEPS.findIndex((step) =>
            step.fields.some((field) => fieldsWithError.includes(field)),
        );
        if (stepWithError !== -1) {
            setCurrentStep(stepWithError);
        }
    };

    return (
        <main className="min-h-screen bg-boss-black px-4 py-12 sm:py-16">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 flex flex-col items-center text-center">
                    <Image
                        src="/the-boss-logo.png"
                        alt="THE BOSS — Breaking Battles"
                        width={200}
                        height={166}
                        priority
                        className="drop-shadow-[0_0_25px_rgba(226,9,26,0.25)]"
                    />
                    <span className="mt-4 inline-block rounded bg-boss-red px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
                        1ª Edición · 31 Oct &amp; 1 Nov
                    </span>
                    <h1 className="mt-5 font-display text-3xl uppercase tracking-wide text-white sm:text-4xl">
                        Registro de <span className="text-boss-red">Competidores</span>
                    </h1>
                    <p className="mt-2 text-sm text-boss-gray">
                        Más transparencia. Más respeto.{" "}
                        <span className="text-boss-green">Más breaking.</span>
                    </p>
                </div>

                <StepTracker total={STEPS.length} current={currentStep} onSelect={goToStep} />

                <div className="min-h-[420px] rounded-xl border border-boss-border bg-boss-panel/60 p-6 shadow-2xl shadow-black/60 sm:p-8">
                    {serverError && (
                        <p className="mb-6 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300">
                            {serverError}
                        </p>
                    )}

                    <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
                        <div className={isLeaving ? "animate-section-out" : "animate-section-in"}>
                            <h2 className="mb-5 flex items-center gap-2 font-display text-lg uppercase tracking-wide text-white">
                                <span className="h-4 w-1 bg-boss-red" />
                                {STEPS[currentStep].title}
                            </h2>

                            <div className="space-y-5">
                                {currentStep === 0 && (
                                    <>
                                        <Field label="Nombre(s)" error={errors.nombres?.message}>
                                            <input {...register("nombres")} className={inputClass} />
                                        </Field>
                                        <Field label="Apellidos" error={errors.apellidos?.message}>
                                            <input {...register("apellidos")} className={inputClass} />
                                        </Field>
                                        <Field label="Nombre artístico" error={errors.nombreArtistico?.message}>
                                            <input
                                                {...register("nombreArtistico")}
                                                className={inputClass}
                                                maxLength={50}
                                            />
                                        </Field>
                                        <Field label="Fecha de nacimiento" error={errors.fechaNacimiento?.message}>
                                            <input
                                                type="date"
                                                {...register("fechaNacimiento")}
                                                className={`${inputClass} [color-scheme:dark]`}
                                            />
                                        </Field>
                                        <Field label="Sexo" error={errors.sexo?.message}>
                                            <select {...register("sexo")} className={inputClass} defaultValue="">
                                                <option value="" disabled>
                                                    Selecciona una opción
                                                </option>
                                                <option value="MASCULINO">Masculino</option>
                                                <option value="FEMENINO">Femenino</option>
                                            </select>
                                        </Field>
                                    </>
                                )}

                                {currentStep === 1 && (
                                    <>
                                        <Field label="Categoría" error={errors.categoria?.message}>
                                            <select {...register("categoria")} className={inputClass} defaultValue="">
                                                <option value="" disabled>
                                                    Selecciona una categoría
                                                </option>
                                                {Object.entries(CATEGORIAS).map(([value, label]) => (
                                                    <option key={value} value={value}>
                                                        {label}
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
                                    </>
                                )}

                                {currentStep === 2 && (
                                    <>
                                        <Field label="Correo" error={errors.correo?.message}>
                                            <input type="email" {...register("correo")} className={inputClass} />
                                        </Field>
                                        <Field label="Teléfono" error={errors.telefono?.message}>
                                            <input
                                                {...register("telefono")}
                                                className={inputClass}
                                                placeholder="10 dígitos"
                                            />
                                        </Field>
                                        <Field label="Instagram (opcional)" error={errors.instagram?.message}>
                                            <input
                                                {...register("instagram")}
                                                className={inputClass}
                                                placeholder="@usuario"
                                            />
                                        </Field>
                                        <Field label="Academia (opcional)" error={errors.academia?.message}>
                                            <input {...register("academia")} className={inputClass} />
                                        </Field>
                                        <Field label="Crew (opcional)" error={errors.crew?.message}>
                                            <input {...register("crew")} className={inputClass} />
                                        </Field>
                                        <Field
                                            label="Contacto de emergencia (obligatorio para menores de edad)"
                                            error={errors.contactoEmergencia?.message}
                                        >
                                            <input {...register("contactoEmergencia")} className={inputClass} />
                                        </Field>
                                    </>
                                )}

                                {currentStep === 3 && (
                                    <>
                                        <Checkbox
                                            label="Acepto el reglamento"
                                            error={errors.aceptaReglamento?.message}
                                            {...register("aceptaReglamento")}
                                        />
                                        <Checkbox
                                            label="Acepto el aviso de privacidad"
                                            error={errors.aceptaAvisoPrivacidad?.message}
                                            {...register("aceptaAvisoPrivacidad")}
                                        />
                                        <Checkbox
                                            label="Acepto el uso de mi imagen"
                                            error={errors.aceptaUsoImagen?.message}
                                            {...register("aceptaUsoImagen")}
                                        />

                                        <div className="mt-6 flex gap-3">
                                            <button
                                                type="button"
                                                onClick={goBack}
                                                className="w-full rounded-md border border-boss-border px-4 py-3.5 font-display text-lg uppercase tracking-wider text-foreground transition-colors hover:border-boss-red"
                                            >
                                                Atrás
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isSubmitting}
                                                className="w-full rounded-md bg-boss-red px-4 py-3.5 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {isSubmitting ? "Procesando..." : "Registrarme y Pagar"}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {currentStep < STEPS.length - 1 && (
                                <div className="mt-6 flex gap-3">
                                    {currentStep > 0 && (
                                        <button
                                            type="button"
                                            onClick={goBack}
                                            className="w-full rounded-md border border-boss-border px-4 py-3.5 font-display text-lg uppercase tracking-wider text-foreground transition-colors hover:border-boss-red"
                                        >
                                            Atrás
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={goNext}
                                        className="w-full rounded-md bg-boss-red px-4 py-3.5 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark"
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}

function StepTracker({
    total,
    current,
    onSelect,
}: {
    total: number;
    current: number;
    onSelect: (step: number) => void;
}) {
    return (
        <div className="mb-8 flex items-center justify-center">
            {Array.from({ length: total }).map((_, i) => {
                const isDone = i < current;
                const isActive = i === current;
                const isReachable = i <= current;
                return (
                    <div key={i} className="flex items-center">
                        <button
                            type="button"
                            disabled={!isReachable}
                            onClick={() => onSelect(i)}
                            aria-label={`Ir a la sección ${i + 1}`}
                            className={[
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-sm transition-colors",
                                isReachable ? "cursor-pointer" : "cursor-not-allowed",
                                isDone
                                    ? "border-boss-red bg-boss-red text-white hover:bg-boss-red-dark"
                                    : isActive
                                        ? "border-boss-red text-boss-red shadow-[0_0_12px_rgba(226,9,26,0.6)]"
                                        : "border-boss-border text-boss-gray",
                            ].join(" ")}
                        >
                            {i + 1}
                        </button>
                        {i < total - 1 && (
                            <div
                                className={`h-[2px] w-6 transition-colors sm:w-10 ${
                                    isDone ? "bg-boss-red" : "bg-boss-border"
                                }`}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-boss-gray">
                <span className="h-3 w-[3px] shrink-0 bg-boss-red" />
                {label}
            </span>
            {children}
            {error && <span className="mt-1 block text-xs font-medium text-red-400">{error}</span>}
        </label>
    );
}

function Checkbox({
    label,
    error,
    ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
    return (
        <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-boss-red" {...props} />
            <span className="text-sm text-foreground">
                {label}
                {error && <span className="mt-1 block text-xs font-medium text-red-400">{error}</span>}
            </span>
        </label>
    );
}
