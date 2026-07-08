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
};

// Debe coincidir exactamente con backend/src/config/catalog.ts
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
