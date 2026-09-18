import { Suspense } from "react";
import VistaRegistrosContenido from "./VistaRegistrosContenido";

// Página pública (sin login) pensada para compartirle al dueño del evento un
// enlace con ?token=... y que vea cómo van los registros pagados por
// categoría, sin tener que entrar al panel de admin. No aparece en ningún
// menú de navegación.
export default function VistaRegistrosPage() {
    return (
        <main className="flex h-screen flex-col items-center overflow-hidden bg-boss-black px-4 py-3 text-center">
            <h1 className="shrink-0 font-display text-xl uppercase tracking-widest text-boss-red">
                Registros por categoría
            </h1>
            <Suspense fallback={<p className="mt-6 text-boss-gray">Cargando...</p>}>
                <VistaRegistrosContenido />
            </Suspense>
        </main>
    );
}
