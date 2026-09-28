import { prisma } from "./prisma";

// Si el sistema completo (Preselección, Jueceo, Brackets, Pantalla, Tablero,
// Control de Accesos) debe operar sobre los registros del Evento de Prueba
// (Registration.esPrueba: true) o sobre los reales pagados con Stripe. Se
// consulta en cada request que lo necesite (tráfico bajo, evita cualquier
// caché desactualizada si alguien cambia el interruptor a media prueba) —
// ver ConfiguracionEvento en el schema y PATCH /api/configuracion-evento.
export async function modoPruebaActivo(): Promise<boolean> {
    const config = await prisma.configuracionEvento.findUnique({ where: { id: 1 } });
    return config?.modoPrueba ?? false;
}
