"use client";

import { RegistroWizard } from "../registro/RegistroWizard";

// Mismo formulario que /registro (mismos campos, mismas validaciones), pero
// sin pasarela de pago: el registro queda marcado Registration.esPrueba y
// solo lo ve el sistema mientras el modo prueba esté activo (interruptor en
// el panel de SUPER_ADMIN) — ver backend/src/routes/registrationsPrueba.ts.
export default function EventoPruebaPage() {
    return <RegistroWizard modoPrueba={true} />;
}
