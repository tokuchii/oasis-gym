export async function generateWalkinQrDataUrl(payload: string): Promise<string> {
  const QRCode = await import('qrcode')
  return QRCode.toDataURL(payload, {
    width: 240,
    margin: 2,
    color: {
      dark: '#0a0a0a',
      light: '#F5F0E8',
    },
  })
}
