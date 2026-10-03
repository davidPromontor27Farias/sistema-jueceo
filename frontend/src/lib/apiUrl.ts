const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

function esIpPrivada(host: string): boolean {
    return (
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
}

// En desarrollo, si NEXT_PUBLIC_API_URL apunta a localhost/una IP de red local
// pero la página se abrió desde OTRO host local (ej. .env dice localhost pero
// estás probando desde el celular por la IP, o al revés), usa el host real
// desde el que se cargó la página en vez del fijo en .env.
//
// Esto evita que se rompan las cookies de sesión de admin: para el navegador
// "localhost" y "192.168.1.35" son sitios distintos aunque sea la misma
// máquina, así que mezclar uno y otro tira las cookies SameSite=Lax de
// desarrollo. En producción (dominio real) esto no aplica y no toca nada.
//
// Sin NEXT_PUBLIC_API_URL configurada, devuelve "" a propósito (no un error):
// en producción esto es justo lo que queremos — rutas relativas ("/api/...")
// que el navegador resuelve contra el propio dominio del frontend, el cual
// Next.js reescribe hacia el backend (ver rewrites() en next.config.ts). Así
// la cookie de sesión del admin deja de ser cross-site (dominio del backend
// distinto al del frontend), que es lo que hacía que Safari/Chrome en
// celulares la descartaran silenciosamente — el login parecía funcionar pero
// la siguiente petición llegaba sin cookie y rebotaba a /admin/login.
export function resolveApiUrl(): string {
    const configurado = process.env.NEXT_PUBLIC_API_URL ?? "";
    if (!configurado || typeof window === "undefined") return configurado;

    try {
        const url = new URL(configurado);
        const esConfigLocal = HOSTS_LOCALES.has(url.hostname) || esIpPrivada(url.hostname);
        const hostActual = window.location.hostname;

        if (esConfigLocal && hostActual !== url.hostname) {
            url.hostname = hostActual;
            return url.toString().replace(/\/$/, "");
        }
    } catch {
        return configurado;
    }

    return configurado;
}
