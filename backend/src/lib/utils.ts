// tsconfig tiene exactOptionalPropertyTypes: true, así que un objeto con
// claves opcionales de zod (tipo `X | undefined`) no es asignable directo a
// los inputs de Prisma (tipo `X` en una clave `?:`). Esto quita las claves en
// `undefined` para que solo queden las que sí se van a actualizar.
export function sinIndefinidos<T extends Record<string, unknown>>(obj: T): { [K in keyof T]-?: Exclude<T[K], undefined> } {
    const limpio: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) limpio[key] = value;
    }
    return limpio as { [K in keyof T]-?: Exclude<T[K], undefined> };
}
