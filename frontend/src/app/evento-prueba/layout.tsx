import type { Metadata } from "next";

// robots: noindex — esta URL es solo para el staff durante el ensayo del
// sistema, no debe indexarse ni compartirse como si fuera el registro real.
export const metadata: Metadata = {
    title: "Evento de Prueba — THE BOSS",
    description: "Registro sin costo para el ensayo del sistema. No es el evento real.",
    robots: { index: false, follow: false },
};

export default function EventoPruebaLayout({ children }: { children: React.ReactNode }) {
    return children;
}
