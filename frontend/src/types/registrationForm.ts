import { z } from "zod";
import { RANGOS_EDAD_POR_CATEGORIA } from "@/config/catalog";
import { ESTADOS_MEXICO } from "@/config/catalog";
import type { Categoria } from "@/config/catalog";

const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÑáéíóúñ\s]+$/;
const TELEFONO_10_DIGITOS = /^\d{10}$/;
const INSTAGRAM_USUARIO = /^@[A-Za-z0-9._]{1,30}$/;


const CATEGORIAS_KEYS = Object.keys(RANGOS_EDAD_POR_CATEGORIA) as [Categoria, ...Categoria[]];


function calcularEdad(fechaNacimiento: Date): number {
    const hoy = new Date();
    let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
    const noHaCumplidoAnios =
        hoy.getMonth() < fechaNacimiento.getMonth() ||
        (hoy.getMonth() === fechaNacimiento.getMonth() && hoy.getDate() < fechaNacimiento.getDate());
    if (noHaCumplidoAnios) edad--;
    return edad;
}

export const registrationFormSchema = z
    .object({
        nombres: z.string().trim().min(1, "Requerido").regex(SOLO_LETRAS, "Solo letras"),
        apellidos: z.string().trim().min(1, "Requerido").regex(SOLO_LETRAS, "Solo letras"),
        nombreArtistico: z.string().trim().min(1, "Requerido").max(50),
        fechaNacimiento: z.coerce.date({ message: "Fecha inválida" }),
        categoria: z.enum(CATEGORIAS_KEYS, { message: "Selecciona una categoría" }),
        sexo: z.enum(["MASCULINO", "FEMENINO"], { message: "Selecciona una opción" }),
        estado: z.enum(ESTADOS_MEXICO, { message: "Selecciona un estado" }),
        ciudad: z.string().trim().min(1, "Requerido"),
        correo: z.string().trim().email("Correo inválido"),
        telefono: z.string().regex(TELEFONO_10_DIGITOS, "Debe tener 10 dígitos"),
        instagram: z.string().regex(INSTAGRAM_USUARIO, "Formato @usuario").optional().or(z.literal("")),
        academia: z.string().trim().optional(),
        crew: z.string().trim().optional(),
        contactoEmergencia: z.string().trim().optional(),
        aceptaReglamento: z.literal(true, { message: "Debes aceptar el reglamento" }),
        aceptaAvisoPrivacidad: z.literal(true, { message: "Debes aceptar el aviso de privacidad" }),
        aceptaUsoImagen: z.literal(true, { message: "Debes aceptar el uso de imagen" }),
    })
    .superRefine((data, ctx) => {
        const edad = calcularEdad(data.fechaNacimiento);
        const rango = RANGOS_EDAD_POR_CATEGORIA[data.categoria];

        if (rango.minEdad !== null && edad < rango.minEdad) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: `Esta categoría requiere una edad mínima de ${rango.minEdad} años`,
            });
        }
        if (rango.maxEdad !== null && edad > rango.maxEdad) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: `Esta categoría requiere una edad máxima de ${rango.maxEdad} años`,
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

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>