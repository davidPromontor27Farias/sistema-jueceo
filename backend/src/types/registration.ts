import {z} from "zod";
import { REGLAS_POR_CATEGORIA, ESTADOS_MEXICO, tipoBoletoPorCategoria, type Categoria } from "../config/catalog";

const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÑáéíóúñ'\-\s]+$/;
const TELEFONO_10_DIGITOS = /^\d{10}$/;
const INSTAGRAM_USUARIO = /^@[A-Za-z0-9._]{1,30}$/;
const CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\//;

const CATEGORIAS = Object.keys(REGLAS_POR_CATEGORIA) as [Categoria, ...Categoria[]];
const PAQUETES_BASE = [
    "COMPETIDOR",
    "PUBLICO_GENERAL",
    "VIP_EXPERIENCE",
    "BOSS_EXPERIENCE",
    "BOSS_VIP",
    "SOLO_WORKSHOPS",
] as const;


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
        nombreArtistico: z.string().trim().max(50).optional().or(z.literal("")),
        fechaNacimiento: z.coerce.date(),
        categoria: z.enum(CATEGORIAS),
        sexo: z.enum(["MASCULINO", "FEMENINO"]),
        nacionalidad: z.string().trim().min(1),
        estado: z.enum(ESTADOS_MEXICO),
        ciudad: z.string().trim().min(1),
        correo: z.string().trim().email(),
        telefono: z.string().regex(TELEFONO_10_DIGITOS, "Debe tener 10 dígitos"),
        instagram: z.string().regex(INSTAGRAM_USUARIO, "Formato @usuario").optional(),
        academiaCrew: z.string().trim().optional(),
        contactoEmergencia: z.string().trim().optional(),
        fotoUrl: z
            .string()
            .url()
            .regex(CLOUDINARY_URL, "La foto debe subirse desde el formulario")
            .optional()
            .or(z.literal("")),
        paqueteBase: z.enum(PAQUETES_BASE),
        workshopsSeleccionados: z.array(z.number().int().min(1).max(3)).max(3).default([]),
        agregarOpenStyle: z.boolean().default(false),
        aceptaReglamento: z.boolean().default(false),
        aceptaAvisoPrivacidad: z.literal(true),
        aceptaPoliticaCancelacion: z.literal(true),
    })
    .superRefine((data, ctx) => {
        const edad = calcularEdad(data.fechaNacimiento);
        const regla = REGLAS_POR_CATEGORIA[data.categoria];

        if (tipoBoletoPorCategoria(data.categoria) !== "GENERAL" && !data.aceptaReglamento) {
            ctx.addIssue({
                code: "custom",
                path: ["aceptaReglamento"],
                message: "Debes aceptar el reglamento",
            });
        }
        if (tipoBoletoPorCategoria(data.categoria) !== "GENERAL" && !data.nombreArtistico) {
            ctx.addIssue({
                code: "custom",
                path: ["nombreArtistico"],
                message: "Falta el nombre de competidor (Bboy/Bgirl name)",
            });
        }
        if (regla.minEdad !== null && edad < regla.minEdad) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: `La categoría requiere una edad mínima de ${regla.minEdad} años`,
            });
        }
        if (regla.maxEdad !== null && edad > regla.maxEdad) {
            ctx.addIssue({
                code: "custom",
                path: ["categoria"],
                message: `La categoría requiere una edad máxima de ${regla.maxEdad} años`,
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
        if (data.paqueteBase !== "PUBLICO_GENERAL" && !data.fotoUrl) {
            ctx.addIssue({
                code: "custom",
                path: ["fotoUrl"],
                message: "Falta la foto",
            });
        }
        if (data.agregarOpenStyle && (data.categoria === "OPEN_STYLE_1V1" || data.categoria === "PUBLICO_GENERAL")) {
            ctx.addIssue({
                code: "custom",
                path: ["agregarOpenStyle"],
                message: "El extra de Open Style no aplica a esta categoría",
            });
        }
    });

export type RegistrationInput = z.infer<typeof registrationSchema>
