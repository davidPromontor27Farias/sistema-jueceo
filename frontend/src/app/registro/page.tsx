"use client";

import { z } from "zod";
import { useState } from "react";
import Image from "next/image";
import { FormProvider, useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registrationFormSchema, type RegistrationFormValues } from "@/types/registrationForm";
import { postRegistration, type RegistrationPayload } from "@/lib/api";
import { preventaVigentePorFecha } from "@/config/catalog";
import { StepDatosPersonales } from "./steps/StepDatosPersonales";
import { StepCategoria } from "./steps/StepCategoria";
import { StepContacto } from "./steps/StepContacto";
import { StepLegal } from "./steps/StepLegal";
import { StepResumen } from "./steps/StepResumen";

type FieldName = keyof RegistrationFormValues;

// PENDIENTE: confirmar la sede exacta con el cliente.
const SEDE_EVENTO = "Ciudad de México (sede por confirmar)";

const STEPS: { title: string; fields: FieldName[] }[] = [
    {
        title: "Datos personales",
        fields: ["tipoParticipacion", "nombres", "apellidos", "nombreArtistico", "fechaNacimiento", "sexo", "nacionalidad"],
    },
    {
        title: "Categoría",
        fields: ["categoria", "estado", "ciudad", "academiaCrew", "paqueteBase", "workshopsSeleccionados", "agregarOpenStyle"],
    },
    { title: "Contacto y foto", fields: ["correo", "telefono", "instagram", "contactoEmergencia", "fotoUrl"] },
    { title: "Legal", fields: ["aceptaReglamento", "aceptaAvisoPrivacidad", "aceptaPoliticaCancelacion"] },
    { title: "Resumen", fields: [] },
];

export default function RegistroPage() {
    const methods = useForm<z.input<typeof registrationFormSchema>, unknown, RegistrationFormValues>({
        mode: "onChange",
        resolver: zodResolver(registrationFormSchema),
        defaultValues: { workshopsSeleccionados: [], agregarOpenStyle: false },
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
            {currentStep === 0 && <BrandPanel />}

            <div className="px-4 py-12 sm:py-16 lg:flex lg:flex-1 lg:items-center lg:justify-center lg:px-12 lg:py-16">
                <div className="mx-auto w-full max-w-2xl">
                    {currentStep === 0 && (
                        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
                            <HeroBody />
                        </div>
                    )}

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

                                    <div className="space-y-5 text-start">
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
    "9 categorías oficiales",
    "Jueceo y resultados digitales.",
    "Workshops con invitados internacionales.",
];

// Bloque de marca (logo, mensaje de bienvenida y preventa). Se muestra una sola
// vez, solo en el primer paso del registro, tanto en el panel lateral de
// escritorio (BrandPanel) como arriba del formulario en móvil.
function HeroBody() {
    const preventaActiva = preventaVigentePorFecha();

    return (
        <>
            <Image
                src="/the-boss-logo.png"
                alt="THE BOSS — Breaking Battles"
                width={220}
                height={180}
                priority
                className="mx-auto drop-shadow-[0_0_30px_rgba(226,9,26,0.3)] lg:mx-0"
            />


            <h1 className="mt-4 font-display text-2xl uppercase leading-[1.05] tracking-wide text-white sm:text-3xl">
                ¡Sé parte del evento que <span className="text-boss-red">revolucionará el Breaking en México</span>!
            </h1>

            <ul className="mt-4 space-y-1.5 text-left">
                {RAZONES_PARA_INSCRIBIRTE.map((razon) => (
                    <li key={razon} className="flex items-start gap-2.5 text-foreground">
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

            {preventaActiva && (
                <div className="mt-6 rounded-md border border-boss-green/40 bg-boss-green/10 px-4 py-3 text-left">
                    <p className="font-display text-sm uppercase tracking-widest text-boss-green">
                        Preventa Fundadores · 20% OFF
                    </p>
                    <p className="mt-1 text-xs text-boss-gray">
                        El descuento aplica automáticamente al seleccionar tu paquete. Únicamente a los primeros 50
                        lugares. Solo durante julio o hasta agotar existencias. Aplica solo a The Boss Entry y
                        Workshops.
                    </p>
                </div>
            )}
        </>
    );
}

function BrandPanel() {
    return (
        <aside className="relative hidden border-r border-boss-border bg-boss-black lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[44%] lg:flex-col lg:justify-center lg:overflow-hidden lg:px-10 lg:py-8 xl:px-14">
            <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-boss-red/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-boss-green/10 blur-3xl" />

            <div className="relative">
                <HeroBody />
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
