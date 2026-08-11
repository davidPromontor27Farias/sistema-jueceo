import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite probar el servidor de desarrollo desde otros dispositivos en la
  // misma red (ej. celular) — Next.js bloquea por default las peticiones a
  // assets/HMR que no vengan del origen esperado.
  allowedDevOrigins: ["192.168.1.35"],
};

export default nextConfig;
