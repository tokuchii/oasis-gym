import { createWorker, PSM } from 'tesseract.js'

async function extractViaGemini(file: File): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('image', file)
    const res = await $fetch('/api/ocr/receipt', {
      method: 'POST',
      body: formData,
    })
    const ref = (res.referenceNumber ?? '').trim()
    if (ref && ref.length >= 4) {
      console.log('Gemini OCR result:', ref)
      return ref
    }
    console.log('Gemini OCR returned empty reference')
    return null
  } catch (e: any) {
    console.warn('Gemini OCR failed:', e?.data?.statusMessage ?? e?.message ?? e)
    return null
  }
}

function preprocessImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const maxDim = 2400
      let w = img.width
      let h = img.height
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)

      const imageData = ctx.getImageData(0, 0, w, h)
      const d = imageData.data
      const contrast = 1.4
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        const boosted = Math.max(0, Math.min(255, factor * (gray - 128) + 128))
        const adjusted = boosted > 140 ? 255 : 0
        d[i] = adjusted
        d[i + 1] = adjusted
        d[i + 2] = adjusted
      }
      ctx.putImageData(imageData, 0, 0)

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (blob) {
          resolve(new File([blob], file.name, { type: 'image/png' }))
        } else {
          resolve(file)
        }
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

function normalizeOCR(value: string): string {
  return value
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/l/g, '1')
    .replace(/S/g, '5')
}

const REFERENCE_LABELS = [
  'Ref No',
  'Ref. No',
  'Reference No',
  'Reference Number',
  'Reference #',
  'Ref#',
  'Ref #',
  'Ref No.',
  'Reference No.',
  'Reference #.',
  'Transaction ID',
  'Transaction No',
  'Transaction Ref',
  'Transaction Reference',
  'Trace No',
  'Trace No.',
  'Trace Number',
  'Confirmation No',
  'Confirmation No.',
  'Confirmation Number',
  'Control No',
  'Control No.',
  'Control Number',
  'RRN',
  'RRN No',
  'RRN Number',
  'Authorization Code',
  'Auth Code',
  'Auth No',
  'Tracking No',
  'Tracking Number',
  'Receipt No',
  'Receipt Number',
  'Receipt #',
  'Order No',
  'Order Number',
  'Order #',
  'Payment Ref',
  'Payment Reference',
  'Pay Ref',
  'Txn ID',
  'Txn Ref',
  'T ID',
  'ID No',
  'ID Number',
  'Reference',
]

const AMOUNT_KEYWORDS = [
  'Amount',
  'Total',
  'Payment',
  'Sent',
  'Received',
  'Transfer',
  'Value',
  'Balance',
  'Fee',
  'Charge',
  '₱',
  'PHP',
  'PhP',
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildReferencePatterns(): RegExp[] {
  const patterns: RegExp[] = []

  for (const label of REFERENCE_LABELS) {
    const escaped = escapeRegex(label)
    patterns.push(
      new RegExp(`${escaped}\\s*[:\\-=]?\\s*([A-Za-z0-9\\- ]{4,40})`, 'i'),
      new RegExp(`${escaped}\\s*\\n\\s*([A-Za-z0-9\\- ]{4,40})`, 'i'),
    )
  }

  patterns.push(
    /\b([A-Z]{2}\d{7,20})\b/,
    /\b([A-Z]{2,6}-?\d{6,20})\b/i,
    /\b(GC\d{7,20})\b/i,
    /\b(GX\d{7,20})\b/i,
    /\b(MA\d{7,20})\b/i,
    /\b(MY\d{7,20})\b/i,
    /\b(TX\d{7,20})\b/i,
    /\b(RC\d{7,20})\b/i,
    /\b(TR\d{7,20})\b/i,
    /\b(PH\d{7,20})\b/i,
    /\b(TXN\d{7,20})\b/i,
    /\b([A-Z0-9]{7,30})\b/,
    /\b(\d{4}\s?\d{4}\s?\d{4}\s?\d{4})\b/,
    /\b(\d{4}\s\d{3,10})\b/,
  )

  return patterns
}

function isAmountValue(token: string): boolean {
  const cleaned = token.replace(/[,\s]/g, '')
  if (/^\d+\.?\d{0,2}$/.test(cleaned)) {
    const num = parseFloat(cleaned)
    if (num > 0 && num < 1000000) return true
  }
  return false
}

function isLikelyReference(token: string): boolean {
  const cleaned = token.replace(/[^A-Za-z0-9]/g, '')
  if (cleaned.length < 4 || cleaned.length > 40) return false
  const letters = (cleaned.match(/[A-Za-z]/g) || []).length
  const digits = (cleaned.match(/\d/g) || []).length
  if (digits < 4) return false
  if (digits >= 7) return true
  if (letters >= 2 && digits >= 6) return true
  return false
}

function cleanRef(value: string): string {
  let cleaned = value.replace(/[^A-Za-z0-9\-]/g, '').replace(/\s/g, '')
  if (cleaned.length > 40) cleaned = cleaned.slice(0, 40)
  return cleaned
}

async function extractViaTesseract(file: File): Promise<string> {
  const processed = await preprocessImage(file)

  const worker = await createWorker('eng', undefined, {
    logger: () => {},
  })

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    })

    const { data } = await worker.recognize(processed)

    if (data.confidence < 60) {
      console.log('Tesseract confidence too low:', data.confidence)
      return ''
    }

    const text = data.text.replace(/\r/g, '')
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

    const patterns = buildReferencePatterns()
    const labeledPatterns = patterns.slice(0, REFERENCE_LABELS.length * 2)

    const REF_LABEL_RE = /Ref\s*\.?\s*No\s*\.?\s*[:\-=]?\s*([A-Za-z0-9\- ]{1,40})/i
    const DATE_LINE_RE = /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const m = line.match(REF_LABEL_RE)
      if (m && m[1]) {
        let value = m[1].trim()
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const next = lines[j]
          if (/^\d[\d ]+$/.test(next)) {
            value += ' ' + next
          } else if (DATE_LINE_RE.test(next)) {
            continue
          } else {
            break
          }
        }
        const ref = cleanRef(normalizeOCR(value))
        if (isLikelyReference(ref)) {
          return ref
        }
      }
    }

    for (const line of lines) {
      for (const pattern of labeledPatterns) {
        const match = line.match(pattern)
        if (match && match[1]) {
          const ref = cleanRef(normalizeOCR(match[1]))
          if (isLikelyReference(ref)) return ref
        }
      }
    }

    for (let i = 0; i < lines.length - 1; i++) {
      const combined = lines[i] + ' ' + lines[i + 1]
      for (const pattern of labeledPatterns) {
        const match = combined.match(pattern)
        if (match && match[1]) {
          const ref = cleanRef(normalizeOCR(match[1]))
          if (isLikelyReference(ref)) return ref
        }
      }
    }

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern)
        if (match && match[1]) {
          const ref = cleanRef(normalizeOCR(match[1]))
          if (isLikelyReference(ref) && !isAmountValue(ref)) return ref
        }
      }
    }

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        const ref = cleanRef(normalizeOCR(match[1]))
        if (isLikelyReference(ref) && !isAmountValue(ref)) return ref
      }
    }

    const amountPattern = new RegExp(
      `(?:${AMOUNT_KEYWORDS.map(escapeRegex).join('|')})\\s*[:\\-=]?\\s*[₱P]?\\s*([\\d,]+\\.?\\d*)`,
      'i',
    )
    let amountStr = ''
    for (const line of lines) {
      const m = line.match(amountPattern)
      if (m) {
        amountStr = m[1].replace(/,/g, '')
        break
      }
    }

    const allTokens = text.match(/[A-Za-z0-9\-]{6,40}/g) || []
    for (const token of allTokens) {
      if (amountStr && token.replace(/[^0-9]/g, '') === amountStr.replace('.', '')) continue
      if (isLikelyReference(token) && !isAmountValue(token)) {
        return cleanRef(normalizeOCR(token))
      }
    }

    return ''
  } finally {
    await worker.terminate()
  }
}

export async function extractRefFromReceipt(file: File): Promise<string> {
  const geminiResult = await extractViaGemini(file)
  if (geminiResult) return geminiResult

  return extractViaTesseract(file)
}
