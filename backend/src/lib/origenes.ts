// FRONTEND_URL admite una lista separada por comas (ej. localhost + la IP de
// la red local para probar desde el celular). Centralizado acá porque lo usan
// tanto el CORS (index.ts) como el armado de success_url/cancel_url de Stripe
// (registrations.ts), que NO deben concatenar la lista completa como si fuera
// una sola URL.
export function origenesFrontendPermitidos(): string[] {
    return (process.env.FRONTEND_URL ?? "")
        .split(",")
        .map((origen) => origen.trim())
        .filter(Boolean);
}
