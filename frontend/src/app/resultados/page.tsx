import Image from "next/image";
import { Suspense } from "react";
import { ChispasFondo } from "../pantalla/SecuenciaBatalla";
import ResultadosContenido from "./ResultadosContenido";

// Página pública (sin login): guarda y muestra los puntajes de cada
// competidor por categoría — preselección y cada ronda del bracket hasta la
// Final — para que cualquiera pueda consultarlos después, sin depender del
// recorrido automático de /pantalla (que solo se muestra una vez, en vivo).
// A diferencia de /pantalla y /tablero (pantallas fijas de TV), esta sí debe
// funcionar bien en celular — nada de `fixed inset-0`/`overflow-hidden`, el
// fondo decorativo va `fixed` detrás pero el contenido scrollea normal.
export default function ResultadosPage() {
    return (
        <main className="relative min-h-screen bg-boss-black px-4 pb-16 pt-8 sm:px-8">
            {/* Mismo fondo "aurora" + chispas que el resto del sistema (ver
                /pantalla y /pantalla/tablero) — fixed para que no se mueva con
                el scroll del contenido. */}
            <div className="pointer-events-none fixed -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-boss-blue/20 blur-[130px] animate-deriva-a" />
            <div className="pointer-events-none fixed -bottom-48 -right-32 h-[34rem] w-[34rem] rounded-full bg-boss-red/20 blur-[130px] animate-deriva-b" />
            <div className="pointer-events-none fixed inset-0">
                <ChispasFondo />
            </div>

            <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center">
                <Image
                    src="/the-boss-logo.png"
                    alt="THE BOSS — Breaking Battles"
                    width={1537}
                    height={1023}
                    priority
                    className="h-20 w-auto sm:h-28"
                />
                <h1
                    className="mt-2 text-center font-display text-3xl uppercase italic leading-none text-white sm:text-5xl"
                    style={{
                        WebkitTextStroke: "1.5px var(--color-boss-red)",
                        textShadow: "0 0 18px var(--color-boss-red), 0 0 40px var(--color-boss-red)",
                    }}
                >
                    Resultados
                </h1>
                <p className="mt-1 font-display text-xs uppercase tracking-[0.3em] text-boss-gray sm:text-sm">
                    Por categoría
                </p>

                <Suspense fallback={<p className="mt-8 text-boss-gray">Cargando...</p>}>
                    <ResultadosContenido />
                </Suspense>
            </div>
        </main>
    );
}
