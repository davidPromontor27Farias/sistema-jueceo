"use client";

import { useEffect, useState } from "react";
import { getPreventaEstado, type PreventaEstado } from "./api";

// null mientras se consulta al backend; después queda con el estado real
// (activa + lugares restantes) de la preventa Fundadores (primeros 50 lugares).
export function usePreventaEstado(): PreventaEstado | null {
    const [estado, setEstado] = useState<PreventaEstado | null>(null);

    useEffect(() => {
        let cancelado = false;
        getPreventaEstado().then((resultado) => {
            if (!cancelado) setEstado(resultado);
        });
        return () => {
            cancelado = true;
        };
    }, []);

    return estado;
}
