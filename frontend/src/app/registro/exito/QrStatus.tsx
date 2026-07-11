"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getRegistrationBySession } from "@/lib/api";

type EstadoConsulta =
    | { fase: "cargando" }
    | { fase: "esperando" }
    | { fase: "error"; mensaje: string }
    | {
          fase: "listo";
          nombreArtistico: string;
          categoriaLabel: string;
          competidorId: string | null;
          qrDataUrl: string;
      };

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
                    categoriaLabel: data.categoriaLabel ?? data.tipoBoleto ?? "",
                    competidorId: data.competidorId ?? null,
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

    const mensajeCompartir = `¡Ya estoy registrado en THE BOSS — Breaking Battles! Competidor: ${estado.nombreArtistico}${
        estado.competidorId ? ` (${estado.competidorId})` : ""
    }`;
    const urlWhatsapp = `https://wa.me/?text=${encodeURIComponent(mensajeCompartir)}`;

    const compartirInstagram = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ text: mensajeCompartir, url: estado.qrDataUrl });
                return;
            } catch {
                // el usuario canceló el share o el navegador lo rechazó; cae al fallback de descarga
            }
        }
        const enlace = document.createElement("a");
        enlace.href = estado.qrDataUrl;
        enlace.download = `the-boss-${estado.nombreArtistico}.png`;
        enlace.click();
    };

    return (
        <div className="mt-6 flex flex-col items-center">
            <h2 className="font-display text-2xl uppercase tracking-wide text-white">¡Bienvenido a THE BOSS!</h2>
            <p className="mt-1 text-sm text-boss-gray">Tu registro ha sido confirmado.</p>

            <div className="mt-6 rounded-xl border border-boss-border bg-white p-4">
                <Image
                    src={estado.qrDataUrl}
                    alt={`Código QR de acceso de ${estado.nombreArtistico}`}
                    width={260}
                    height={260}
                    unoptimized
                />
            </div>

            <p className="mt-6 max-w-md text-boss-gray">
                Este código QR es tu acceso <span className="text-boss-green">único</span> al evento. Preséntalo en la
                entrada; solo puede usarse una vez.
            </p>

            <div className="mt-4 space-y-1 text-center">
                <p className="font-display text-lg uppercase tracking-wide text-white">
                    Competidor: {estado.nombreArtistico}
                </p>
                <p className="text-sm uppercase tracking-widest text-boss-gray">Categoría: {estado.categoriaLabel}</p>
                {estado.competidorId && (
                    <p className="text-sm uppercase tracking-widest text-boss-green">ID: {estado.competidorId}</p>
                )}
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a
                    href={estado.qrDataUrl}
                    download={`qr-acceso-${estado.nombreArtistico}.png`}
                    className="rounded-md border border-boss-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-green hover:text-boss-green"
                >
                    Descargar QR
                </a>
                <a
                    href={urlWhatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-boss-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-green hover:text-boss-green"
                >
                    Compartir en WhatsApp
                </a>
                <button
                    type="button"
                    onClick={compartirInstagram}
                    className="rounded-md border border-boss-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-green hover:text-boss-green"
                >
                    Compartir en Instagram
                </button>
            </div>
        </div>
    );
}
