import type { ReactNode } from "react";

export const inputClass =
    "w-full rounded-md border border-boss-border bg-boss-panel px-3 py-2.5 text-foreground placeholder:text-boss-gray focus:border-boss-red focus:outline-none focus:ring-2 focus:ring-boss-red/40 transition-colors";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-boss-gray">
                <span className="h-3 w-[3px] shrink-0 bg-boss-red" />
                {label}
            </span>
            {children}
            {hint && !error && <span className="mt-1 block text-xs text-boss-gray">{hint}</span>}
            {error && <span className="mt-1 block text-xs font-medium text-red-400">{error}</span>}
        </label>
    );
}
