import { URL_REGISTRO } from "@/config/catalog";

const HASHTAG = "#WhoWillBeTheBoss";

function textoCompartir(nombreArtistico: string): string {
    return `Yo ya tengo mi pase para THE BOSS. ${HASHTAG}${nombreArtistico ? ` — ${nombreArtistico}` : ""}`;
}

export async function generarImagenTarjeta(nodo: HTMLElement): Promise<File | null> {
    const { toBlob } = await import("html-to-image");
    const blob = await toBlob(nodo, { pixelRatio: 2, backgroundColor: "#0a0a0a" });
    if (!blob) return null;
    return new File([blob], "the-boss-registro.png", { type: "image/png" });
}

function descargarArchivo(archivo: File): void {
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = archivo.name;
    enlace.click();
    URL.revokeObjectURL(url);
}

// Ninguna de estas redes acepta adjuntar una imagen a través de su enlace web
// (wa.me, el sharer de Facebook, ni Instagram tienen esa opción): por eso se
// descarga primero la tarjeta (sin QR) para que el usuario la adjunte a mano
// en la conversación/publicación que se abre.
export async function compartirWhatsapp(nombreArtistico: string, archivo: File | null): Promise<void> {
    if (archivo) descargarArchivo(archivo);
    const texto = encodeURIComponent(`${textoCompartir(nombreArtistico)} ${window.location.href}`);
    window.open(`https://wa.me/?text=${texto}`, "_blank", "noopener,noreferrer");
}

// Se comparte la URL pública de registro (no la de confirmación, que es privada
// por sesión) para que Facebook muestre su tarjeta de vista previa automática
// (imagen + descripción), tomada de las etiquetas Open Graph configuradas en
// frontend/src/app/registro/layout.tsx. Facebook ya no permite precargar el
// texto de la publicación ni adjuntar una imagen personalizada vía enlace.
export function compartirFacebook(): void {
    const url = encodeURIComponent(URL_REGISTRO);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "noopener,noreferrer");
}

export async function compartirInstagram(nombreArtistico: string, archivo: File | null): Promise<void> {
    // Instagram no tiene un enlace web para compartir contenido externo (como sí
    // tienen Facebook y WhatsApp); se descarga la tarjeta, se copia el texto y se
    // abre Instagram para que el usuario publique manualmente.
    if (archivo) descargarArchivo(archivo);
    try {
        await navigator.clipboard.writeText(textoCompartir(nombreArtistico));
    } catch {
        // Si falla el portapapeles, igual se abre Instagram con la imagen ya descargada.
    }
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
}

export async function compartirNativo(nombreArtistico: string, archivo: File | null): Promise<void> {
    const texto = textoCompartir(nombreArtistico);
    if (typeof navigator.share === "function" && (!archivo || navigator.canShare?.({ files: [archivo] }))) {
        try {
            await navigator.share(archivo ? { files: [archivo], text: texto, title: "THE BOSS" } : { text: texto, url: window.location.href, title: "THE BOSS" });
            return;
        } catch {
            return;
        }
    }
    if (archivo) descargarArchivo(archivo);
    try {
        await navigator.clipboard.writeText(`${texto} ${window.location.href}`);
        alert("Imagen descargada y enlace copiado al portapapeles.");
    } catch {
        alert("Imagen descargada. Compártela manualmente.");
    }
}
