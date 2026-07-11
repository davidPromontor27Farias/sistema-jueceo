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
    | "PRO_PACKAGE"
    | "SOLO_WORKSHOPS";

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
    PUBLICO_GENERAL: "Público General",
    VIP_EXPERIENCE: "VIP Experience",
    BOSS_EXPERIENCE: "The Boss Experience",
    BOSS_VIP: "The Boss VIP",
    PRO_PACKAGE: "Pro Package",
    SOLO_WORKSHOPS: "Training Pass",
};

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
// Montos tomados del documento de mejoras del cliente.
export const PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE: Record<PaqueteBase, number> = {
    COMPETIDOR: 60000, // THE BOSS ENTRY: $600.00 MXN
    PUBLICO_GENERAL: 25000, // Entrada público general: $250.00 MXN
    VIP_EXPERIENCE: 40000, // VIP Experience: $400.00 MXN
    BOSS_EXPERIENCE: 110000, // Competencia + 3 workshops: $1,100.00 MXN
    BOSS_VIP: 25000, // THE BOSS VIP: $250.00 MXN
    PRO_PACKAGE: 150000, // Pro Package: $1,500.00 MXN
    SOLO_WORKSHOPS: 0, // sin precio fijo, se calcula por workshop, ver calcularPrecioTotal
};

export const PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL = 25000; // $250.00 MXN c/u
export const PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3 = 60000; // $600.00 MXN por los 3

// Paquetes que ya incluyen sus workshops en el precio fijo: no se les suma
// nada extra por workshopsSeleccionados.
const PAQUETES_CON_WORKSHOPS_INCLUIDOS: PaqueteBase[] = ["BOSS_EXPERIENCE", "BOSS_VIP", "PRO_PACKAGE"];

function precioWorkshops(workshopsSeleccionados: number[]): number {
    const cantidad = new Set(workshopsSeleccionados).size;
    if (cantidad >= 3) return PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3;
    return cantidad * PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL;
}

// Calcula el precio total en centavos de MXN para un paquete base + workshops
// seleccionados (add-on). Fuente de verdad de precios: siempre recalcular en el
// backend antes de crear la sesión de Stripe, nunca confiar en el total que mande el cliente.
export function calcularPrecioTotal(paqueteBase: PaqueteBase, workshopsSeleccionados: number[] = []): number {
    const precioBase = PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE[paqueteBase];

    if (paqueteBase === "SOLO_WORKSHOPS") {
        return precioWorkshops(workshopsSeleccionados);
    }

    if (PAQUETES_CON_WORKSHOPS_INCLUIDOS.includes(paqueteBase)) {
        return precioBase;
    }

    return precioBase + precioWorkshops(workshopsSeleccionados);
}
