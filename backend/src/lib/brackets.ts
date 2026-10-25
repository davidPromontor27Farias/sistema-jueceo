// Slot de una ronda: competidorB === null significa bye (competidorA avanza
// automático sin pelear). competidorA siempre es el mejor sembrado/puntaje
// de la pareja — filasParaRonda (backend/src/routes/competencia.ts) invierte
// esto a propósito al guardarlo en la base, porque ahí competidorA = lado
// azul = quien inicia, y el reglamento dice que inicia el más débil (ver
// Lado azul y lado rojo).
export interface EmparejamientoSlot<T> {
    competidorA: T;
    competidorB: T | null;
}

// La potencia de 2 más chica que alcanza para acomodar `n` participantes.
export function siguientePotenciaDe2(n: number): number {
    let potencia = 1;
    while (potencia < n) potencia *= 2;
    return potencia;
}

// Tamaño del Top Bracket automático de la fase de Preselección, por rangos
// fijos del total de competidores calificados (no la potencia de 2 más
// grande que quepa — un Top Bracket de 16 para 21+ competidores es mucho más
// manejable en escenario que, por ejemplo, 32). Devuelve null si ni el rango
// más chico (3 a 7) alcanza — en ese caso no aplica preselección, se usa el
// sorteo directo (generar-bracket) para esa categoría.
//   21 en adelante -> 16
//   13 a 20        -> 8
//   8 a 12         -> 4
//   3 a 7          -> 2
export function tamanoTopBracketPreseleccion(n: number): number | null {
    if (n >= 21) return 16;
    if (n >= 13) return 8;
    if (n >= 8) return 4;
    if (n >= 3) return 2;
    return null;
}

// Orden de siembra estándar de torneo (1 vs size, 2 vs size-1, ... para la
// ronda 1, pero posicionados en el árbol para que los seeds 1 y 2 no puedan
// enfrentarse hasta la final). Recursivo: ordenSiembra(2n) intercala cada
// seed de ordenSiembra(n) con su espejo (2n+1-s).
function ordenSiembra(size: number): number[] {
    if (size <= 1) return [1];
    const mitad = ordenSiembra(size / 2);
    const resultado: number[] = [];
    for (const s of mitad) {
        resultado.push(s, size + 1 - s);
    }
    return resultado;
}

// Empareja una lista YA ORDENADA de mejor a peor (seed 1 = participantes[0])
// aplicando el seeding estándar de torneo, con bye automático para los
// mejores seeds cuando `participantesOrdenados.length` no es potencia de 2.
// A diferencia del emparejamiento viejo (un solo bye, arrastrado ronda tras
// ronda), aquí TODOS los byes de la ronda quedan resueltos de una vez: el
// tamaño del árbol es siempre la potencia de 2 más chica que alcanza, así que
// la ronda 2 en adelante recibe una cantidad que ya es potencia de 2.
//
// Nota: el primer elemento de cada pareja (orden[i]) siempre es un seed real
// (nunca bye), porque el tamaño del árbol es la potencia de 2 más chica que
// alcanza para `n` participantes: eso garantiza n > size/2, y todo seed
// <= size/2 (que es justo el primer elemento de cada pareja en ordenSiembra)
// cae dentro de ese rango.
export function emparejarConSiembra<T>(participantesOrdenados: T[]): EmparejamientoSlot<T>[] {
    const n = participantesOrdenados.length;
    if (n === 0) return [];
    const size = siguientePotenciaDe2(n);
    const orden = ordenSiembra(size);
    const porSeed = (seed: number): T | null => (seed <= n ? participantesOrdenados[seed - 1]! : null);

    const slots: EmparejamientoSlot<T>[] = [];
    for (let i = 0; i < orden.length; i += 2) {
        const a = porSeed(orden[i]!);
        const b = porSeed(orden[i + 1]!);
        slots.push({ competidorA: a as T, competidorB: b });
    }
    return slots;
}

// Sorteo aleatorio de un bracket de eliminación directa (no hay ranking de
// desempeño): se baraja y se delega el armado de byes/seeding a
// emparejarConSiembra, así que igual queda resuelto todo en una sola ronda.
export function emparejarAleatorio<T>(participantes: T[]): EmparejamientoSlot<T>[] {
    const mezclados = [...participantes];
    for (let i = mezclados.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = mezclados[i]!;
        mezclados[i] = mezclados[j]!;
        mezclados[j] = tmp;
    }
    return emparejarConSiembra(mezclados);
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

// Reparte una lista YA ORDENADA (por orden de registro) en `n` lotes
// contiguos lo más parejos posible, para la Preselección Paralela
// Multiescenario (ver POST /categorias/:categoria/preseleccion/iniciar): el
// lote 0 corresponde al escenario de menor `orden`, y así sucesivamente. El
// sobrante de una división no exacta (ej. 61 ÷ 3 = 20 con 1 sobrante) se
// reparte de a uno extra a los primeros lotes, para que ningún escenario
// quede con más de 1 competidor de diferencia respecto a otro.
export function repartirEnLotes<T>(idsOrdenados: T[], n: number): T[][] {
    if (n <= 0) return [];
    const base = Math.floor(idsOrdenados.length / n);
    const sobrante = idsOrdenados.length % n;

    const lotes: T[][] = [];
    let cursor = 0;
    for (let i = 0; i < n; i++) {
        const tamano = base + (i < sobrante ? 1 : 0);
        lotes.push(idsOrdenados.slice(cursor, cursor + tamano));
        cursor += tamano;
    }
    return lotes;
}
