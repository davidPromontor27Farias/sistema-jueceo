import rateLimit from "express-rate-limit";

// Crear registro + sesión de Stripe: limita spam de registros/checkouts por IP.
export const registrationCreateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos, intenta de nuevo más tarde" },
});

// Registro del Evento de Prueba: mismo endpoint lo usa el equipo para
// ensayar el flujo completo una y otra vez desde la misma IP (sin Stripe de
// por medio, no hay riesgo de fraude de tarjeta que frenar) — reusar el
// límite de 10/15min pensado para el registro REAL los bloqueaba a media
// prueba con "Demasiados intentos". Separado del de arriba a propósito: el
// registro real sí debe seguir limitado contra spam/card-testing.
export const registrationPruebaCreateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos, intenta de nuevo más tarde" },
});

// Consulta de estatus de pago: el frontend hace polling (~20 veces cada 2.5s tras pagar).
export const registrationStatusLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});

// Check-in de QR en la entrada: deja escanear seguido pero frena fuerza bruta.
export const accessVerifyLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos, espera un momento" },
});

// Login de administradores: frena fuerza bruta de contraseña.
export const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos, intenta de nuevo más tarde" },
});

// Vista de solo lectura (sin login) para que el cliente vea cómo van los
// registros: protegida por token, pero igual se limita por si el enlace se
// comparte de más o alguien intenta adivinar el token a fuerza bruta.
export const vistaRegistrosLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes, intenta de nuevo más tarde" },
});
