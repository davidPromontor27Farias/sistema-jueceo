const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export const FOTO_TIPOS_PERMITIDOS = ["image/jpeg", "image/png"];
export const FOTO_TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;
export const FOTO_DIMENSION_MINIMA_PX = 800;

export type ValidacionFoto = { ok: true } | { ok: false; error: string };

function leerDimensiones(archivo: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(archivo);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("No se pudo leer la imagen"));
        };
        img.src = url;
    });
}

export async function validarFoto(archivo: File): Promise<ValidacionFoto> {
    if (!FOTO_TIPOS_PERMITIDOS.includes(archivo.type)) {
        return { ok: false, error: "El formato debe ser JPG o PNG" };
    }
    if (archivo.size > FOTO_TAMANO_MAXIMO_BYTES) {
        return { ok: false, error: "La foto debe pesar máximo 5MB" };
    }

    try {
        const { width, height } = await leerDimensiones(archivo);
        if (width < FOTO_DIMENSION_MINIMA_PX || height < FOTO_DIMENSION_MINIMA_PX) {
            return { ok: false, error: `La foto debe medir al menos ${FOTO_DIMENSION_MINIMA_PX}x${FOTO_DIMENSION_MINIMA_PX}px` };
        }
    } catch {
        return { ok: false, error: "No se pudo procesar la imagen, intenta con otra" };
    }

    return { ok: true };
}

export async function subirFotoACloudinary(archivo: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
        console.error("Faltan NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET");
        return { ok: false, error: "La subida de fotos no está disponible en este momento." };
    }

    const validacion = await validarFoto(archivo);
    if (!validacion.ok) {
        return { ok: false, error: validacion.error };
    }

    const formData = new FormData();
    formData.append("file", archivo);
    formData.append("upload_preset", UPLOAD_PRESET);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: "POST",
            body: formData,
        });
        const data = await response.json();

        if (!response.ok || !data.secure_url) {
            console.error("Error al subir a Cloudinary", data);
            return { ok: false, error: "No se pudo subir la foto, intenta de nuevo." };
        }

        return { ok: true, url: data.secure_url as string };
    } catch (error) {
        console.error("Error de red al subir a Cloudinary", error);
        return { ok: false, error: "No se pudo conectar para subir la foto." };
    }
}
