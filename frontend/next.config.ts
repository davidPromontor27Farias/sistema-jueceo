import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite probar el servidor de desarrollo desde otros dispositivos en la
  // misma red (ej. celular) — Next.js bloquea por default las peticiones a
  // assets/HMR que no vengan del origen esperado.
  allowedDevOrigins: ["192.168.1.35"],

  // Reescribe /api/* hacia el backend (Express en Railway, dominio distinto
  // al del frontend). Objetivo: que la cookie de sesión del admin deje de
  // ser cross-site — con el dominio del backend distinto al del frontend,
  // Safari/Chrome en varios celulares la descartaban silenciosamente (el
  // login parecía funcionar pero la siguiente petición llegaba sin cookie y
  // rebotaba a /admin/login). Con este proxy, el navegador ve todo como
  // mismo origen que el frontend; ver resolveApiUrl() en src/lib/apiUrl.ts,
  // que en producción deja NEXT_PUBLIC_API_URL sin configurar a propósito
  // para que las peticiones usen rutas relativas y caigan aquí.
  //
  // En local no afecta nada: NEXT_PUBLIC_API_URL sigue apuntando directo a
  // http://localhost:4000 en .env.local, así que las peticiones nunca usan
  // ruta relativa y esta regla no se llega a disparar.
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
