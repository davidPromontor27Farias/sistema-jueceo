"use client";

import { z } from "zod";
import { useState } from "react";
import Image from "next/image";
import { FormProvider, useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registrationFormSchema, type RegistrationFormValues } from "@/types/registrationForm";
import { postRegistration, type RegistrationPayload } from "@/lib/api";
import { StepDatosPersonales } from "./steps/StepDatosPersonales";
import { StepCategoria } from "./steps/StepCategoria";
import { StepContacto } from "./steps/StepContacto";
import { StepLegal } from "./steps/StepLegal";
import { StepResumen } from "./steps/StepResumen";

type FieldName = keyof RegistrationFormValues;

// PENDIENTE: confirmar la sede exacta con el cliente.
const SEDE_EVENTO = "Ciudad de México (sede por confirmar)";

const STEPS: { title: string; fields: FieldName[] }[] = [
    { title: "Datos personales", fields: ["nombres", "apellidos", "nombreArtistico", "fechaNacimiento", "sexo", "nacionalidad"] },
    { title: "Categoría y paquete", fields: ["categoria", "estado", "ciudad", "academiaCrew", "paqueteBase", "workshopsSeleccionados"] },
    { title: "Contacto y foto", fields: ["correo", "telefono", "instagram", "contactoEmergencia", "fotoUrl"] },
    { title: "Legal", fields: ["aceptaReglamento", "aceptaAvisoPrivacidad", "aceptaPoliticaCancelacion"] },
    { title: "Resumen", fields: [] },
];

export default function RegistroPage() {
    const methods = useForm<z.input<typeof registrationFormSchema>, unknown, RegistrationFormValues>({
        mode: "onChange",
        resolver: zodResolver(registrationFormSchema),
        defaultValues: { workshopsSeleccionados: [] },
    });
    const {
        handleSubmit,
        trigger,
        formState: { isSubmitting },
    } = methods;

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

        const payload: RegistrationPayload = {
            ...formValues,
            fechaNacimiento: formValues.fechaNacimiento.toISOString().slice(0, 10),
            instagram: formValues.instagram?.trim() ? formValues.instagram.trim() : undefined,
            academiaCrew: formValues.academiaCrew?.trim() ? formValues.academiaCrew.trim() : undefined,
            contactoEmergencia: formValues.contactoEmergencia?.trim() ? formValues.contactoEmergencia.trim() : undefined,
            fotoUrl: formValues.fotoUrl?.trim() ? formValues.fotoUrl.trim() : undefined,
        };

        const resultado = await postRegistration(payload);

        if (!resultado.ok) {
            setServerError(resultado.error);
            return;
        }

        window.location.assign(resultado.data.checkoutUrl);
    };

    // Si el envío falla la validación, el error puede estar en un campo de una
    // sección anterior que ya no está visible. Regresamos a la primera sección
    // (en orden) que contenga un campo con error, para que se pueda corregir.
    const onInvalid = (formErrors: FieldErrors<z.input<typeof registrationFormSchema>>) => {
        const fieldsWithError = Object.keys(formErrors) as FieldName[];
        const stepWithError = STEPS.findIndex((step) =>
            step.fields.some((field) => fieldsWithError.includes(field)),
        );
        if (stepWithError !== -1) {
            setCurrentStep(stepWithError);
        }
    };

    const esUltimoPaso = currentStep === STEPS.length - 1;

    return (
        <main className="min-h-screen bg-boss-black lg:flex">
            <BrandPanel />

            <div className="px-4 py-12 sm:py-16 lg:flex lg:flex-1 lg:items-center lg:justify-center lg:px-12 lg:py-16">
                <div className="mx-auto w-full max-w-2xl">
                    <div className="mb-8 flex flex-col items-center text-center lg:hidden">
                        <Image
                            src="/the-boss-logo.png"
                            alt="THE BOSS — Breaking Battles"
                            width={300}
                            height={200}
                            priority
                            className="drop-shadow-[0_0_25px_rgba(226,9,26,0.25)]"
                        />
                        <span className="mt-4 text-2xl inline-block rounded bg-boss-red px-3 py-1 font-bold uppercase tracking-widest text-white">
                            1ª Edición · 31 Oct &amp; 1 Nov
                        </span>
                        <span className="mt-2 text-xs uppercase tracking-widest text-boss-gray">{SEDE_EVENTO}</span>
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

                        <FormProvider {...methods}>
                            <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
                                <div className={isLeaving ? "animate-section-out" : "animate-section-in"}>
                                    <h2 className="mb-5 flex items-center gap-2 font-display text-lg uppercase tracking-wide text-white">
                                        <span className="h-4 w-1 bg-boss-red" />
                                        {STEPS[currentStep].title}
                                    </h2>

                                    <div className="space-y-5">
                                        {currentStep === 0 && <StepDatosPersonales />}
                                        {currentStep === 1 && <StepCategoria />}
                                        {currentStep === 2 && <StepContacto />}
                                        {currentStep === 3 && <StepLegal />}
                                        {currentStep === 4 && <StepResumen />}
                                    </div>

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
                                        {esUltimoPaso ? (
                                            <button
                                                type="submit"
                                                disabled={isSubmitting}
                                                className="w-full rounded-md bg-boss-red px-4 py-3.5 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {isSubmitting ? "Procesando..." : "Confirmar y Pagar"}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={goNext}
                                                className="w-full rounded-md bg-boss-red px-4 py-3.5 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark"
                                            >
                                                Siguiente
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </form>
                        </FormProvider>
                    </div>
                </div>
            </div>
        </main>
    );
}

const RAZONES_PARA_INSCRIBIRTE = [
    "Competencia oficial en 9 categorías, incluyendo la nueva Especial: Open Style 1 vs 1",
    "Workshops para perfeccionar tu técnica",
    "Acceso al evento con QR personal e intransferible",
    "Paquetes para competidores, público y experiencia VIP",
];

function BrandPanel() {
    return (
        <aside className="relative hidden border-r border-boss-border bg-boss-black lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[44%] lg:flex-col lg:justify-center lg:overflow-hidden lg:px-10 lg:py-8 xl:px-14">
            <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-boss-red/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-boss-green/10 blur-3xl" />

            <div className="relative">
                <Image
                    src="/the-boss-logo.png"
                    alt="THE BOSS — Breaking Battles"
                    width={120}
                    height={100}
                    priority
                    className="drop-shadow-[0_0_30px_rgba(226,9,26,0.3)]"
                />

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <span className="inline-block rounded bg-boss-red px-2.5 py-1 text-3xl font-bold uppercase tracking-widest text-white">
                        1ª Edición · 31 Oct &amp; 1 Nov
                    </span>
                    <span className="text-xl font-bold uppercase tracking-widest text-boss-gray">{SEDE_EVENTO}</span>
                </div>

                <h1 className="mt-5 font-display text-2xl uppercase leading-[1.05] tracking-wide text-white xl:text-3xl">
                    Sé parte de <span className="text-boss-red">la historia</span> del breaking en México
                </h1>

                <p className="mt-3 max-w-md text-sm text-boss-gray text-xl">
                    Más transparencia. Más respeto. <span className="text-boss-green">Más breaking.</span> Regístrate
                    y compite en la primera edición de THE BOSS.
                </p>

                <ul className="mt-4 space-y-1.5">
                    {RAZONES_PARA_INSCRIBIRTE.map((razon) => (
                        <li key={razon} className="flex items-start gap-2.5 text-middle] text-foreground">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-boss-red/20 text-[10px] text-boss-red">
                                ✓
                            </span>
                            {razon}
                        </li>
                    ))}
                </ul>

                <p className="mt-5 font-display text-base uppercase tracking-wide text-white">
                    Tu lugar en la historia empieza <span className="text-boss-red">aquí</span> →
                </p>
            </div>
        </aside>
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
        <div className="mb-8 flex flex-wrap items-center justify-center gap-y-2">
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
                            aria-current={isActive ? "step" : undefined}
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
