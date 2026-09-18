import Image from "next/image";
import { Suspense } from "react";
import VistaRegistrosContenido from "./VistaRegistrosContenido";

// Página pública (sin login) pensada para compartirle al dueño del evento un
// enlace con ?token=... y que vea cómo van los registros pagados por
// categoría, sin tener que entrar al panel de admin. No aparece en ningún
// menú de navegación.
export default function VistaRegistrosPage() {
    return (
        <main className="flex min-h-screen flex-col items-center bg-boss-black px-4 py-10 text-center">
            <Image src="/the-boss-logo.png" alt="THE BOSS — Breaking Battles" width={120} height={100} />
            <h1 className="mt-4 font-display text-2xl uppercase tracking-widest text-boss-red">
                Registros por categoría
            </h1>
            <Suspense fallback={<p className="mt-6 text-boss-gray">Cargando...</p>}>
                <VistaRegistrosContenido />
            </Suspense>
        </main>
    );
}
