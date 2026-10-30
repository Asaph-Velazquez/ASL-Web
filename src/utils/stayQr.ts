export function downloadStayQr(qrCode: string, stayId: string, doc = document, urls = URL) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(qrCode);
  if (!match) throw new Error('Unable to download the QR image');
  const bytes = Uint8Array.from(atob(match[1]), character => character.charCodeAt(0));
  const url = urls.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = `stay-qr-${stayId.replace(/[^A-Za-z0-9_-]/g, '_')}.png`;
  doc.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // El navegador necesita conservar la URL hasta iniciar la descarga.
    setTimeout(() => urls.revokeObjectURL(url), 1000);
  }
}
