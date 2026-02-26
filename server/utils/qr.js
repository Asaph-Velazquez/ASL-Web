import QRCode from 'qrcode';

/**
 * Generates a QR code data URL from a JWT token string
 * @param {string} token - The JWT token to encode in the QR code
 * @returns {Promise<string>} - Data URL of PNG QR code (base64 encoded)
 */
export async function generateQRDataURL(token) {
  try {
    const dataURL = await QRCode.toDataURL(token, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return dataURL;
  } catch (error) {
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
}
