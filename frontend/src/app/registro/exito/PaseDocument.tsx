import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { EVENTO_FECHA_LABEL, EVENTO_UBICACION } from "@/config/catalog";

// Usa las fuentes base14 estándar de PDF (Helvetica / Helvetica-Bold), ya
// incluidas en @react-pdf/renderer sin necesidad de registrar archivos .ttf.
const ROJO = "#e2091a";
const NEGRO = "#0a0a0a";
const PANEL = "#151515";
const BORDE = "#2c2c2c";
const VERDE = "#4ee44e";
const GRIS = "#9a9a9a";

const styles = StyleSheet.create({
    page: {
        backgroundColor: NEGRO,
        color: "#f5f5f5",
        padding: 32,
        fontFamily: "Helvetica",
    },
    marca: {
        textAlign: "center",
        marginBottom: 18,
    },
    marcaTitulo: {
        fontFamily: "Helvetica-Bold",
        fontSize: 22,
        letterSpacing: 2,
    },
    marcaTitulo2: {
        fontFamily: "Helvetica-Bold",
        fontSize: 22,
        letterSpacing: 2,
        color: ROJO,
    },
    marcaSub: {
        fontSize: 9,
        color: GRIS,
        marginTop: 4,
        letterSpacing: 1,
    },
    tarjeta: {
        borderWidth: 1,
        borderColor: BORDE,
        borderRadius: 12,
        backgroundColor: PANEL,
        padding: 20,
    },
    encabezadoTarjeta: {
        fontFamily: "Helvetica-Bold",
        textAlign: "center",
        fontSize: 13,
        letterSpacing: 2,
        borderBottomWidth: 1,
        borderBottomColor: BORDE,
        paddingBottom: 12,
        marginBottom: 16,
    },
    fila: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    columnaIzq: {
        width: "55%",
    },
    columnaDer: {
        width: "40%",
        alignItems: "center",
    },
    etiqueta: {
        fontSize: 8,
        color: ROJO,
        letterSpacing: 1.5,
        marginTop: 10,
    },
    valor: {
        fontFamily: "Helvetica-Bold",
        fontSize: 16,
        marginTop: 2,
        letterSpacing: 0.5,
    },
    valorVerde: {
        fontFamily: "Helvetica-Bold",
        fontSize: 14,
        marginTop: 2,
        color: VERDE,
        letterSpacing: 0.5,
    },
    foto: {
        width: 70,
        height: 90,
        borderRadius: 6,
        objectFit: "cover",
        borderWidth: 1,
        borderColor: BORDE,
    },
    qrCaja: {
        backgroundColor: "#ffffff",
        padding: 8,
        borderRadius: 8,
    },
    qr: {
        width: 130,
        height: 130,
    },
    qrCaption: {
        fontSize: 7,
        color: GRIS,
        textAlign: "center",
        marginTop: 8,
        lineHeight: 1.4,
    },
    qrCaptionRojo: {
        fontFamily: "Helvetica-Bold",
        fontSize: 7,
        color: ROJO,
        textAlign: "center",
        marginTop: 2,
    },
    piePunteado: {
        borderTopWidth: 1,
        borderTopColor: BORDE,
        borderStyle: "dashed",
        marginTop: 16,
        paddingTop: 10,
        flexDirection: "row",
        justifyContent: "space-between",
    },
    piePunteadoTexto: {
        fontSize: 9,
        color: GRIS,
        letterSpacing: 1,
    },
    banner: {
        backgroundColor: ROJO,
        marginTop: 16,
        marginHorizontal: -20,
        marginBottom: -20,
        paddingVertical: 8,
        textAlign: "center",
    },
    bannerTexto: {
        fontFamily: "Helvetica-Bold",
        fontSize: 11,
        letterSpacing: 2,
        color: "#ffffff",
    },
    avisoFinal: {
        fontSize: 8,
        color: GRIS,
        textAlign: "center",
        marginTop: 16,
    },
});

export interface PasePdfDatos {
    esPublico: boolean;
    nombreArtistico: string;
    categoriaLabel: string;
    competidorId: string | null;
    qrDataUrl: string;
    fotoUrl: string | null;
}

export function PaseDocument({ esPublico, nombreArtistico, categoriaLabel, competidorId, qrDataUrl, fotoUrl }: PasePdfDatos) {
    return (
        <Document>
            <Page size="A5" style={styles.page}>
                <View style={styles.marca}>
                    <Text style={styles.marcaTitulo}>
                        THE <Text style={styles.marcaTitulo2}>BOSS</Text>
                    </Text>
                    <Text style={styles.marcaSub}>
                        BREAKING EVENT · {EVENTO_FECHA_LABEL} · {EVENTO_UBICACION}
                    </Text>
                </View>

                <View style={styles.tarjeta}>
                    <Text style={styles.encabezadoTarjeta}>
                        {esPublico ? "OFFICIAL GENERAL PASS" : "OFFICIAL COMPETITOR PASS"}
                    </Text>

                    <View style={styles.fila}>
                        <View style={styles.columnaIzq}>
                            {fotoUrl && <Image src={fotoUrl} style={styles.foto} />}
                            <Text style={styles.etiqueta}>{esPublico ? "PÚBLICO GENERAL" : "COMPETIDOR"}</Text>
                            <Text style={styles.valor}>{nombreArtistico}</Text>
                            <Text style={styles.etiqueta}>CATEGORÍA</Text>
                            <Text style={styles.valor}>{categoriaLabel}</Text>
                            {competidorId && (
                                <>
                                    <Text style={styles.etiqueta}>{esPublico ? "ID DE ACCESO" : "COMPETIDOR ID"}</Text>
                                    <Text style={styles.valorVerde}>{competidorId}</Text>
                                </>
                            )}
                        </View>
                        <View style={styles.columnaDer}>
                            <View style={styles.qrCaja}>
                                <Image src={qrDataUrl} style={styles.qr} />
                            </View>
                            <Text style={styles.qrCaption}>
                                Presenta este código en la entrada.{"\n"}No compartas este QR.
                            </Text>
                            <Text style={styles.qrCaptionRojo}>ES ÚNICO E INTRANSFERIBLE</Text>
                        </View>
                    </View>

                    <View style={styles.piePunteado}>
                        <Text style={styles.piePunteadoTexto}>{EVENTO_FECHA_LABEL}</Text>
                        <Text style={styles.piePunteadoTexto}>{EVENTO_UBICACION}</Text>
                    </View>

                    <View style={styles.banner}>
                        <Text style={styles.bannerTexto}>WHO&apos;LL BE THE BOSS?</Text>
                    </View>
                </View>

                <Text style={styles.avisoFinal}>#WhoWillBeTheBoss · thebossbreaking.com</Text>
            </Page>
        </Document>
    );
}
