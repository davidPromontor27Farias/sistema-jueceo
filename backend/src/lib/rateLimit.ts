import rateLimit from "express-rate-limit";

// Crear registro + sesión de Stripe: limita spam de registros/checkouts por IP.
export const registrationCreateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
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
