import { Suspense } from "react";
import ResultadosContenido from "./ResultadosContenido";

// Página pública (sin login): guarda y muestra los puntajes de cada
// competidor por categoría — preselección y cada ronda del bracket hasta la
// Final — para que cualquiera pueda consultarlos después, sin depender del
// recorrido automático de /pantalla (que solo se muestra una vez, en vivo).
export default function ResultadosPage() {
    return (
        <main className="flex min-h-screen flex-col items-center bg-boss-black px-4 py-6 text-center">
            <h1 className="shrink-0 font-display text-xl uppercase tracking-widest text-boss-red">
                Resultados por categoría
            </h1>
            <Suspense fallback={<p className="mt-6 text-boss-gray">Cargando...</p>}>
                <ResultadosContenido />
            </Suspense>
        </main>
    );
}
