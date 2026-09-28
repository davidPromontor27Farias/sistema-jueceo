"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getRegistrationBySession } from "@/lib/api";
import { PaseConfirmado, type PaseConfirmadoDatos } from "./PaseConfirmado";

type EstadoConsulta =
    | { fase: "cargando" }
    | { fase: "esperando" }
    | { fase: "error"; mensaje: string }
    | ({ fase: "listo" } & PaseConfirmadoDatos);

const INTERVALO_MS = 2500;
const MAX_INTENTOS = 20;

export default function QrStatus() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const [estado, setEstado] = useState<EstadoConsulta>(
        sessionId ? { fase: "cargando" } : { fase: "error", mensaje: "Falta la referencia de pago en la URL." },
    );
    const intentos = useRef(0);

    useEffect(() => {
        if (!sessionId) return;

        let cancelado = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const consultar = async () => {
            const resultado = await getRegistrationBySession(sessionId);
            if (cancelado) return;

            if (!resultado.ok) {
                setEstado({ fase: "error", mensaje: resultado.error });
                return;
            }

            const data = resultado.data;

            if (data.estatusPago === "PAGADO" && data.qrDataUrl) {
                setEstado({
                    fase: "listo",
                    nombreArtistico: data.nombreArtistico ?? "",
                    nombreCompleto: [data.nombres, data.apellidos].filter(Boolean).join(" "),
                    categoriaLabel: data.categoriaLabel ?? data.tipoBoleto ?? "",
                    tipoBoleto: data.tipoBoleto ?? "",
                    competidorId: data.competidorId ?? null,
                    qrDataUrl: data.qrDataUrl,
                    fotoUrl: data.fotoUrl ?? null,
                });
                return;
            }

            if (data.estatusPago === "FALLIDO" || data.estatusPago === "REEMBOLSADO") {
                setEstado({ fase: "error", mensaje: "El pago no se completó correctamente." });
                return;
            }

            intentos.current += 1;
            if (intentos.current >= MAX_INTENTOS) {
                setEstado({
                    fase: "error",
                    mensaje: "Tu pago sigue en proceso. Revisa tu correo en unos minutos para recibir tu QR.",
                });
                return;
            }

            setEstado({ fase: "esperando" });
            timeoutId = setTimeout(consultar, INTERVALO_MS);
        };

        consultar();

        return () => {
            cancelado = true;
            clearTimeout(timeoutId);
        };
    }, [sessionId]);

    if (estado.fase === "cargando" || estado.fase === "esperando") {
        return (
            <p className="mt-3 max-w-md text-boss-gray">
                Confirmando tu pago con Stripe, esto puede tardar unos segundos...
            </p>
        );
    }

    if (estado.fase === "error") {
        return <p className="mt-3 max-w-md text-boss-red">{estado.mensaje}</p>;
    }

    const { fase: _fase, ...datos } = estado;
    return <PaseConfirmado {...datos} />;
}
