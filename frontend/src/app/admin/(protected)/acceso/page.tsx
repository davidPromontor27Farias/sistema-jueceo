"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RequireRol } from "../layout";
import { inputClass } from "../../../registro/components/Field";
import { verificarAcceso } from "@/lib/adminApi";

type ResultadoEscaneo = {
    estado: "ok" | "ya_usado" | "invalido" | "error";
    mensaje: string;
    detalle?: string;
};

const PAUSA_ENTRE_ESCANEOS_MS = 2500;

export default function AdminAccesoPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN", "STAFF_ACCESO"]}>
            <AccesoContenido />
        </RequireRol>
    );
}

function AccesoContenido() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const bloqueadoRef = useRef(false);
    const [resultado, setResultado] = useState<ResultadoEscaneo | null>(null);
    const [procesando, setProcesando] = useState(false);
    const [camaraError, setCamaraError] = useState<string | null>(null);
    const [manualToken, setManualToken] = useState("");

    useEffect(() => {
        let controls: { stop: () => void } | undefined;
        let cancelado = false;

        async function iniciarCamara() {
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
                setCamaraError(
                    "Este navegador bloquea la cámara porque la página no se abrió por HTTPS (o localhost). Usa la entrada manual de abajo.",
                );
                return;
            }

            try {
                const { BrowserQRCodeReader } = await import("@zxing/browser");
                const reader = new BrowserQRCodeReader();
                if (cancelado || !videoRef.current) return;
                controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
                    if (result && !bloqueadoRef.current) {
                        procesarToken(result.getText());
                    }
                });
            } catch (error) {
                console.error("Error iniciando la cámara", error);
                if (!cancelado) {
                    const detalle = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
                    setCamaraError(`No se pudo acceder a la cámara (${detalle}). Usa la entrada manual de abajo.`);
                }
            }
        }

        iniciarCamara();
        return () => {
            cancelado = true;
            controls?.stop();
        };
    }, []);

    async function procesarToken(token: string) {
        const limpio = token.trim();
        if (!limpio || bloqueadoRef.current) return;

        bloqueadoRef.current = true;
        setProcesando(true);

        const respuesta = await verificarAcceso(limpio);

        setProcesando(false);
        if (!respuesta.ok) {
            setResultado({ estado: "error", mensaje: respuesta.error });
        } else if (respuesta.data.ok) {
            setResultado({
                estado: "ok",
                mensaje: `Acceso concedido — ${respuesta.data.nombreArtistico || respuesta.data.nombres}`,
                detalle: respuesta.data.tipoBoleto,
            });
        } else if (respuesta.data.motivo === "YA_USADO") {
            setResultado({
                estado: "ya_usado",
                mensaje: respuesta.data.nombreArtistico ? `Este QR ya fue usado — ${respuesta.data.nombreArtistico}` : "Este QR ya fue usado",
            });
        } else {
            setResultado({ estado: "invalido", mensaje: "QR inválido o boleto sin pago confirmado" });
        }

        setTimeout(() => {
            bloqueadoRef.current = false;
        }, PAUSA_ENTRE_ESCANEOS_MS);
    }

    const onSubmitManual = (event: FormEvent) => {
        event.preventDefault();
        procesarToken(manualToken);
        setManualToken("");
    };

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Control de acceso</h1>
            <p className="mt-1 text-boss-gray">Escanea el QR del boleto en la entrada.</p>

            <div className="mt-6 overflow-hidden rounded-lg border border-boss-border bg-black">
                <video ref={videoRef} className="aspect-square w-full max-w-sm mx-auto" muted playsInline />
            </div>

            {camaraError && <p className="mt-3 text-sm text-boss-gray">{camaraError}</p>}

            <form onSubmit={onSubmitManual} className="mt-4 flex max-w-sm gap-2">
                <input
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Pegar código manualmente"
                    className={inputClass}
                />
                <button
                    type="submit"
                    disabled={procesando}
                    className="shrink-0 rounded-md bg-boss-red px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark disabled:opacity-50"
                >
                    Verificar
                </button>
            </form>

            {procesando && <p className="mt-4 text-boss-gray">Verificando...</p>}

            {resultado && !procesando && (
                <div
                    className={[
                        "mt-4 max-w-sm rounded-md border p-4 text-center",
                        resultado.estado === "ok"
                            ? "border-boss-green/50 bg-boss-green/10 text-boss-green"
                            : "border-boss-red/50 bg-boss-red/10 text-boss-red",
                    ].join(" ")}
                >
                    <p className="font-display text-lg uppercase tracking-wide">{resultado.mensaje}</p>
                    {resultado.detalle && <p className="mt-1 text-sm uppercase tracking-widest">{resultado.detalle}</p>}
                </div>
            )}
        </div>
    );
}
