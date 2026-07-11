import fs from "node:fs";
import path from "node:path";

export const metadata = { title: "Reglamento Oficial — THE BOSS" };

export default function ReglamentoPage() {
    const contenido = fs.readFileSync(path.join(process.cwd(), "src/content/reglamento.md"), "utf-8");

    return (
        <main className="min-h-screen bg-boss-black px-4 py-16">
            <div className="mx-auto max-w-2xl">
                <h1 className="mb-6 font-display text-3xl uppercase tracking-wide text-white">
                    Reglamento <span className="text-boss-red">Oficial</span>
                </h1>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-boss-gray">{contenido}</p>
            </div>
        </main>
    );
}
