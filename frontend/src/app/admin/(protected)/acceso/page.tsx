"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RequireRol } from "../layout";
import { inputClass } from "../../../registro/components/Field";
import { useAdminSession } from "../../AdminSessionContext";
import { getHistorialAcceso, verificarAcceso, type AccessVerifyResult, type HistorialAccesoItem } from "@/lib/adminApi";

const PAUSA_ENTRE_ESCANEOS_MS = 4000;

export default function AdminAccesoPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN", "STAFF_ACCESO"]}>
            <AccesoRouter />
        </RequireRol>
    );
}

// El SUPER_ADMIN administra la plataforma pero no escanea en la entrada — solo
// ve, de solo lectura, quién va accediendo. Escanear (cámara + entrada manual)
// es exclusivo del staff que él mismo designe con el rol STAFF_ACCESO.
function AccesoRouter() {
    const { admin } = useAdminSession();
    if (admin?.rol === "SUPER_ADMIN") {
        return <AccesosSoloLectura />;
    }
    return <EscanerContenido />;
}

function AccesosSoloLectura() {
    const [historial, setHistorial] = useState<HistorialAccesoItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelado = false;
        const poll = () => {
            getHistorialAcceso().then((resp) => {
                if (cancelado) return;
                if (resp.ok) {
                    setHistorial(resp.data.historial);
                    setError(null);
                } else {
                    setError(resp.error);
                }
            });
        };
        poll();
        const id = setInterval(poll, 5000);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, []);

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Accesos</h1>
            <p className="mt-1 text-boss-gray">Personas que ya ingresaron al evento, en tiempo real.</p>

            {error && <p className="mt-4 text-sm font-medium text-red-400">{error}</p>}

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {historial === null && <p className="text-boss-gray">Cargando...</p>}
                {historial?.length === 0 && <p className="text-boss-gray">Todavía no ha entrado nadie.</p>}
                {historial?.map((persona) => (
                    <div key={persona.id} className="flex items-center gap-4 rounded-lg border border-boss-border bg-boss-panel/60 p-4">
                        {persona.fotoUrl ? (
                            <Image
                                src={persona.fotoUrl}
                                alt={persona.nombreArtistico || persona.nombres}
                                width={96}
                                height={96}
                                unoptimized
                                className="h-24 w-24 shrink-0 rounded-full border-2 border-boss-green object-cover"
                            />
                        ) : (
                            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-boss-border bg-boss-black text-xs text-boss-gray">
                                Sin foto
                            </div>
                        )}
                        <div className="min-w-0">
                            {persona.nombreArtistico && (
                                <p className="truncate font-display text-2xl uppercase leading-tight text-white">
                                    {persona.nombreArtistico}
                                </p>
                            )}
                            <p className="truncate text-lg font-medium text-white">
                                {persona.nombres} {persona.apellidos}
                            </p>
                            <p className="mt-1 truncate text-base font-semibold uppercase tracking-wide text-boss-red">
                                {persona.categoriaLabel}
                            </p>
                            {persona.academiaCrew && (
                                <p className="truncate text-base text-boss-gray">{persona.academiaCrew}</p>
                            )}
                            <p className="mt-1 truncate text-sm text-boss-gray">
                                {persona.paqueteBaseLabel}
                                {persona.paqueteBaseLabel ? " · " : ""}
                                {new Date(persona.qrEscaneadoEn).toLocaleTimeString("es-MX", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function EscanerContenido() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const bloqueadoRef = useRef(false);
    const [resultado, setResultado] = useState<AccessVerifyResult | null>(null);
    const [errorSistema, setErrorSistema] = useState<string | null>(null);
    const [procesando, setProcesando] = useState(false);
    const [camaraError, setCamaraError] = useState<string | null>(null);
    const [manualToken, setManualToken] = useState("");
    const [historial, setHistorial] = useState<HistorialAccesoItem[] | null>(null);

    const cargarHistorial = () => {
        getHistorialAcceso().then((resp) => {
            if (resp.ok) setHistorial(resp.data.historial);
        });
    };

    useEffect(() => {
        cargarHistorial();
        const id = setInterval(cargarHistorial, 5000);
        return () => clearInterval(id);
    }, []);

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
        setErrorSistema(null);

        const respuesta = await verificarAcceso(limpio);

        setProcesando(false);
        if (!respuesta.ok) {
            setErrorSistema(respuesta.error);
        } else {
            setResultado(respuesta.data);
            if (respuesta.data.ok) cargarHistorial();
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
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
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
                {errorSistema && <p className="mt-4 text-sm font-medium text-red-400">{errorSistema}</p>}
            </div>

            <HistorialPanel historial={historial} />

            {resultado && <ModalResultado resultado={resultado} onCerrar={() => setResultado(null)} />}
        </div>
    );
}

function ModalResultado({ resultado, onCerrar }: { resultado: AccessVerifyResult; onCerrar: () => void }) {
    useEffect(() => {
        const id = setTimeout(onCerrar, PAUSA_ENTRE_ESCANEOS_MS);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resultado]);

    const esOk = resultado.ok;
    const esYaUsado = !resultado.ok && resultado.motivo === "YA_USADO";
    const nombre = resultado.ok
        ? resultado.nombreArtistico || `${resultado.nombres} ${resultado.apellidos}`
        : "nombreArtistico" in resultado
          ? resultado.nombreArtistico
          : undefined;
    const fotoUrl = "fotoUrl" in resultado ? resultado.fotoUrl : undefined;
    const categoriaLabel = "categoriaLabel" in resultado ? resultado.categoriaLabel : undefined;
    const tipoBoleto = "tipoBoleto" in resultado ? resultado.tipoBoleto : undefined;
    const competidorId = "competidorId" in resultado ? resultado.competidorId : undefined;
    const paqueteBaseLabel = "paqueteBaseLabel" in resultado ? resultado.paqueteBaseLabel : undefined;
    const academiaCrew = "academiaCrew" in resultado ? resultado.academiaCrew : undefined;
    const workshopsSeleccionados = "workshopsSeleccionados" in resultado ? resultado.workshopsSeleccionados : undefined;
    const agregarOpenStyle = "agregarOpenStyle" in resultado ? resultado.agregarOpenStyle : undefined;

    const encabezado = esOk ? "Acceso concedido" : esYaUsado ? "QR ya usado" : "QR inválido";
    const colorEncabezado = esOk
        ? "border-boss-green/50 bg-boss-green/10 text-boss-green"
        : "border-boss-red/50 bg-boss-red/10 text-boss-red";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={onCerrar}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm overflow-hidden rounded-2xl border border-boss-border bg-boss-panel shadow-2xl"
            >
                <div className={`border-b p-4 text-center font-display text-2xl uppercase tracking-widest ${colorEncabezado}`}>
                    {encabezado}
                </div>

                <div className="flex flex-col items-center gap-3 p-6 text-center">
                    {fotoUrl ? (
                        <Image
                            src={fotoUrl}
                            alt={nombre || "Foto"}
                            width={160}
                            height={160}
                            unoptimized
                            className="h-40 w-40 rounded-full border-2 border-boss-border object-cover"
                        />
                    ) : (
                        <div className="flex h-40 w-40 items-center justify-center rounded-full border-2 border-boss-border bg-boss-black text-boss-gray">
                            Sin foto
                        </div>
                    )}

                    {nombre && <p className="font-display text-2xl uppercase text-white">{nombre}</p>}

                    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                        {categoriaLabel && (
                            <span className="rounded-full border border-boss-border px-3 py-1 text-boss-gray">
                                {categoriaLabel}
                            </span>
                        )}
                        {tipoBoleto && (
                            <span className="rounded-full border border-boss-border px-3 py-1 text-boss-gray">{tipoBoleto}</span>
                        )}
                        {competidorId && (
                            <span className="rounded-full border border-boss-border px-3 py-1 text-boss-green">
                                {competidorId}
                            </span>
                        )}
                    </div>

                    {(paqueteBaseLabel || academiaCrew || agregarOpenStyle || (workshopsSeleccionados && workshopsSeleccionados.length > 0)) && (
                        <div className="w-full space-y-1.5 rounded-md border border-boss-border bg-boss-black/40 p-3 text-left text-sm">
                            {paqueteBaseLabel && (
                                <p>
                                    <span className="text-boss-gray">Paquete: </span>
                                    <span className="text-white">{paqueteBaseLabel}</span>
                                </p>
                            )}
                            {academiaCrew && (
                                <p>
                                    <span className="text-boss-gray">Academia/Crew: </span>
                                    <span className="text-white">{academiaCrew}</span>
                                </p>
                            )}
                            {workshopsSeleccionados && workshopsSeleccionados.length > 0 && (
                                <p>
                                    <span className="text-boss-gray">Workshops: </span>
                                    <span className="text-white">{workshopsSeleccionados.join(", ")}</span>
                                </p>
                            )}
                            {agregarOpenStyle && (
                                <p className="text-boss-green">+ Open Style 1 vs 1</p>
                            )}
                        </div>
                    )}

                    {!esOk && !esYaUsado && (
                        <p className="text-sm text-boss-gray">Este código no corresponde a un boleto pagado.</p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onCerrar}
                    className="w-full border-t border-boss-border py-3 text-sm font-semibold uppercase tracking-wide text-boss-gray transition-colors hover:text-white"
                >
                    Cerrar
                </button>
            </div>
        </div>
    );
}

function HistorialPanel({ historial }: { historial: HistorialAccesoItem[] | null }) {
    return (
        <div className="rounded-lg border border-boss-border bg-boss-panel/60 p-4">
            <h2 className="font-display text-lg uppercase tracking-wide text-white">Historial de escaneos</h2>

            <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto">
                {historial === null && <p className="text-sm text-boss-gray">Cargando...</p>}
                {historial?.length === 0 && <p className="text-sm text-boss-gray">Todavía no hay escaneos.</p>}
                {historial?.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-md border border-boss-border p-2">
                        {item.fotoUrl ? (
                            <Image
                                src={item.fotoUrl}
                                alt={item.nombreArtistico}
                                width={40}
                                height={40}
                                unoptimized
                                className="h-10 w-10 shrink-0 rounded-full border border-boss-border object-cover"
                            />
                        ) : (
                            <div className="h-10 w-10 shrink-0 rounded-full border border-boss-border bg-boss-black" />
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">
                                {item.nombreArtistico || `${item.nombres} ${item.apellidos}`}
                            </p>
                            <p className="truncate text-xs text-boss-gray">
                                {item.categoriaLabel} ·{" "}
                                {new Date(item.qrEscaneadoEn).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {(item.paqueteBaseLabel || item.academiaCrew) && (
                                <p className="truncate text-xs text-boss-gray">
                                    {[item.paqueteBaseLabel, item.academiaCrew].filter(Boolean).join(" · ")}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
