// Sorteo aleatorio de un bracket de eliminación directa. Sin seeding (no hay
// datos de ranking/desempeño); si el número de participantes es impar, uno
// pasa directo ("bye") a la siguiente ronda sin pelear.
export function emparejarAleatorio<T>(participantes: T[]): { pares: [T, T][]; bye: T | null } {
    const mezclados = [...participantes];
    for (let i = mezclados.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = mezclados[i]!;
        mezclados[i] = mezclados[j]!;
        mezclados[j] = tmp;
    }

    const bye = mezclados.length % 2 === 1 ? (mezclados.pop() as T) : null;

    const pares: [T, T][] = [];
    for (let i = 0; i < mezclados.length; i += 2) {
        pares.push([mezclados[i]!, mezclados[i + 1]!]);
    }

    return { pares, bye };
}

// Empareja SIN sortear, en el orden en que llega la lista (índice 0 con 1, 2
// con 3, ...). Se usa desde la ronda 2 en adelante: la posición en el árbol
// ya quedó fija por el sorteo de la ronda 1, así que aquí solo se respeta esa
// posición (ganador del partido `orden=0` vs ganador del partido `orden=1`,
// etc.) para que las líneas conectoras del bracket en /pantalla sean reales.
// Si sobra uno (cantidad impar), el último de la lista es el bye.
export function emparejarPorPosicion<T>(participantes: T[]): { pares: [T, T][]; bye: T | null } {
    const bye = participantes.length % 2 === 1 ? participantes[participantes.length - 1]! : null;
    const lista = bye !== null ? participantes.slice(0, -1) : participantes;

    const pares: [T, T][] = [];
    for (let i = 0; i < lista.length; i += 2) {
        pares.push([lista[i]!, lista[i + 1]!]);
    }

    return { pares, bye };
}

const NOMBRES_DESDE_LA_FINAL = [
    "Final",
    "Semifinal",
    "Cuartos de Final",
    "Octavos de Final",
    "Dieciseisavos de Final",
    "Treintaidosavos de Final",
];

// numero: 1-indexado (ronda 1, ronda 2, ...). total: cuántas rondas tiene el
// bracket completo. Se nombra "hacia atrás" desde la final.
export function nombreRonda(numero: number, total: number): string {
    const faltan = total - numero;
    return NOMBRES_DESDE_LA_FINAL[faltan] ?? `Ronda ${numero}`;
}

export function totalRondasParaParticipantes(cantidad: number): number {
    return Math.max(1, Math.ceil(Math.log2(cantidad)));
}
