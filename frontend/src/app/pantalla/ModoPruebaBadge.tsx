"use client";

import { useEffect, useState } from "react";
import { getConfiguracionEvento } from "@/lib/adminApi";

const INTERVALO_MS = 10000;

// Etiqueta fija en una esquina, en las pantallas públicas (/pantalla,
// /pantalla/tablero), cuando el Evento de Prueba está activo — para que
// quien vea la pantalla durante un ensayo no lo confunda con el evento real.
// No interfiere con la coreografía/batallas: pequeña, en una esquina, no
// bloquea el overlay de secuencia (z-index alto pero fuera del flujo).
export function ModoPruebaBadge() {
    const [modoPrueba, setModoPrueba] = useState(false);

    useEffect(() => {
        let cancelado = false;
        const poll = async () => {
            const resultado = await getConfiguracionEvento();
            if (!cancelado && resultado.ok) setModoPrueba(resultado.data.modoPrueba);
        };
        poll();
        const id = setInterval(poll, INTERVALO_MS);
        return () => {
            cancelado = true;
            clearInterval(id);
        };
    }, []);

    if (!modoPrueba) return null;

    return (
        <div className="fixed left-3 top-3 z-[60] rounded-md bg-yellow-500 px-2.5 py-1 font-display text-xs uppercase tracking-widest text-boss-black shadow-lg">
            Modo Prueba
        </div>
    );
}
