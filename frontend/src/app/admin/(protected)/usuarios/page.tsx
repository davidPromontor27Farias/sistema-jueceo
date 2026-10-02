"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RequireRol } from "../layout";
import { inputClass, Field } from "../../../registro/components/Field";
import {
    createAdmin,
    deleteAdmin,
    getEscenarios,
    listAdmins,
    updateAdmin,
    type AdminInfo,
    type Escenario,
    type RolAdmin,
} from "@/lib/adminApi";

const ROL_LABEL: Record<RolAdmin, string> = {
    SUPER_ADMIN: "Admin total",
    STAFF_ACCESO: "Staff de acceso",
    STAFF_JUECEO: "Staff de jueceo",
    JUEZ: "Juez",
};

// STAFF_JUECEO no se ofrece aquí: el SUPER_ADMIN ya incluye ese acceso, no
// hace falta crear cuentas con ese rol por separado.
const ROLES: RolAdmin[] = ["SUPER_ADMIN", "STAFF_ACCESO", "JUEZ"];

export default function AdminUsuariosPage() {
    return (
        <RequireRol roles={["SUPER_ADMIN"]}>
            <UsuariosContenido />
        </RequireRol>
    );
}

function UsuariosContenido() {
    const [admins, setAdmins] = useState<AdminInfo[] | null>(null);
    const [escenarios, setEscenarios] = useState<Escenario[]>([]);
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
        getEscenarios().then((resultado) => {
            if (!cancelado && resultado.ok) setEscenarios(resultado.data.escenarios);
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

            <FormularioNuevoAdmin escenarios={escenarios} onCreado={recargar} />

            <div className="mt-8 space-y-3">
                {admins === null && <p className="text-boss-gray">Cargando...</p>}
                {admins?.map((admin) => (
                    <FilaAdmin key={admin.id} admin={admin} escenarios={escenarios} onCambio={recargar} />
                ))}
            </div>
        </div>
    );
}

function FormularioNuevoAdmin({ escenarios, onCreado }: { escenarios: Escenario[]; onCreado: () => void }) {
    const [nombre, setNombre] = useState("");
    const [correo, setCorreo] = useState("");
    const [password, setPassword] = useState("");
    const [rol, setRol] = useState<RolAdmin>("STAFF_ACCESO");
    const [escenarioId, setEscenarioId] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setEnviando(true);

        const resultado = await createAdmin({
            nombre,
            correo,
            password,
            rol,
            escenarioId: rol === "JUEZ" && escenarioId ? escenarioId : null,
        });
        setEnviando(false);

        if (!resultado.ok) {
            setError(resultado.error);
            return;
        }

        setNombre("");
        setCorreo("");
        setPassword("");
        setRol("STAFF_ACCESO");
        setEscenarioId("");
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
            {rol === "JUEZ" && (
                <Field label="Escenario" hint="En qué tarima calificará durante la Preselección">
                    <select value={escenarioId} onChange={(e) => setEscenarioId(e.target.value)} className={inputClass}>
                        <option value="">Sin asignar</option>
                        {escenarios.map((esc) => (
                            <option key={esc.id} value={esc.id}>
                                {esc.nombre}
                            </option>
                        ))}
                    </select>
                </Field>
            )}

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

function FilaAdmin({ admin, escenarios, onCambio }: { admin: AdminInfo; escenarios: Escenario[]; onCambio: () => void }) {
    const [mostrarPassword, setMostrarPassword] = useState(false);
    const [nuevaPassword, setNuevaPassword] = useState("");
    const [guardando, setGuardando] = useState(false);
    const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
    const [eliminando, setEliminando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cambiarRol = async (rol: RolAdmin) => {
        setError(null);
        const resultado = await updateAdmin(admin.id, { rol });
        if (!resultado.ok) setError(resultado.error);
        onCambio();
    };

    const cambiarEscenario = async (escenarioId: string) => {
        setError(null);
        const resultado = await updateAdmin(admin.id, { escenarioId: escenarioId || null });
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

    const eliminarCuenta = async () => {
        setEliminando(true);
        setError(null);
        const resultado = await deleteAdmin(admin.id);
        setEliminando(false);
        if (!resultado.ok) {
            setError(resultado.error);
            setConfirmandoEliminar(false);
            return;
        }
        onCambio();
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

                    {admin.rol === "JUEZ" && (
                        <select
                            value={admin.escenarioId ?? ""}
                            onChange={(e) => cambiarEscenario(e.target.value)}
                            className="rounded-md border border-boss-border bg-boss-black px-2 py-1.5 text-sm text-foreground"
                        >
                            <option value="">Sin escenario</option>
                            {escenarios.map((esc) => (
                                <option key={esc.id} value={esc.id}>
                                    {esc.nombre}
                                </option>
                            ))}
                        </select>
                    )}

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

                    {!confirmandoEliminar ? (
                        <button
                            type="button"
                            onClick={() => setConfirmandoEliminar(true)}
                            className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-400 transition-colors hover:border-red-500 hover:bg-red-950/40"
                        >
                            Eliminar
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-boss-gray">¿Seguro?</span>
                            <button
                                type="button"
                                onClick={eliminarCuenta}
                                disabled={eliminando}
                                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {eliminando ? "Eliminando..." : "Sí, eliminar"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmandoEliminar(false)}
                                className="rounded-md border border-boss-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:border-boss-red hover:text-boss-red"
                            >
                                Cancelar
                            </button>
                        </div>
                    )}
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
