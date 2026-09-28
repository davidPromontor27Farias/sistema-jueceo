"use client";

import Image from "next/image";
import { useState } from "react";
import { EVENTO_DIA_1_LABEL, EVENTO_DIA_2_LABEL, EVENTO_UBICACION } from "@/config/catalog";
import { CalendarIcon, CrownIcon, PdfIcon, PinIcon, TigerClawIcon } from "./icons";
import { descargarInvitacionCalendario } from "./calendario";

export type PaseConfirmadoDatos = {
    nombreArtistico: string;
    nombreCompleto: string;
    categoriaLabel: string;
    tipoBoleto: string;
    competidorId: string | null;
    qrDataUrl: string;
    fotoUrl: string | null;
};

// Tarjeta de confirmación (pase + QR + descarga de PDF + calendario), común
// a ambos flujos de registro: el real (QrStatus.tsx, tras confirmar el pago
// con Stripe) y el Evento de Prueba (RegistroWizard.tsx, de una vez al
// enviar el formulario, sin pago de por medio).
export function PaseConfirmado(datos: PaseConfirmadoDatos) {
    const [generandoPdf, setGenerandoPdf] = useState(false);
    const esPublico = datos.tipoBoleto === "GENERAL";

    // @react-pdf/renderer resuelve <Image src="https://..."> con su propio
    // fetch interno, y si ese fetch falla (por la razón que sea) simplemente
    // omite la imagen sin tronar el PDF. El QR nunca falla porque ya se
    // genera como data URI (no necesita red); acá se hace lo mismo con la
    // foto: se descarga en el navegador ANTES de armar el PDF y se le pasa a
    // react-pdf ya como data URI, sin dejarle su propio fetch de por medio.
    //
    // Aparte: las fotos subidas a Cloudinary suelen quedar como JPEG
    // progresivo (típico de celulares/editores), formato que el
    // decodificador JPEG de @react-pdf/renderer no soporta bien — el PDF se
    // genera igual, pero el recuadro de la foto sale en blanco (confirmado:
    // el archivo sí crece de tamaño, los bytes se embeben, pero no
    // renderizan). Pedirle a Cloudinary que la reconvierta a PNG al vuelo
    // (con un tope de ancho, ya que en el pase se ve a 56x72pt) evita ese
    // problema de compatibilidad de una sola vez, sin importar cómo haya
    // quedado codificada la foto original.
    function urlFotoParaPdf(url: string): string {
        return url.replace("/upload/", "/upload/f_png,c_limit,w_600/");
    }

    async function urlAFotoBase64(url: string): Promise<string | null> {
        try {
            const respuesta = await fetch(urlFotoParaPdf(url));
            if (!respuesta.ok) return null;
            const blob = await respuesta.blob();
            return await new Promise<string>((resolve, reject) => {
                const lector = new FileReader();
                lector.onloadend = () => resolve(lector.result as string);
                lector.onerror = () => reject(new Error("No se pudo leer la foto"));
                lector.readAsDataURL(blob);
            });
        } catch (error) {
            console.error("Error al descargar la foto para el PDF", error);
            return null;
        }
    }

    async function handleDescargarPdf() {
        setGenerandoPdf(true);
        try {
            const [[{ pdf }, { PaseDocument }], fotoBase64] = await Promise.all([
                Promise.all([import("@react-pdf/renderer"), import("./PaseDocument")]),
                datos.fotoUrl ? urlAFotoBase64(datos.fotoUrl) : Promise.resolve(null),
            ]);
            const blob = await pdf(
                <PaseDocument
                    esPublico={esPublico}
                    nombreArtistico={datos.nombreArtistico}
                    categoriaLabel={datos.categoriaLabel}
                    competidorId={datos.competidorId}
                    qrDataUrl={datos.qrDataUrl}
                    fotoUrl={fotoBase64}
                />,
            ).toBlob();
            const url = URL.createObjectURL(blob);
            const enlace = document.createElement("a");
            enlace.href = url;
            enlace.download = `the-boss-pase-${datos.nombreArtistico || "registro"}.pdf`;
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
                <div className="absolute -left-7 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full border border-boss-border bg-boss-black" />
                <div className="absolute -right-7 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full border border-boss-border bg-boss-black" />

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

                <div className="grid grid-cols-1 gap-6 py-6 pl-10 pr-6 md:grid-cols-[1fr_auto_1fr] md:gap-6">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-stretch gap-5">
                            {datos.fotoUrl && (
                                <Image
                                    src={datos.fotoUrl}
                                    alt={`Foto de ${datos.nombreArtistico}`}
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
                                {datos.nombreArtistico ? (
                                    <>
                                        <p className="mt-1 font-display text-3xl uppercase text-white">{datos.nombreArtistico}</p>
                                        <p className="text-lg text-boss-gray">{datos.nombreCompleto}</p>
                                    </>
                                ) : (
                                    <p className="mt-1 font-display text-3xl uppercase text-white">{datos.nombreCompleto}</p>
                                )}
                                <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-boss-red">Categoría</p>
                                <p className="mt-1 text-lg uppercase text-white">{datos.categoriaLabel}</p>
                                {datos.competidorId && (
                                    <>
                                        <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-boss-red">
                                            {esPublico ? "ID de acceso" : "Competidor ID"}
                                        </p>
                                        <p className="mt-1 font-display text-2xl text-boss-green">{datos.competidorId}</p>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3 border-t border-dashed border-boss-border pt-4 text-base uppercase tracking-widest text-boss-gray">
                            <span className="flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5" /> {EVENTO_DIA_1_LABEL}
                            </span>
                            <span className="text-boss-border">|</span>
                            <span>{EVENTO_DIA_2_LABEL}</span>
                            <span className="flex items-center gap-2">
                                <PinIcon className="h-5 w-5" /> {EVENTO_UBICACION}
                            </span>
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
                                src={datos.qrDataUrl}
                                alt={`Código QR de acceso de ${datos.nombreArtistico}`}
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

                <div className="flex items-center justify-center gap-5 bg-boss-red py-2 text-center font-display text-base uppercase tracking-[0.3em] text-boss-black">
                    <TigerClawIcon className="h-6 w-9 shrink-0 text-boss-black/70" />
                    <span>Who&apos;ll be the Boss?</span>
                    <TigerClawIcon className="h-6 w-9 shrink-0 -scale-x-100 text-boss-black/70" />
                </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                    type="button"
                    onClick={handleDescargarPdf}
                    disabled={generandoPdf}
                    className="flex items-center justify-center gap-3 rounded-md border-2 border-red-600 px-5 py-3 text-lg font-bold uppercase tracking-wide text-white shadow-[0_0_8px_rgba(220,38,38,0.9),0_0_18px_rgba(220,38,38,0.6),0_0_32px_rgba(220,38,38,0.4)] transition-all hover:shadow-[0_0_12px_rgba(220,38,38,1),0_0_28px_rgba(220,38,38,0.8),0_0_48px_rgba(220,38,38,0.5)] disabled:cursor-wait disabled:opacity-50"
                >
                    <PdfIcon className="h-7 w-7" /> {generandoPdf ? "Generando..." : "Descargar Pase Oficial (PDF)"}
                </button>
                <button
                    type="button"
                    onClick={() => descargarInvitacionCalendario(datos.competidorId)}
                    className="flex items-center justify-center gap-3 rounded-md border-2 border-red-600 px-5 py-3 text-lg font-bold uppercase tracking-wide text-white shadow-[0_0_8px_rgba(220,38,38,0.9),0_0_18px_rgba(220,38,38,0.6),0_0_32px_rgba(220,38,38,0.4)] transition-all hover:shadow-[0_0_12px_rgba(220,38,38,1),0_0_28px_rgba(220,38,38,0.8),0_0_48px_rgba(220,38,38,0.5)]"
                >
                    <CalendarIcon className="h-7 w-7" /> Agregar al Calendario
                </button>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-boss-border pt-4 text-sm uppercase tracking-wide text-boss-gray">
                <span>thebossbreaking.com</span>
                <span>
                    Powered by <span className="font-semibold text-white">IDEK</span>
                </span>
            </div>
        </div>
    );
}
