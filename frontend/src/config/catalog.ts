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
    | "SOLO_WORKSHOPS";

export type TipoParticipacion = "COMPETIDOR" | "PUBLICO";

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

// Comentario informativo con el rango de edad (o requisito) de cada categoría,
// mostrado junto al nombre en el selector de categorías. Las categorías no
// listadas aquí (Masters, Público general, Open Style) no llevan comentario.
export const CATEGORIAS_COMENTARIO: Partial<Record<Categoria, string>> = {
    KIDS_AMATEUR: "Hasta 2 años entrenando",
    KIDS_BOYS: "Hasta 13 años",
    KIDS_GIRL: "Hasta 13 años",
    JUVENIL_BOYS: "14 a 17 años",
    JUVENIL_GIRL: "14 a 17 años",
    BGIRLS: "18 a 39 años",
    BBOYS: "18 a 39 años",
};

export const PAQUETES_BASE: Record<PaqueteBase, string> = {
    COMPETIDOR: "The Boss Entry",
    PUBLICO_GENERAL: "Entrada General",
    VIP_EXPERIENCE: "VIP Experience",
    BOSS_EXPERIENCE: "The Boss Experience",
    BOSS_VIP: "The Boss VIP",
    SOLO_WORKSHOPS: "Training Pass",
};

export const PAQUETES_BASE_DESCRIPCION: Record<PaqueteBase, string> = {
    COMPETIDOR:
        "Incluye: Inscripción a 1 categoría, acceso como competidor, QR personal e intransferible, perfil y foto en plataforma.",
    PUBLICO_GENERAL: "Acceso como espectador.",
    VIP_EXPERIENCE: "Entrada General / Meet & Greet / Fotografía oficial / Zona preferente / Bebida energetizante.",
    BOSS_EXPERIENCE: "Inscripción a 1 categoría de breaking + los 3 workshops.",
    BOSS_VIP:
        "Inscripción a 1 categoría + 3 workshops / Meet & Greet / Foto profesional / Fila rápida / Poster oficial / Lanyard VIP / Zona preferencial / Playera oficial / Bebida energetizante.",
    SOLO_WORKSHOPS: "Solo workshops, sin competencia: elige 1, 2 o los 3.",
};

// Paquetes que solo puede elegir quien se registra como competidor.
export const PAQUETES_COMPETIDOR: PaqueteBase[] = ["COMPETIDOR", "BOSS_EXPERIENCE", "BOSS_VIP", "SOLO_WORKSHOPS"];

// Paquetes que solo puede elegir quien se registra como público.
export const PAQUETES_PUBLICO: PaqueteBase[] = ["PUBLICO_GENERAL", "VIP_EXPERIENCE"];

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
export const ACADEMIAS_CONOCIDAS = [
    "Axolobreak",
    "BDM",
    "Cerro del Poder",
    "DLC Crew",
    "Free Step Rockers",
    "Fuckin Flavor",
    "Gravedad Zero",
    "Grizzlee",
    "Hoolokunz",
    "Indígenas Rocker",
    "Kadetes del Toke",
    "La Vieja Nueva",
    "Loyalty Crew",
    "Mejor Baila",
    "Mexas",
    "Nunca muere",
    "Other Side",
    "Papyrikis",
    "Raro Villano",
    "Revolución Urbana",
    "Spin Máster",
    "Twisted Flavor",
    "Unik Breakers",
    "Xhotaz Killa",
] as const;

// Precio en centavos de MXN. Debe coincidir exactamente con backend/src/config/catalog.ts
// (el backend siempre recalcula el total; esto solo es para mostrarlo en el formulario).
export const PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE: Record<PaqueteBase, number> = {
    COMPETIDOR: 60000,
    PUBLICO_GENERAL: 25000,
    VIP_EXPERIENCE: 50000,
    BOSS_EXPERIENCE: 120000,
    BOSS_VIP: 150000,
    SOLO_WORKSHOPS: 0,
};

export const PRECIO_MXN_CENTAVOS_WORKSHOP_INDIVIDUAL = 25000;
export const PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3 = 60000;
export const PRECIO_MXN_CENTAVOS_OPEN_STYLE_ADDON = 25000;

// --- Preventa Fundadores: 20% OFF ---
// Aplica solo a The Boss Entry, The Boss Experience, Entrada General y al bundle
// de 3 workshops. Únicamente a los primeros 50 lugares, durante julio o hasta
// agotar existencias (lo que ocurra primero). El cupo real solo lo valida el
// backend (ver backend/src/routes/registrations.ts); aquí solo se aproxima por
// fecha para mostrar el precio en el formulario.
export const PREVENTA_FECHA_INICIO = new Date("2026-07-01T00:00:00-06:00");
export const PREVENTA_FECHA_FIN = new Date("2026-07-31T23:59:59-06:00");
export const PREVENTA_CUPO_MAXIMO = 50;

export const PAQUETES_CON_PREVENTA: PaqueteBase[] = ["COMPETIDOR", "BOSS_EXPERIENCE", "PUBLICO_GENERAL"];

export const PRECIO_MXN_CENTAVOS_POR_PAQUETE_BASE_PREVENTA: Partial<Record<PaqueteBase, number>> = {
    COMPETIDOR: 48000,
    BOSS_EXPERIENCE: 96000,
    PUBLICO_GENERAL: 20000,
};

export const PRECIO_MXN_CENTAVOS_WORKSHOP_BUNDLE_3_PREVENTA = 48000;

export function preventaVigentePorFecha(ahora: Date = new Date()): boolean {
    return ahora >= PREVENTA_FECHA_INICIO && ahora <= PREVENTA_FECHA_FIN;
}

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

// Solo para mostrar el total en vivo en el formulario; el backend es la fuente de verdad.
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

export function formatearMXN(centavos: number): string {
    return (centavos / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
