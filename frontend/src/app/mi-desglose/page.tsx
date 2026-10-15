import MiDesgloseContenido from "./MiDesgloseContenido";

// Página pública (sin login): búsqueda abierta por nombre de competidor
// (Bboy/Bgirl name) — ya es información pública, igual que en el bracket y
// /resultados. Muestra el desglose detallado por rubro (Técnica, Ejecución,
// Vocabulario, Musicalidad, Originalidad) de la Preselección y de cada
// batalla ya finalizada de quien se busque — ver Consulta individual de
// desglose. La pantalla pública y /resultados solo muestran el puntaje
// total, nunca el desglose por rubro; este es el único lugar que lo expone.
export default function MiDesglosePage() {
    return (
        <main className="flex min-h-screen flex-col items-center bg-boss-black px-4 py-6 text-center">
            <h1 className="shrink-0 font-display text-xl uppercase tracking-widest text-boss-red">Mi desglose</h1>
            <p className="mt-2 max-w-md text-sm text-boss-gray">
                Busca tu calificación detallada por rubro con tu nombre de competidor.
            </p>
            <MiDesgloseContenido />
        </main>
    );
}
