import { EVENTO_FIN_ICS, EVENTO_INICIO_ICS, EVENTO_NOMBRE, EVENTO_UBICACION } from "@/config/catalog";

function formatearFechaICS(fecha: Date): string {
    return fecha.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escaparTextoICS(texto: string): string {
    return texto.replace(/([,;])/g, "\\$1");
}

export function descargarInvitacionCalendario(competidorId: string | null): void {
    const descripcion = competidorId
        ? `Tu registro fue confirmado. ID de acceso: ${competidorId}. Presenta tu QR en la entrada.`
        : "Tu registro fue confirmado. Presenta tu QR en la entrada.";

    const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//THE BOSS//Registro//ES",
        "BEGIN:VEVENT",
        `UID:${crypto.randomUUID()}@thebossbattle`,
        `DTSTAMP:${formatearFechaICS(new Date())}`,
        `DTSTART:${formatearFechaICS(EVENTO_INICIO_ICS)}`,
        `DTEND:${formatearFechaICS(EVENTO_FIN_ICS)}`,
        `SUMMARY:${escaparTextoICS(EVENTO_NOMBRE)}`,
        `DESCRIPTION:${escaparTextoICS(descripcion)}`,
        `LOCATION:${escaparTextoICS(EVENTO_UBICACION)}`,
        "END:VEVENT",
        "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "the-boss-evento.ics";
    enlace.click();
    URL.revokeObjectURL(url);
}
