export const ESTADOS_MEXICO = [
    "Aguascalientes",
    "Baja California",
    "Baja California Sur",
    "Campeche",
    "Chiapas",
    "Chihuahua",
    "Ciudad de México",
    "Coahuila",
    "Colima",
    "Durango",
    "Estado de México",
    "Guanajuato",
    "Guerrero",
    "Hidalgo",
    "Jalisco",
    "Michoacán",
    "Morelos",
    "Nayarit",
    "Nuevo León",
    "Oaxaca",
    "Puebla",
    "Querétaro",
    "Quintana Roo",
    "San Luis Potosí",
    "Sinaloa",
    "Sonora",
    "Tabasco",
    "Tamaulipas",
    "Tlaxcala",
    "Veracruz",
    "Yucatán",
    "Zacatecas",
] as const;

export type Categoria =
    | "KIDS_AMATEUR"
    | "KIDS_BOYS"
    | "KIDS_GIRL"
    | "MASTERS_40_PLUS"
    | "JUVENIL_BOYS"
    | "JUVENIL_GIRL"
    | "BGIRLS"
    | "BBOYS"
    | "PUBLICO_GENERAL"
    | "OPEN_STYLE_1V1";

export type Sexo = "MASCULINO" | "FEMENINO";

export type TipoBoleto = "GENERAL" | "COMPETIDOR" | "STAFF" | "VIP" | "INVITADO";

export type PaqueteBase =
    | "COMPETIDOR"
    | "PUBLICO_GENERAL"
    | "VIP_EXPERIENCE"
    | "BOSS_EXPERIENCE"
    | "BOSS_VIP"
    | "SOLO_WORKSHOPS";

export type TipoParticipacion = "COMPETIDOR" | "PUBLICO";

export const CATEGORIAS_LABEL: Record<Categoria, string> = {
    KIDS_AMATEUR: "Kids Amateur",
    KIDS_BOYS: "Kids Boys",
    KIDS_GIRL: "Kids Girl",
    MASTERS_40_PLUS: "Masters 40+",
    JUVENIL_BOYS: "Juvenil Boys",
    JUVENIL_GIRL: "Juvenil Girl",
    BGIRLS: "Bgirls",
    BBOYS: "Bboys",
    PUBLICO_GENERAL: "Público en general",
    OPEN_STYLE_1V1: "Especial: Open Style 1 vs 1",
};

export const PAQUETES_BASE_LABEL: Record<PaqueteBase, string> = {
    COMPETIDOR: "The Boss Entry",
    PUBLICO_GENERAL: "Entrada General",
    VIP_EXPERIENCE: "VIP Experience",
    BOSS_EXPERIENCE: "The Boss Experience",
    BOSS_VIP: "The Boss VIP",
    SOLO_WORKSHOPS: "Workshops",
};

// Paquetes que solo puede elegir quien se registra como competidor.
export const PAQUETES_COMPETIDOR: PaqueteBase[] = ["COMPETIDOR", "BOSS_EXPERIENCE", "BOSS_VIP", "SOLO_WORKSHOPS"];

// Paquetes que solo puede elegir quien se registra como público.
export const PAQUETES_PUBLICO: PaqueteBase[] = ["PUBLICO_GENERAL", "VIP_EXPERIENCE"];

// Regla de elegibilidad por categoría: rango de edad y sexo permitido.
// `null` en minEdad/maxEdad significa sin límite; `sexoPermitido: null` significa ambos sexos.
// PENDIENTE: confirmar con el cliente la matriz completa de reglas sexo+edad.
// Hoy sexoPermitido está inferido del nombre de cada categoría (BGIRLS/GIRL -> femenino,
// BBOYS/BOYS -> masculino); ajustar aquí cuando el cliente la mande.
export const REGLAS_POR_CATEGORIA: Record<
    Categoria,
    { minEdad: number | null; maxEdad: number | null; sexoPermitido: Sexo[] | null }
> = {
    KIDS_AMATEUR: { minEdad: 6, maxEdad: 12, sexoPermitido: null },
    KIDS_BOYS: { minEdad: 6, maxEdad: 12, sexoPermitido: ["MASCULINO"] },
    KIDS_GIRL: { minEdad: 6, maxEdad: 12, sexoPermitido: ["FEMENINO"] },
    JUVENIL_BOYS: { minEdad: 13, maxEdad: 17, sexoPermitido: ["MASCULINO"] },
    JUVENIL_GIRL: { minEdad: 13, maxEdad: 17, sexoPermitido: ["FEMENINO"] },
    BGIRLS: { minEdad: 18, maxEdad: null, sexoPermitido: ["FEMENINO"] },
    BBOYS: { minEdad: 18, maxEdad: null, sexoPermitido: ["MASCULINO"] },
    MASTERS_40_PLUS: { minEdad: 40, maxEdad: null, sexoPermitido: null },
    PUBLICO_GENERAL: { minEdad: null, maxEdad: null, sexoPermitido: null },
    OPEN_STYLE_1V1: { minEdad: null, maxEdad: null, sexoPermitido: null },
};

// Todas las categorías salvo "Público en general" corresponden a un boleto de competidor.
export function tipoBoletoPorCategoria(categoria: Categoria): TipoBoleto {
    return categoria === "PUBLICO_GENERAL" ? "GENERAL" : "COMPETIDOR";
}

// Prefijo único del ID fijo de competidor (ej. "THB-023") asignado al confirmarse
// el pago, igual para todas las categorías, ver backend/src/routes/stripeWebhook.ts
export const PREFIJO_ID_COMPETIDOR = "THB";

// PENDIENTE: lista real de academias/crews del cliente. Placeholder de ejemplo
// para el picklist con opción "Otra... (escribir)" en el formulario.
export const ACADEMIAS_CONOCIDAS = ["Academia Ejemplo 1", "Academia Ejemplo 2", "Crew Ejemplo"] as const;

// Precio en centavos de MXN (evita errores de punto flotante).
// Precios vigentes actuales, sin descuento previo (confirmados con el cliente
// el 26/07/2026).
export const PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE: Record<PaqueteBase, number> = {
    COMPETIDOR: 48000, // THE BOSS ENTRY: $480.00 MXN
    PUBLICO_GENERAL: 25000, // Entrada General: $250.00 MXN
    VIP_EXPERIENCE: 50000, // VIP Experience: $500.00 MXN
    BOSS_EXPERIENCE: 96000, // Competencia + 3 workshops: $960.00 MXN
    BOSS_VIP: 150000, // THE BOSS VIP (incluye lo que antes era "Pro Package"): $1,500.00 MXN
    SOLO_WORKSHOPS: 0, // sin precio fijo, se calcula por workshop, ver calcularPrecioTotal
};

export const PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL = 25000; // $250.00 MXN c/u
export const PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3 = 60000; // $600.00 MXN por los 3 (ahorro $150)
export const PRECIO_MXN_CENTAVOS_OPEN_STYLE_ADDON = 25000; // Agregar Open Style 1 vs 1: $250.00 MXN

// --- Preventa Fundadores: 20% OFF adicional ---
// Descuento adicional del 20% sobre el total completo de la compra (cualquier
// paquete + workshops + extras), exclusivo para los primeros
// PREVENTA_CUPO_MAXIMO registros con pago confirmado, durante julio o hasta
// agotar existencias (lo que ocurra primero). Aplica a todos los paquetes, sin
// excepción (confirmado con el cliente el 26/07/2026). Ver el conteo en
// backend/src/routes/registrations.ts.
// PENDIENTE: confirmar con el cliente el año/fechas exactas si el evento se recorriera.
export const PREVENTA_FECHA_INICIO = new Date("2026-07-01T00:00:00-06:00");
export const PREVENTA_FECHA_FIN = new Date("2026-07-31T23:59:59-06:00");
export const PREVENTA_CUPO_MAXIMO = 50;
export const PREVENTA_PORCENTAJE_DESCUENTO = 0.2;

export function preventaVigentePorFecha(ahora: Date = new Date()): boolean {
    return ahora >= PREVENTA_FECHA_INICIO && ahora <= PREVENTA_FECHA_FIN;
}

// Paquetes que ya incluyen sus workshops en el precio fijo: no se les suma
// nada extra por workshopsSeleccionados.
const PAQUETES_CON_WORKSHOPS_INCLUIDOS: PaqueteBase[] = ["BOSS_EXPERIENCE", "BOSS_VIP"];

function precioWorkshops(workshopsSeleccionados: number[]): number {
    const cantidad = new Set(workshopsSeleccionados).size;
    if (cantidad >= 3) {
        return PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3;
    }
    return cantidad * PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL;
}

export interface OpcionesPrecioTotal {
    agregarOpenStyle?: boolean;
    preventaActiva?: boolean;
}

// Calcula el precio total en centavos de MXN para un paquete base + workshops
// seleccionados (add-on) + extras. Fuente de verdad de precios: siempre recalcular
// en el backend antes de crear la sesión de Stripe, nunca confiar en el total que
// mande el cliente.
export function calcularPrecioTotal(
    paqueteBase: PaqueteBase,
    workshopsSeleccionados: number[] = [],
    opciones: OpcionesPrecioTotal = {},
): number {
    let total: number;
    if (paqueteBase === "SOLO_WORKSHOPS") {
        total = precioWorkshops(workshopsSeleccionados);
    } else if (PAQUETES_CON_WORKSHOPS_INCLUIDOS.includes(paqueteBase)) {
        total = PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[paqueteBase];
    } else {
        total = PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[paqueteBase] + precioWorkshops(workshopsSeleccionados);
    }

    if (opciones.agregarOpenStyle) {
        total += PRECIO_MXN_CENTAVOS_OPEN_STYLE_ADDON;
    }

    const preventaActiva = opciones.preventaActiva ?? false;
    if (preventaActiva) {
        total = Math.round(total * (1 - PREVENTA_PORCENTAJE_DESCUENTO));
    }

    return total;
}

// --- Códigos de descuento promocionales ---
// Sensibles a mayúsculas/minúsculas. El porcentaje se aplica sobre el precio
// total ya calculado (incluye preventa y extras).
export const CODIGOS_DESCUENTO: Record<string, number> = {
    GRUPOIDEK: 0.9, // 90% de descuento
};

export function codigoDescuentoValido(codigo: string): boolean {
    return Object.prototype.hasOwnProperty.call(CODIGOS_DESCUENTO, codigo);
}

export function aplicarCodigoDescuento(precioMXNCentavos: number, codigo?: string | null): number {
    if (!codigo) return precioMXNCentavos;
    const descuento = CODIGOS_DESCUENTO[codigo];
    if (descuento === undefined) return precioMXNCentavos;
    return Math.round(precioMXNCentavos * (1 - descuento));
}
