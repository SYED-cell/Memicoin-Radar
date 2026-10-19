import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * The payment address as a QR, so a phone wallet can scan it instead of retyping 34 characters.
 * Rendered as SVG rather than canvas: it stays sharp at any size and needs no ref juggling.
 */
export function QrCode({ value, className, size = 220 }: { value: string; className?: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      width: size,
      // High correction: a wallet scanning a phone screen at an angle still resolves it.
      errorCorrectionLevel: 'H',
      color: { dark: '#101014', light: '#ffffff' },
    })
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return <p className={className}>Could not render the code — copy the address instead.</p>;
  }
  if (!svg) {
    return <div className={className} style={{ width: size, height: size }} aria-hidden />;
  }
  return <div className={className} role="img" aria-label="Payment address as a QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
