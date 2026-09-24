// Slot de una ronda: competidorB === null significa bye (competidorA avanza
// automático sin pelear). Se usa un solo tipo para todos los emparejadores
// para que el orden de la lista (índice 0, 1, 2...) sea siempre el orden real
// de posición en el árbol del bracket — de eso depende que las rondas
// siguientes (ver emparejarPorPosicion / intentarAvanzarRonda en
// backend/src/routes/competencia.ts) conecten con el partido correcto.
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

// La potencia de 2 más GRANDE de `opciones` que no exceda `n`. Se usa para el
// corte automático de la fase de Preselección (Top 16 / Top 32 estilo Red
// Bull BC One): nunca corta a más gente de la que realmente se anotó y
// calificó. Devuelve null si ni la opción más chica cabe (ej. n=3 con
// opciones [4,8,16,32,64]) — en ese caso no aplica preselección, se usa el
// sorteo directo (generar-bracket) para esa categoría.
export function potenciaDe2MasGrandeQueNoExceda(n: number, opciones: number[]): number | null {
    const validas = opciones.filter((o) => o <= n);
    if (validas.length === 0) return null;
    return Math.max(...validas);
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

// Empareja SIN sortear, en el orden en que llega la lista (índice 0 con 1, 2
// con 3, ...). Se usa desde la ronda 2 en adelante: la posición en el árbol
// ya quedó fija en la ronda 1 (por sorteo o por seeding de preselección), así
// que aquí solo se respeta esa posición (ganador del partido `orden=0` vs
// ganador del partido `orden=1`, etc.) para que las líneas conectoras del
// bracket en /pantalla sean reales. Ya no debería recibir una cantidad impar
// (la ronda 1 siempre entrega una cantidad que es potencia de 2), pero se
// deja el manejo de bye por si acaso.
export function emparejarPorPosicion<T>(participantes: T[]): EmparejamientoSlot<T>[] {
    const slots: EmparejamientoSlot<T>[] = [];
    for (let i = 0; i < participantes.length; i += 2) {
        slots.push({ competidorA: participantes[i]!, competidorB: participantes[i + 1] ?? null });
    }
    return slots;
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
