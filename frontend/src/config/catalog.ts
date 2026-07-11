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

// Lista corta de referencia para el selector de nacionalidad; incluye las más
// comunes para un evento en México y deja "Otra" para escribir manualmente.
export const NACIONALIDADES = [
    "Mexicana",
    "Estadounidense",
    "Canadiense",
    "Colombiana",
    "Argentina",
    "Brasileña",
    "Española",
    "Otra",
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

export type PaqueteBase =
    | "COMPETIDOR"
    | "PUBLICO_GENERAL"
    | "VIP_EXPERIENCE"
    | "BOSS_EXPERIENCE"
    | "BOSS_VIP"
    | "PRO_PACKAGE"
    | "SOLO_WORKSHOPS";

// Etiqueta legible para mostrar en el <select>; el valor enviado al backend es la clave.
export const CATEGORIAS: Record<Categoria, string> = {
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

export const PAQUETES_BASE: Record<PaqueteBase, string> = {
    COMPETIDOR: "The Boss Entry",
    PUBLICO_GENERAL: "Público General",
    VIP_EXPERIENCE: "VIP Experience",
    BOSS_EXPERIENCE: "The Boss Experience",
    BOSS_VIP: "The Boss VIP",
    PRO_PACKAGE: "Pro Package",
    SOLO_WORKSHOPS: "Training Pass",
};

// Debe coincidir exactamente con backend/src/config/catalog.ts
// PENDIENTE: confirmar con el cliente la matriz completa de reglas sexo+edad.
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

// PENDIENTE: lista real de academias/crews del cliente. Debe coincidir con
// backend/src/config/catalog.ts (aquí solo se usa para el picklist).
export const ACADEMIAS_CONOCIDAS = ["Academia Ejemplo 1", "Academia Ejemplo 2", "Crew Ejemplo"] as const;

// Precio en centavos de MXN. Debe coincidir exactamente con backend/src/config/catalog.ts
// (el backend siempre recalcula el total; esto solo es para mostrarlo en el formulario).
export const PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE: Record<PaqueteBase, number> = {
    COMPETIDOR: 60000,
    PUBLICO_GENERAL: 25000,
    VIP_EXPERIENCE: 40000,
    BOSS_EXPERIENCE: 110000,
    BOSS_VIP: 25000,
    PRO_PACKAGE: 150000,
    SOLO_WORKSHOPS: 0,
};

export const PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL = 25000;
export const PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3 = 60000;

const PAQUETES_CON_WORKSHOPS_INCLUIDOS: PaqueteBase[] = ["BOSS_EXPERIENCE", "BOSS_VIP", "PRO_PACKAGE"];

function precioWorkshops(workshopsSeleccionados: number[]): number {
    const cantidad = new Set(workshopsSeleccionados).size;
    if (cantidad >= 3) return PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3;
    return cantidad * PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL;
}

// Solo para mostrar el total en vivo en el formulario; el backend es la fuente de verdad.
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

export function formatearMXN(centavos: number): string {
    return (centavos / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
