import fs from "node:fs";
import path from "node:path";

export const metadata = { title: "Aviso de Privacidad — THE BOSS" };

const ES_SUBTITULO = /^(\d+\.\s|Aceptación$)/;

export default function PrivacidadPage() {
    const contenido = fs.readFileSync(path.join(process.cwd(), "src/content/privacidad.md"), "utf-8");
    const bloques = contenido.trim().split(/\n\s*\n/);

    return (
        <main className="min-h-screen bg-boss-black px-4 py-16">
            <div className="mx-auto max-w-2xl">
                <h1 className="mb-6 font-display text-3xl uppercase tracking-wide text-white">
                    Aviso de <span className="text-boss-red">Privacidad</span>
                </h1>
                <div className="space-y-4">
                    {bloques.map((bloque, i) => {
                        const lineas = bloque.split("\n");
                        return (
                            <div key={i}>
                                {lineas.map((linea, j) =>
                                    ES_SUBTITULO.test(linea) ? (
                                        <p key={j} className="mb-1 text-lg font-semibold text-white">
                                            {linea}
                                        </p>
                                    ) : (
                                        <p key={j} className="whitespace-pre-wrap text-sm leading-relaxed text-boss-gray">
                                            {linea}
                                        </p>
                                    ),
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
