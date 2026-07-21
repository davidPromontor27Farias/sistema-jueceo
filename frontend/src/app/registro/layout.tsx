import type { Metadata } from "next";
import { EVENTO_FECHA_LABEL, EVENTO_UBICACION, URL_REGISTRO } from "@/config/catalog";

const DESCRIPCION = `Yo ya tengo mi pase para THE BOSS. Regístrate tú también — ${EVENTO_FECHA_LABEL} en ${EVENTO_UBICACION}.`;

// Metadata Open Graph para que al compartir esta URL en Facebook/WhatsApp
// aparezca automáticamente una tarjeta de vista previa con imagen y
// descripción, sin depender de adjuntar nada manualmente. `page.tsx` es un
// client component ("use client"), así que la metadata vive aquí en el layout
// (server component) que lo envuelve.
export const metadata: Metadata = {
    title: "Regístrate — THE BOSS Breaking Event",
    description: DESCRIPCION,
    openGraph: {
        type: "website",
        siteName: "THE BOSS",
        url: URL_REGISTRO,
        title: "THE BOSS — Breaking Event",
        description: DESCRIPCION,
        images: [{ url: "/the-boss-logo.png", width: 1254, height: 1254, alt: "THE BOSS — Breaking Event" }],
    },
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
    return children;
}
