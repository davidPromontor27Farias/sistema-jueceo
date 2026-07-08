"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type EstadoConsulta =
    | { fase: "cargando" }
    | { fase: "esperando" }
    | { fase: "error"; mensaje: string }
    | { fase: "listo"; nombreArtistico: string; tipoBoleto: string; qrDataUrl: string };

type RespuestaApi = {
    estatusPago?: "PENDIENTE" | "PAGADO" | "FALLIDO" | "REEMBOLSADO";
    nombreArtistico?: string;
    tipoBoleto?: string;
    qrDataUrl?: string;
    error?: string;
};

const INTERVALO_MS = 2500;
const MAX_INTENTOS = 20;

export default function QrStatus() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const [estado, setEstado] = useState<EstadoConsulta>({ fase: "cargando" });
    const intentos = useRef(0);

    useEffect(() => {
        if (!sessionId) {
            setEstado({ fase: "error", mensaje: "Falta la referencia de pago en la URL." });
            return;
        }

        let cancelado = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const consultar = async () => {
            try {
                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/registrations/by-session/${sessionId}`,
                );
                const data: RespuestaApi = await response.json();

                if (cancelado) return;

                if (!response.ok) {
                    setEstado({ fase: "error", mensaje: data.error ?? "No se encontró tu registro." });
                    return;
                }

                if (data.estatusPago === "PAGADO" && data.qrDataUrl) {
                    setEstado({
                        fase: "listo",
                        nombreArtistico: data.nombreArtistico ?? "",
                        tipoBoleto: data.tipoBoleto ?? "",
                        qrDataUrl: data.qrDataUrl,
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
            } catch {
                if (!cancelado) {
                    setEstado({ fase: "error", mensaje: "No se pudo conectar con el servidor." });
                }
            }
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

    return (
        <div className="mt-6 flex flex-col items-center">
            <p className="max-w-md text-boss-gray">
                Este código QR es tu acceso <span className="text-boss-green">único</span> al evento. Preséntalo
                en la entrada; solo puede usarse una vez.
            </p>
            <div className="mt-6 rounded-xl border border-boss-border bg-white p-4">
                <Image
                    src={estado.qrDataUrl}
                    alt={`Código QR de acceso de ${estado.nombreArtistico}`}
                    width={260}
                    height={260}
                    unoptimized
                />
            </div>
            <p className="mt-4 font-display text-lg uppercase tracking-wide text-white">
                {estado.nombreArtistico}
            </p>
            <p className="text-sm uppercase tracking-widest text-boss-gray">{estado.tipoBoleto}</p>
            <a
                href={estado.qrDataUrl}
                download={`qr-acceso-${estado.nombreArtistico}.png`}
                className="mt-6 rounded-md border border-boss-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-green hover:text-boss-green"
            >
                Descargar QR
            </a>
        </div>
    );
}
