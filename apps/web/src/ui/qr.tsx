import QRCode from "qrcode";

/**
 * A QR code for a pay link (brief P1), drawn on the server as SVG so no script reaches the phone.
 * The SVG comes from the qrcode library and encodes only our own signed URL.
 */
export async function PayQr({ url, caption }: { url: string; caption: string }) {
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return (
    <figure className="mx-auto max-w-64 text-center">
      <div className="rounded-lg bg-white p-2 [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={caption} dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="mt-1 text-sm text-stone-600">{caption}</figcaption>
    </figure>
  );
}
