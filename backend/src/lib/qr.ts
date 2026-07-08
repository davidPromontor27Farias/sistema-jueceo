import QRCode from "qrcode";

export function generarQrDataUrl(qrToken: string): Promise<string> {
    return QRCode.toDataURL(qrToken, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320,
    });
}
