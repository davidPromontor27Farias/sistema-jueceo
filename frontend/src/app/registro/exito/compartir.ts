const HASHTAG = "#WhoWillBeTheBoss";

function textoCompartir(nombreArtistico: string): string {
    return `¡Ya tengo mi lugar en THE BOSS! ${HASHTAG} ${nombreArtistico ? `— ${nombreArtistico}` : ""}`.trim();
}

export function compartirWhatsapp(nombreArtistico: string): void {
    const texto = encodeURIComponent(`${textoCompartir(nombreArtistico)} ${window.location.href}`);
    window.open(`https://wa.me/?text=${texto}`, "_blank", "noopener,noreferrer");
}

export function compartirFacebook(): void {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "noopener,noreferrer");
}

export async function compartirInstagram(nombreArtistico: string): Promise<void> {
    // Instagram no tiene un intent web para compartir contenido externo directamente;
    // copiamos el texto para que el usuario lo pegue en su historia o publicación.
    try {
        await navigator.clipboard.writeText(`${textoCompartir(nombreArtistico)} ${window.location.href}`);
        alert("Texto copiado. Pégalo en tu historia o publicación de Instagram.");
    } catch {
        alert("No se pudo copiar el texto automáticamente. Compártelo manualmente en Instagram.");
    }
}

export async function compartirNativo(nombreArtistico: string): Promise<void> {
    const texto = textoCompartir(nombreArtistico);
    if (navigator.share) {
        try {
            await navigator.share({ title: "THE BOSS", text: texto, url: window.location.href });
        } catch {
            // El usuario canceló el share, no hacer nada.
        }
        return;
    }
    try {
        await navigator.clipboard.writeText(`${texto} ${window.location.href}`);
        alert("Enlace copiado al portapapeles.");
    } catch {
        alert("No se pudo compartir ni copiar el enlace automáticamente.");
    }
}
