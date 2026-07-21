"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getRegistrationBySession } from "@/lib/api";
import { EVENTO_FECHA_LABEL, EVENTO_UBICACION } from "@/config/catalog";
import { CalendarIcon, CrownIcon, FacebookIcon, InstagramIcon, PdfIcon, PinIcon, ShareIcon, WhatsappIcon } from "./icons";
import { descargarInvitacionCalendario } from "./calendario";
import { compartirFacebook, compartirInstagram, compartirNativo, compartirWhatsapp } from "./compartir";

type EstadoConsulta =
    | { fase: "cargando" }
    | { fase: "esperando" }
    | { fase: "error"; mensaje: string }
    | {
          fase: "listo";
          nombreArtistico: string;
          categoriaLabel: string;
          tipoBoleto: string;
          competidorId: string | null;
          qrDataUrl: string;
          fotoUrl: string | null;
      };

const INTERVALO_MS = 2500;
const MAX_INTENTOS = 20;

export default function QrStatus() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const [estado, setEstado] = useState<EstadoConsulta>(
        sessionId ? { fase: "cargando" } : { fase: "error", mensaje: "Falta la referencia de pago en la URL." },
    );
    const [generandoPdf, setGenerandoPdf] = useState(false);
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

    const esPublico = estado.tipoBoleto === "GENERAL";

    async function handleDescargarPdf() {
        if (estado.fase !== "listo") return;
        setGenerandoPdf(true);
        try {
            const [{ pdf }, { PaseDocument }] = await Promise.all([import("@react-pdf/renderer"), import("./PaseDocument")]);
            const blob = await pdf(
                <PaseDocument
                    esPublico={esPublico}
                    nombreArtistico={estado.nombreArtistico}
                    categoriaLabel={estado.categoriaLabel}
                    competidorId={estado.competidorId}
                    qrDataUrl={estado.qrDataUrl}
                    fotoUrl={estado.fotoUrl}
                />,
            ).toBlob();
            const url = URL.createObjectURL(blob);
            const enlace = document.createElement("a");
            enlace.href = url;
            enlace.download = `the-boss-pase-${estado.nombreArtistico || "registro"}.pdf`;
            enlace.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error generando el PDF del pase", error);
            alert("No se pudo generar el PDF, intenta de nuevo.");
        } finally {
            setGenerandoPdf(false);
        }
    }

    return (
        <div className="mt-6 w-full max-w-2xl text-center">
            <h2 className="font-display text-3xl uppercase tracking-wide text-white">¡Bienvenido a THE BOSS!</h2>
            <p className="mt-1 text-sm text-boss-gray">Tu registro ha sido confirmado.</p>

            <div className="mt-4 flex items-center justify-center gap-3 text-boss-red">
                <span className="h-px w-10 bg-boss-border" />
                <CrownIcon className="h-4 w-6" />
                <span className="h-px w-10 bg-boss-border" />
            </div>

            <p className="mx-auto mt-4 max-w-md text-sm text-boss-gray">
                Prepárate para demostrar quién merece ser <span className="font-semibold text-boss-red">THE BOSS</span>.
            </p>

            <div className="relative mt-8 overflow-hidden rounded-2xl border border-boss-border bg-boss-panel text-left">
                <div className="pointer-events-none absolute -right-14 top-5 w-44 rotate-45 bg-boss-red py-1.5 text-center text-sm font-semibold uppercase tracking-widest text-white">
                    2026 Edition
                </div>

                <div className="border-b border-boss-border px-6 py-4">
                    <p className="flex items-center justify-center gap-3 font-display text-xl uppercase tracking-[0.2em] text-white">
                        <CrownIcon className="h-5 w-6 text-boss-red" />
                        {esPublico ? "Official General Pass" : "Official Competitor Pass"}
                        <CrownIcon className="h-5 w-6 text-boss-red" />
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[1fr_auto_1fr] md:gap-6">
                    <div className="flex items-stretch gap-5">
                        {estado.fotoUrl && (
                            <Image
                                src={estado.fotoUrl}
                                alt={`Foto de ${estado.nombreArtistico}`}
                                width={160}
                                height={220}
                                unoptimized
                                className="h-full w-40 shrink-0 rounded-lg border border-boss-border object-cover"
                            />
                        )}
                        <div className="flex flex-col items-start">
                            <p className="text-sm font-semibold uppercase tracking-widest text-boss-red">
                                {esPublico ? "Público general" : "Competidor"}
                            </p>
                            <p className="mt-1 font-display text-3xl uppercase text-white">{estado.nombreArtistico}</p>
                            <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-boss-red">Categoría</p>
                            <p className="mt-1 text-lg uppercase text-white">{estado.categoriaLabel}</p>
                            {estado.competidorId && (
                                <>
                                    <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-boss-red">
                                        {esPublico ? "ID de acceso" : "Competidor ID"}
                                    </p>
                                    <p className="mt-1 font-display text-2xl text-boss-green">{estado.competidorId}</p>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="relative hidden md:block">
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-boss-border" />
                        <div className="absolute -left-2 -top-2 h-4 w-4 -translate-x-1/2 rounded-full bg-boss-black" />
                        <div className="absolute -bottom-2 -left-2 h-4 w-4 -translate-x-1/2 rounded-full bg-boss-black" />
                    </div>

                    <div className="flex flex-col items-center text-center">
                        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white">
                            <CrownIcon className="h-4 w-5 text-boss-red" />
                            Official Entry QR
                            <CrownIcon className="h-4 w-5 text-boss-red" />
                        </p>
                        <div className="mt-3 rounded-xl border border-boss-border bg-white p-3">
                            <Image
                                src={estado.qrDataUrl}
                                alt={`Código QR de acceso de ${estado.nombreArtistico}`}
                                width={160}
                                height={160}
                                unoptimized
                            />
                        </div>
                        <p className="mt-3 max-w-[220px] text-sm text-boss-gray">
                            Presenta este código en la entrada.
                            <br />
                            No compartas este QR.
                        </p>
                        <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-boss-red">
                            Es único e intransferible
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-dashed border-boss-border px-6 py-3 text-sm uppercase tracking-widest text-boss-gray">
                    <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" /> {EVENTO_FECHA_LABEL}
                    </span>
                    <span className="flex items-center gap-2">
                        <PinIcon className="h-4 w-4" /> {EVENTO_UBICACION}
                    </span>
                </div>

                <div className="bg-boss-red py-2 text-center font-display text-base uppercase tracking-[0.3em] text-boss-black">
                    Who&apos;ll be the Boss?
                </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                    type="button"
                    onClick={handleDescargarPdf}
                    disabled={generandoPdf}
                    className="flex items-center justify-center gap-2 rounded-md border border-boss-border px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-green hover:text-boss-green disabled:cursor-wait disabled:opacity-50"
                >
                    <PdfIcon className="h-5 w-5" /> {generandoPdf ? "Generando..." : "Descargar Pase Oficial (PDF)"}
                </button>
                <button
                    type="button"
                    onClick={() => descargarInvitacionCalendario(estado.competidorId)}
                    className="flex items-center justify-center gap-2 rounded-md border border-boss-border px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-green hover:text-boss-green"
                >
                    <CalendarIcon className="h-5 w-5" /> Agregar al Calendario
                </button>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
                <p className="text-sm font-semibold uppercase tracking-widest text-white">Comparte tu registro</p>
                <p className="text-base font-semibold text-boss-red">#WhoWillBeTheBoss</p>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        aria-label="Compartir en Instagram"
                        onClick={() => compartirInstagram(estado.nombreArtistico)}
                        className="rounded-full border border-boss-border p-2 text-white transition-colors hover:border-boss-red hover:text-boss-red"
                    >
                        <InstagramIcon className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        aria-label="Compartir en WhatsApp"
                        onClick={() => compartirWhatsapp(estado.nombreArtistico)}
                        className="rounded-full border border-boss-border p-2 text-white transition-colors hover:border-boss-red hover:text-boss-red"
                    >
                        <WhatsappIcon className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        aria-label="Compartir en Facebook"
                        onClick={compartirFacebook}
                        className="rounded-full border border-boss-border p-2 text-white transition-colors hover:border-boss-red hover:text-boss-red"
                    >
                        <FacebookIcon className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        aria-label="Compartir"
                        onClick={() => compartirNativo(estado.nombreArtistico)}
                        className="rounded-full border border-boss-border p-2 text-white transition-colors hover:border-boss-red hover:text-boss-red"
                    >
                        <ShareIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-boss-border pt-4 text-sm uppercase tracking-wide text-boss-gray">
                <span>thebossbattle.com</span>
                <span>
                    Powered by <span className="font-semibold text-white">IDEK</span>
                </span>
            </div>
        </div>
    );
}
