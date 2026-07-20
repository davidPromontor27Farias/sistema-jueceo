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
    | "SOLO_WORKSHOPS"
    | "PRUEBA_PAGO";

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
    // TEMPORAL: solo para probar el flujo de pago en producción.
    PRUEBA_PAGO: "Prueba de Pago ($10 MXN)",
};

// Paquetes que solo puede elegir quien se registra como competidor.
// PRUEBA_PAGO es temporal: mismo paquete de $10 MXN de pruebas, habilitado
// también aquí para validar el flujo de pago de competidores. Quitar de aquí
// una vez confirmado.
export const PAQUETES_COMPETIDOR: PaqueteBase[] = [
    "COMPETIDOR",
    "BOSS_EXPERIENCE",
    "BOSS_VIP",
    "SOLO_WORKSHOPS",
    "PRUEBA_PAGO",
];

// Paquetes que solo puede elegir quien se registra como público.
// PRUEBA_PAGO es temporal: paquete de $10 MXN para validar el flujo de pago
// en producción. Quitar de aquí (y de PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE /
// PAQUETES_BASE_LABEL) una vez confirmado.
export const PAQUETES_PUBLICO: PaqueteBase[] = ["PUBLICO_GENERAL", "VIP_EXPERIENCE", "PRUEBA_PAGO"];

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

// PENDIENTE: confirmar prefijos finales con el cliente. Se usan para el ID fijo de
// competidor (ej. "BB-023") asignado al confirmarse el pago, ver backend/src/routes/stripeWebhook.ts
export const PREFIJO_ID_POR_CATEGORIA: Record<Categoria, string> = {
    KIDS_AMATEUR: "KA",
    KIDS_BOYS: "KB",
    KIDS_GIRL: "KG",
    JUVENIL_BOYS: "JB",
    JUVENIL_GIRL: "JG",
    BGIRLS: "BG",
    BBOYS: "BB",
    MASTERS_40_PLUS: "MS",
    PUBLICO_GENERAL: "PG",
    OPEN_STYLE_1V1: "OS",
};

// PENDIENTE: lista real de academias/crews del cliente. Placeholder de ejemplo
// para el picklist con opción "Otra... (escribir)" en el formulario.
export const ACADEMIAS_CONOCIDAS = ["Academia Ejemplo 1", "Academia Ejemplo 2", "Crew Ejemplo"] as const;

// Precio en centavos de MXN (evita errores de punto flotante).
// Montos tomados del documento de mejoras del cliente (Mejoras_v3).
export const PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE: Record<PaqueteBase, number> = {
    COMPETIDOR: 60000, // THE BOSS ENTRY: $600.00 MXN
    PUBLICO_GENERAL: 25000, // Entrada General: $250.00 MXN
    VIP_EXPERIENCE: 50000, // VIP Experience: $500.00 MXN
    BOSS_EXPERIENCE: 120000, // Competencia + 3 workshops: $1,200.00 MXN
    BOSS_VIP: 150000, // THE BOSS VIP (incluye lo que antes era "Pro Package"): $1,500.00 MXN
    SOLO_WORKSHOPS: 0, // sin precio fijo, se calcula por workshop, ver calcularPrecioTotal
    PRUEBA_PAGO: 1000, // TEMPORAL: $10.00 MXN (mínimo permitido por Stripe para MXN), solo para probar el flujo de pago en producción
};

export const PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL = 25000; // $250.00 MXN c/u
export const PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3 = 60000; // $600.00 MXN por los 3 (ahorro $150)
export const PRECIO_MXN_CENTAVOS_OPEN_STYLE_ADDON = 25000; // Agregar Open Style 1 vs 1: $250.00 MXN

// --- Preventa Fundadores: 20% OFF ---
// Aplica solo a The Boss Entry, The Boss Experience, Entrada General y al bundle
// de 3 workshops. Únicamente a los primeros 50 lugares, durante julio o hasta
// agotar existencias (lo que ocurra primero). Ver PREVENTA_CUPO_MAXIMO y el
// conteo en backend/src/routes/registrations.ts.
// PENDIENTE: confirmar con el cliente el año/fechas exactas si el evento se recorriera.
export const PREVENTA_FECHA_INICIO = new Date("2026-07-01T00:00:00-06:00");
export const PREVENTA_FECHA_FIN = new Date("2026-07-31T23:59:59-06:00");
export const PREVENTA_CUPO_MAXIMO = 50;

export const PAQUETES_CON_PREVENTA: PaqueteBase[] = ["COMPETIDOR", "BOSS_EXPERIENCE", "PUBLICO_GENERAL"];

export const PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE_PREVENTA: Partial<Record<PaqueteBase, number>> = {
    COMPETIDOR: 48000, // $600 -> $480
    BOSS_EXPERIENCE: 96000, // $1,200 -> $960
    PUBLICO_GENERAL: 20000, // $250 -> $200
};

export const PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3_PREVENTA = 48000; // $600 -> $480 (solo al elegir los 3)

export function preventaVigentePorFecha(ahora: Date = new Date()): boolean {
    return ahora >= PREVENTA_FECHA_INICIO && ahora <= PREVENTA_FECHA_FIN;
}

// Paquetes que ya incluyen sus workshops en el precio fijo: no se les suma
// nada extra por workshopsSeleccionados.
const PAQUETES_CON_WORKSHOPS_INCLUIDOS: PaqueteBase[] = ["BOSS_EXPERIENCE", "BOSS_VIP"];

function precioBaseEfectivo(paqueteBase: PaqueteBase, preventaActiva: boolean): number {
    if (preventaActiva && PAQUETES_CON_PREVENTA.includes(paqueteBase)) {
        return PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE_PREVENTA[paqueteBase] ?? PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[paqueteBase];
    }
    return PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[paqueteBase];
}

function precioWorkshops(workshopsSeleccionados: number[], preventaActiva: boolean): number {
    const cantidad = new Set(workshopsSeleccionados).size;
    if (cantidad >= 3) {
        return preventaActiva ? PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3_PREVENTA : PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3;
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
    const preventaActiva = opciones.preventaActiva ?? false;
    const precioBase = precioBaseEfectivo(paqueteBase, preventaActiva);

    let total: number;
    if (paqueteBase === "SOLO_WORKSHOPS") {
        total = precioWorkshops(workshopsSeleccionados, preventaActiva);
    } else if (PAQUETES_CON_WORKSHOPS_INCLUIDOS.includes(paqueteBase)) {
        total = precioBase;
    } else {
        total = precioBase + precioWorkshops(workshopsSeleccionados, preventaActiva);
    }

    if (opciones.agregarOpenStyle) {
        total += PRECIO_MXN_CENTAVOS_OPEN_STYLE_ADDON;
    }

    return total;
}
