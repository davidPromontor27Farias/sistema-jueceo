import Link from "next/link";
import Image from "next/image";

export default function RegistroCanceladoPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-boss-black px-4 py-16 text-center">
            <Image src="/the-boss-logo.png" alt="THE BOSS — Breaking Battles" width={160} height={133} />
            <h1 className="mt-6 font-display text-3xl uppercase tracking-wide text-boss-red">
                Pago cancelado
            </h1>
            <p className="mt-3 max-w-md text-boss-gray">
                No se completó el pago. Puedes intentar de nuevo cuando quieras.
            </p>
            <Link
                href="/registro"
                className="mt-8 rounded-md bg-boss-red px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark"
            >
                Volver al formulario
            </Link>
        </main>
    );
}
