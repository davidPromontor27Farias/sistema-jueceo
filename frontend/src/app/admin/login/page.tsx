"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { login } from "@/lib/adminApi";
import { inputClass, Field } from "../../registro/components/Field";

export default function AdminLoginPage() {
    const router = useRouter();
    const [correo, setCorreo] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setEnviando(true);

        const resultado = await login(correo, password);

        if (!resultado.ok) {
            setError(resultado.error);
            setEnviando(false);
            return;
        }

        router.replace("/admin");
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-boss-black px-4 py-16">
            <Image src="/the-boss-logo.png" alt="THE BOSS — Breaking Battles" width={140} height={116} priority />

            <h1 className="mt-6 font-display text-2xl uppercase tracking-wide text-white">Panel de administración</h1>

            <form
                onSubmit={onSubmit}
                className="mt-8 w-full max-w-sm space-y-4 rounded-xl border border-boss-border bg-boss-panel/60 p-6 shadow-2xl shadow-black/60"
            >
                {error && (
                    <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300">
                        {error}
                    </p>
                )}

                <Field label="Correo">
                    <input
                        type="email"
                        required
                        autoComplete="username"
                        value={correo}
                        onChange={(event) => setCorreo(event.target.value)}
                        className={inputClass}
                    />
                </Field>

                <Field label="Contraseña">
                    <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className={inputClass}
                    />
                </Field>

                <button
                    type="submit"
                    disabled={enviando}
                    className="w-full rounded-md bg-boss-red px-4 py-3 font-display text-lg uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {enviando ? "Entrando..." : "Entrar"}
                </button>
            </form>
        </main>
    );
}
