import {z} from "zod";
import { RANGOS_EDAD_POR_CATEGORIA, ESTADOS_MEXICO, type Categoria } from "../config/catalog";

const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÑáéíóúñ\s]+$/;
const TELEFONO_10_DIGITOS = /^\d{10}$/;
const INSTAGRAM_USUARIO = /^@[A-Za-z0-9._]{1,30}$/;

const CATEGORIAS = Object.keys(RANGOS_EDAD_POR_CATEGORIA) as [Categoria, ...Categoria[]];


function calcularEdad(fechaNacimiento: Date): number{

    const hoy = new Date();
    let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
    const noHaCumplidoAnios = hoy.getMonth() < fechaNacimiento.getMonth() || (hoy.getMonth() === fechaNacimiento.getMonth() && hoy.getDate() < fechaNacimiento.getDate());

    if(noHaCumplidoAnios) edad --;
    return edad;
    
}

export const registrationSchema = z
    .object({
        nombres: z.string().trim().min(1).regex(SOLO_LETRAS, "Solo letras"),
        apellidos: z.string().trim().min(1).regex(SOLO_LETRAS, "Solo letras"),
        nombreArtistico: z.string().trim().min(1).max(50),
        fechaNacimiento: z.coerce.date(),
        categoria: z.enum(CATEGORIAS),
        sexo: z.enum(["MASCULINO", "FEMENINO"]),
        estado: z.enum(ESTADOS_MEXICO),
        ciudad: z.string().trim().min(1),
        correo: z.string().trim().email(),
        telefono: z.string().regex(TELEFONO_10_DIGITOS, "Debe tener 10 dígitos"),
        instagram: z.string().regex(INSTAGRAM_USUARIO, "Formato @usuario").optional(),
        academia: z.string().trim().optional(),
        crew: z.string().trim().optional(),
        contactoEmergencia: z.string().trim().optional(),
        aceptaReglamento: z.literal(true),
        aceptaAvisoPrivacidad: z.literal(true),
        aceptaUsoImagen: z.literal(true),
    })
    .superRefine((data, ctx) => {
        const edad = calcularEdad(data.fechaNacimiento);
        const rango = RANGOS_EDAD_POR_CATEGORIA[data.categoria];

        if (rango.minEdad !== null && edad < rango.minEdad) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: `La categoría requiere una edad mínima de ${rango.minEdad} años`,
            });
        }
        if (rango.maxEdad !== null && edad > rango.maxEdad) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: `La categoría requiere una edad máxima de ${rango.maxEdad} años`,
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

export type RegistrationInput = z.infer<typeof registrationSchema>