import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import QrStatus from "./QrStatus";

export default function RegistroExitoPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-boss-black px-4 py-16 text-center">
            <Image src="/the-boss-logo.png" alt="THE BOSS — Breaking Battles" width={160} height={133} />
            <h1 className="mt-6 font-display text-3xl uppercase tracking-wide text-boss-green">
                ¡Pago confirmado!
            </h1>
            <Suspense
                fallback={
                    <p className="mt-3 max-w-md text-boss-gray">Confirmando tu pago con Stripe...</p>
                }
            >
                <QrStatus />
            </Suspense>
            <Link
                href="/registro"
                className="mt-8 rounded-md border border-boss-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-red hover:text-boss-red"
            >
                Registrar a otra persona
            </Link>
        </main>
    );
}
