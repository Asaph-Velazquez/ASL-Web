import { useState } from 'react';
import './StayQrPrintPreview.css';

interface Props {
  qrCode: string;
  stayId: string;
  onClose: () => void;
}

export function StayQrPrintPreview({ qrCode, stayId, onClose }: Props) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <section className="stay-qr-print-view" role="dialog" aria-modal="true" aria-labelledby="qr-print-title">
      <div className="stay-qr-print-actions">
        <button type="button" onClick={onClose}>Back to stay</button>
        <button type="button" disabled={!imageReady} onClick={() => window.print()}>Print QR</button>
      </div>
      <h1 id="qr-print-title">Active Stay QR</h1>
      <img src={qrCode} alt="Stay QR Code for printing" onLoad={() => setImageReady(true)} onError={() => setImageFailed(true)} />
      <p>Stay ID: {stayId}</p>
      {imageFailed && <p role="alert">Unable to load the QR image. Close this view and try again.</p>}
    </section>
  );
}
