import { z } from "zod";
import { REGLAS_POR_CATEGORIA, ESTADOS_MEXICO } from "@/config/catalog";
import type { Categoria } from "@/config/catalog";

const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÑáéíóúñ'\-\s]+$/;
const TELEFONO_10_DIGITOS = /^\d{10}$/;
const INSTAGRAM_USUARIO = /^@[A-Za-z0-9._]{1,30}$/;

const CATEGORIAS_KEYS = Object.keys(REGLAS_POR_CATEGORIA) as [Categoria, ...Categoria[]];
const PAQUETES_BASE_KEYS = [
    "COMPETIDOR",
    "PUBLICO_GENERAL",
    "VIP_EXPERIENCE",
    "BOSS_EXPERIENCE",
    "BOSS_VIP",
    "PRO_PACKAGE",
    "SOLO_WORKSHOPS",
] as const;


function calcularEdad(fechaNacimiento: Date): number {
    const hoy = new Date();
    let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
    const noHaCumplidoAnios =
        hoy.getMonth() < fechaNacimiento.getMonth() ||
        (hoy.getMonth() === fechaNacimiento.getMonth() && hoy.getDate() < fechaNacimiento.getDate());
    if (noHaCumplidoAnios) edad--;
    return edad;
}

export function calcularEdadDesde(fechaNacimiento: Date): number {
    return calcularEdad(fechaNacimiento);
}

export const registrationFormSchema = z
    .object({
        nombres: z.string().trim().min(1, "Requerido").regex(SOLO_LETRAS, "Solo letras"),
        apellidos: z.string().trim().min(1, "Requerido").regex(SOLO_LETRAS, "Solo letras"),
        nombreArtistico: z.string().trim().min(1, "Requerido").max(50),
        fechaNacimiento: z.coerce.date({ message: "Fecha inválida" }),
        categoria: z.enum(CATEGORIAS_KEYS, { message: "Selecciona una categoría" }),
        sexo: z.enum(["MASCULINO", "FEMENINO"], { message: "Selecciona una opción" }),
        nacionalidad: z.string().trim().min(1, "Requerido"),
        estado: z.enum(ESTADOS_MEXICO, { message: "Selecciona un estado" }),
        ciudad: z.string().trim().min(1, "Requerido"),
        correo: z.string().trim().email("Correo inválido"),
        telefono: z.string().regex(TELEFONO_10_DIGITOS, "Debe tener 10 dígitos"),
        instagram: z.string().regex(INSTAGRAM_USUARIO, "Formato @usuario").optional().or(z.literal("")),
        academiaCrew: z.string().trim().optional(),
        contactoEmergencia: z.string().trim().optional(),
        fotoUrl: z.string().url("Sube tu foto para continuar").optional(),
        paqueteBase: z.enum(PAQUETES_BASE_KEYS, { message: "Selecciona un paquete" }),
        workshopsSeleccionados: z.array(z.number().int().min(1).max(3)).max(3).default([]),
        aceptaReglamento: z.literal(true, { message: "Debes aceptar el reglamento" }),
        aceptaAvisoPrivacidad: z.literal(true, { message: "Debes aceptar el aviso de privacidad" }),
    })
    .superRefine((data, ctx) => {
        const edad = calcularEdad(data.fechaNacimiento);
        const regla = REGLAS_POR_CATEGORIA[data.categoria];

        if (regla.minEdad !== null && edad < regla.minEdad) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: `Esta categoría requiere una edad mínima de ${regla.minEdad} años`,
            });
        }
        if (regla.maxEdad !== null && edad > regla.maxEdad) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: `Esta categoría requiere una edad máxima de ${regla.maxEdad} años`,
            });
        }
        if (regla.sexoPermitido !== null && !regla.sexoPermitido.includes(data.sexo)) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: "Esta categoría no está disponible para el sexo seleccionado",
            });
        }
        if (edad < 18 && !data.contactoEmergencia) {
            ctx.addIssue({
                code: "custom",
                path: ["contactoEmergencia"],
                message: "El contacto de emergencia es obligatorio para menores de edad",
            });
        }
    });

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>;
