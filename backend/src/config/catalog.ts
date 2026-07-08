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
    | "PUBLICO_GENERAL";

export type TipoBoleto = "GENERAL" | "COMPETIDOR" | "STAFF" | "VIP" | "INVITADO";

// Rango de edad permitido por categoría. `null` en minEdad/maxEdad significa sin límite.
export const RANGOS_EDAD_POR_CATEGORIA: Record<Categoria, { minEdad: number | null; maxEdad: number | null }> = {
    KIDS_AMATEUR: { minEdad: 6, maxEdad: 12 },
    KIDS_BOYS: { minEdad: 6, maxEdad: 12 },
    KIDS_GIRL: { minEdad: 6, maxEdad: 12 },
    JUVENIL_BOYS: { minEdad: 13, maxEdad: 17 },
    JUVENIL_GIRL: { minEdad: 13, maxEdad: 17 },
    BGIRLS: { minEdad: 18, maxEdad: null },
    BBOYS: { minEdad: 18, maxEdad: null },
    MASTERS_40_PLUS: { minEdad: 40, maxEdad: null },
    PUBLICO_GENERAL: { minEdad: null, maxEdad: null },
};

// Todas las categorías salvo "Público en general" corresponden a un boleto de competidor.
export function tipoBoletoPorCategoria(categoria: Categoria): TipoBoleto {
    return categoria === "PUBLICO_GENERAL" ? "GENERAL" : "COMPETIDOR";
}

// Precio en centavos de MXN (evita errores de punto flotante). Montos genéricos, ajustar cuando se definan los reales.
export const PRECIO_MXN_CENTAVOS_POR_TIPO_BOLETO: Record<TipoBoleto, number> = {
    GENERAL: 45000, // $450.00 MXN
    COMPETIDOR: 45000, // $450.00 MXN
    STAFF: 0, // cortesía, alta manual por el admin
    VIP: 0, // cortesía, alta manual por el admin
    INVITADO: 0, // cortesía, alta manual por el admin
};
