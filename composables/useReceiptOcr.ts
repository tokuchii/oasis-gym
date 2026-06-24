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
  /\b(\d{12,13})\b/,
  /\b([A-Z]{2,4}\d{8,14})\b/,
]

function extractRefFromText(text: string): string | null {
  for (const pattern of REF_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match?.[1]) return match[1].replace(/\s+/g, '')
  }
  return null
}

async function tryServerOcr(file: File): Promise<string | null> {
  try {
    const base = getApiBase()
    const url = base ? `${base}/api/ocr/receipt` : '/api/ocr/receipt'
    const formData = new FormData()
    formData.append('image', file)
    const res = await $fetch<{ referenceNumber: string }>(url, { method: 'POST', body: formData })
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

  return tryTesseractOcr(file)
}
