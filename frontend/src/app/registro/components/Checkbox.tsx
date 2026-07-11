import type { InputHTMLAttributes, ReactNode } from "react";

export function Checkbox({
    label,
    error,
    ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }) {
    return (
        <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-boss-red" {...props} />
            <span className="text-sm text-foreground">
                {label}
                {error && <span className="mt-1 block text-xs font-medium text-red-400">{error}</span>}
            </span>
        </label>
    );
}
