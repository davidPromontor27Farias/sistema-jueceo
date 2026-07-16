import fs from "node:fs";
import path from "node:path";

export const metadata = { title: "Reglamento Oficial — THE BOSS" };

function esFilaSeparadora(fila: string) {
    return fila
        .split("|")
        .every((celda) => /^\s*:?-+:?\s*$/.test(celda));
}

function renderBloques(contenido: string) {
    const lineas = contenido.trim().split("\n");
    const bloques: React.ReactNode[] = [];

    let i = 0;
    let key = 0;

    while (i < lineas.length) {
        const linea = lineas[i];

        if (linea.trim() === "") {
            i++;
            continue;
        }

        const heading = linea.match(/^##\s+(.*)$/);
        if (heading) {
            bloques.push(
                <h2 key={key++} className="mt-6 text-lg font-semibold text-white">
                    {heading[1]}
                </h2>,
            );
            i++;
            continue;
        }

        const bold = linea.match(/^\*\*(.*)\*\*$/);
        if (bold) {
            bloques.push(
                <p key={key++} className="mt-3 text-base font-semibold text-white">
                    {bold[1]}
                </p>,
            );
            i++;
            continue;
        }

        if (linea.startsWith("- ")) {
            const items: string[] = [];
            while (i < lineas.length && lineas[i].startsWith("- ")) {
                items.push(lineas[i].slice(2));
                i++;
            }
            bloques.push(
                <ul key={key++} className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-boss-gray">
                    {items.map((item, idx) => (
                        <li key={idx}>{item}</li>
                    ))}
                </ul>,
            );
            continue;
        }

        if (linea.startsWith("|") && linea.endsWith("|")) {
            const filas: string[][] = [];
            while (i < lineas.length && lineas[i].startsWith("|") && lineas[i].endsWith("|")) {
                const fila = lineas[i].slice(1, -1);
                if (!esFilaSeparadora(fila)) {
                    filas.push(fila.split("|").map((celda) => celda.trim()));
                }
                i++;
            }
            const [encabezado, ...resto] = filas;
            bloques.push(
                <div key={key++} className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr>
                                {encabezado.map((celda, idx) => (
                                    <th
                                        key={idx}
                                        className="border-b border-boss-border px-2 py-2 font-semibold text-white"
                                    >
                                        {celda}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {resto.map((fila, filaIdx) => (
                                <tr key={filaIdx}>
                                    {fila.map((celda, celdaIdx) => (
                                        <td
                                            key={celdaIdx}
                                            className="border-b border-boss-border/50 px-2 py-2 align-top text-boss-gray"
                                        >
                                            {celda}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>,
            );
            continue;
        }

        bloques.push(
            <p key={key++} className="text-sm leading-relaxed text-boss-gray">
                {linea}
            </p>,
        );
        i++;
    }

    return bloques;
}

export default function ReglamentoPage() {
    const contenido = fs.readFileSync(path.join(process.cwd(), "src/content/reglamento.md"), "utf-8");

    return (
        <main className="min-h-screen bg-boss-black px-4 py-16">
            <div className="mx-auto max-w-2xl">
                <h1 className="mb-6 font-display text-3xl uppercase tracking-wide text-white">
                    Reglamento <span className="text-boss-red">Oficial</span>
                </h1>
                <div className="space-y-2">{renderBloques(contenido)}</div>
            </div>
        </main>
    );
}
