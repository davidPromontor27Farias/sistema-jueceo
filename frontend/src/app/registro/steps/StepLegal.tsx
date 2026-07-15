import { useFormContext } from "react-hook-form";
import { Checkbox } from "../components/Checkbox";
import type { RegistrationFormValues } from "@/types/registrationForm";

export function StepLegal() {
    const {
        register,
        watch,
        formState: { errors },
    } = useFormContext<RegistrationFormValues>();

    const esPublico = watch("tipoParticipacion") === "PUBLICO";

    return (
        <>
            {!esPublico && (
                <Checkbox
                    label={
                        <>
                            Acepto el{" "}
                            <a href="/reglamento" target="_blank" rel="noopener noreferrer" className="text-boss-green underline">
                                Reglamento Oficial
                            </a>
                        </>
                    }
                    error={errors.aceptaReglamento?.message}
                    {...register("aceptaReglamento")}
                />
            )}
            <Checkbox
                label={
                    <>
                        Acepto el{" "}
                        <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-boss-green underline">
                            Aviso de Privacidad
                        </a>
                    </>
                }
                error={errors.aceptaAvisoPrivacidad?.message}
                {...register("aceptaAvisoPrivacidad")}
            />
            <Checkbox
                label={
                    <>
                        Acepto la{" "}
                        <a
                            href="/politica-cancelacion"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-boss-green underline"
                        >
                            Política de Cancelación
                        </a>
                    </>
                }
                error={errors.aceptaPoliticaCancelacion?.message}
                {...register("aceptaPoliticaCancelacion")}
            />
        </>
    );
}
