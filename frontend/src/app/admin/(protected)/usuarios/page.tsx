"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireRol } from "../layout";
import { inputClass, Field } from "../../../registro/components/Field";
import {
    createAdmin,
    listAdmins,
    updateAdmin,
    type AdminInfo,
    type RolAdmin,
} from "@/lib/adminApi";

const ROL_LABEL: Record<RolAdmin, string> = {
    SUPER_ADMIN: "Admin total",
    STAFF_ACCESO: "Staff de acceso",
    STAFF_JUECEO: "Staff de jueceo",
};
const ROLES: RolAdmin[] = ["SUPER_ADMIN", "STAFF_ACCESO", "STAFF_JUECEO"];

export default function AdminUsuariosPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN"]}>
            <UsuariosContenido />
        </RequireRol>
    );
}

function UsuariosContenido() {
    const [admins, setAdmins] = useState<AdminInfo[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const recargar = async () => {
        const resultado = await listAdmins();
        if (resultado.ok) {
            setAdmins(resultado.data.admins);
            setError(null);
        } else {
            setError(resultado.error);
        }
    };

    useEffect(() => {
        let cancelado = false;
        listAdmins().then((resultado) => {
            if (cancelado) return;
            if (resultado.ok) {
                setAdmins(resultado.data.admins);
                setError(null);
            } else {
                setError(resultado.error);
            }
        });
        return () => {
            cancelado = true;
        };
    }, []);

    return (
        <div>
            <h1 className="font-display text-2xl uppercase tracking-wide text-white">Usuarios de staff</h1>
            <p className="mt-1 text-boss-gray">Crea cuentas para el staff de acceso y de jueceo del evento.</p>

            {error && (
                <p className="mt-4 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300">
                    {error}
                </p>
            )}

            <FormularioNuevoAdmin onCreado={recargar} />

            <div className="mt-8 space-y-3">
                {admins === null && <p className="text-boss-gray">Cargando...</p>}
                {admins?.map((admin) => (
                    <FilaAdmin key={admin.id} admin={admin} onCambio={recargar} />
                ))}
            </div>
        </div>
    );
}

function FormularioNuevoAdmin({ onCreado }: { onCreado: () => void }) {
    const [nombre, setNombre] = useState("");
    const [correo, setCorreo] = useState("");
    const [password, setPassword] = useState("");
    const [rol, setRol] = useState<RolAdmin>("STAFF_ACCESO");
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setEnviando(true);

        const resultado = await createAdmin({ nombre, correo, password, rol });
        setEnviando(false);

        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }

        setNombre("");
        setCorreo("");
        setPassword("");
        setRol("STAFF_ACCESO");
        onCreado();
    };

    return (
        <form
            onSubmit={onSubmit}
            className="mt-6 grid gap-4 rounded-lg border border-boss-border bg-boss-panel/60 p-5 sm:grid-cols-2"
        >
            <h2 className="font-display text-lg uppercase tracking-wide text-white sm:col-span-2">Nueva cuenta</h2>

            {error && (
                <p className="rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm font-medium text-red-300 sm:col-span-2">
                    {error}
                </p>
            )}

            <Field label="Nombre">
                <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Correo">
                <input
                    type="email"
                    required
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    className={inputClass}
                />
            </Field>
            <Field label="Contraseña" hint="Al menos 8 caracteres">
                <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                />
            </Field>
            <Field label="Rol">
                <select value={rol} onChange={(e) => setRol(e.target.value as RolAdmin)} className={inputClass}>
                    {ROLES.map((r) => (
                        <option key={r} value={r}>
                            {ROL_LABEL[r]}
                        </option>
                    ))}
                </select>
            </Field>

            <button
                type="submit"
                disabled={enviando}
                className="rounded-md bg-boss-red px-4 py-2.5 font-display text-base uppercase tracking-wider text-white transition-colors hover:bg-boss-red-dark disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
            >
                {enviando ? "Creando..." : "Crear cuenta"}
            </button>
        </form>
    );
}

function FilaAdmin({ admin, onCambio }: { admin: AdminInfo; onCambio: () => void }) {
    const [mostrarPassword, setMostrarPassword] = useState(false);
    const [nuevaPassword, setNuevaPassword] = useState("");
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cambiarRol = async (rol: RolAdmin) => {
        setError(null);
        const resultado = await updateAdmin(admin.id, { rol });
        if (!resultado.ok) setError(resultado.error);
        onCambio();
    };

    const alternarActivo = async () => {
        setError(null);
        const resultado = await updateAdmin(admin.id, { activo: !admin.activo });
        if (!resultado.ok) setError(resultado.error);
        onCambio();
    };

    const guardarPassword = async () => {
        if (nuevaPassword.length < 8) {
            setError("La contraseña debe tener al menos 8 caracteres");
            return;
        }
        setGuardando(true);
        setError(null);
        const resultado = await updateAdmin(admin.id, { password: nuevaPassword });
        setGuardando(false);
        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }
        setNuevaPassword("");
        setMostrarPassword(false);
    };

    return (
        <div className="rounded-lg border border-boss-border bg-boss-panel/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="font-medium text-white">
                        {admin.nombre} {!admin.activo && <span className="text-xs text-boss-gray">(desactivado)</span>}
                    </p>
                    <p className="text-sm text-boss-gray">{admin.correo}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={admin.rol}
                        onChange={(e) => cambiarRol(e.target.value as RolAdmin)}
                        className="rounded-md border border-boss-border bg-boss-black px-2 py-1.5 text-sm text-foreground"
                    >
                        {ROLES.map((r) => (
                            <option key={r} value={r}>
                                {ROL_LABEL[r]}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={alternarActivo}
                        className="rounded-md border border-boss-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-red hover:text-boss-red"
                    >
                        {admin.activo ? "Desactivar" : "Reactivar"}
                    </button>

                    <button
                        type="button"
                        onClick={() => setMostrarPassword((v) => !v)}
                        className="rounded-md border border-boss-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-red hover:text-boss-red"
                    >
                        Cambiar contraseña
                    </button>
                </div>
            </div>

            {mostrarPassword && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                        type="password"
                        placeholder="Nueva contraseña"
                        value={nuevaPassword}
                        onChange={(e) => setNuevaPassword(e.target.value)}
                        className={`${inputClass} max-w-xs`}
                    />
                    <button
                        type="button"
                        onClick={guardarPassword}
                        disabled={guardando}
                        className="rounded-md bg-boss-red px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-boss-red-dark disabled:opacity-50"
                    >
                        Guardar
                    </button>
                </div>
            )}

            {error && <p className="mt-2 text-xs font-medium text-red-400">{error}</p>}
        </div>
    );
}
