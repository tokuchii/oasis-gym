import { createWorker } from 'tesseract.js'
import { getApiBase } from './useApiBase'

const REF_PATTERNS = [
  /(?:ref(?:erence)?\s*(?:no\.?|#|number)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:transaction\s*(?:id|#|no\.?)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:trace\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:confirmation\s*(?:no\.?|#|number)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:rrn[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:receipt\s*(?:no\.?|#|number)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:order\s*(?:no\.?|#|number)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:control\s*(?:no\.?|#|number)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:auth(?:entication)?\s*(?:code|no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:gcash\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:maya\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:paymaya\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:bpi\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:bdo\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:security\s*bank\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:eastwest\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:unionbank\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:landbank\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /(?:mbc\s*(?:ref|reference|transaction)\s*(?:no\.?|#)?[\s.:]*)([A-Za-z0-9\-]{6,30})/gi,
  /\b(\d{12,13})\b/,
  /\b([A-Z]{2,4}\d{8,14})\b/,
]

export function extractRefFromText(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const result = matchPatterns(normalized)
  if (result) return result

  const compacted = normalized.replace(/[^A-Za-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
  const compactedDigits = compacted.replace(/(\d) +(?=\d)/g, '$1')
  return matchPatterns(compactedDigits)
}

function matchPatterns(text: string): string | null {
  for (const pattern of REF_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match?.[1]) return match[1].replace(/\s+/g, '')
  }
  return null
}

function preprocessImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas not supported'))

      const scale = Math.max(1, 2000 / Math.max(img.width, img.height))
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = imageData.data
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        const adjusted = gray < 140 ? 0 : 255
        d[i] = d[i + 1] = d[i + 2] = adjusted
      }
      ctx.putImageData(imageData, 0, 0)

      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Blob creation failed')), 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image load failed'))
    }
    img.src = url
  })
}

async function tryServerOcr(file: File): Promise<string | null> {
  try {
    const base = getApiBase()
    const url = base ? `${base}/api/ocr/receipt` : '/api/ocr/receipt'
    const formData = new FormData()
    formData.append('image', file)
    const api = useApi()
    const res = await api<{ referenceNumber: string }>(url, { method: 'POST', body: formData })
    return res.referenceNumber || null
  } catch {
    return null
  }
}

async function tryTesseractOcr(file: File): Promise<string | null> {
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(file)
    return extractRefFromText(data.text)
  } catch {
    return null
  } finally {
    await worker.terminate()
  }
}

export async function extractRefFromReceipt(file: File): Promise<string | null> {
  const serverResult = await tryServerOcr(file)
  if (serverResult) return serverResult

  const rawResult = await tryTesseractOcr(file)
  if (rawResult) return rawResult

  try {
    const preprocessed = await preprocessImage(file)
    const preprocessedFile = new File([preprocessed], file.name, { type: 'image/png' })
    return await tryTesseractOcr(preprocessedFile)
  } catch {
    return null
  }
}
