import { defineEventHandler, readMultipartFormData, createError, getRequestHeader } from 'h3'
import { checkRateLimit } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  const ip = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateError = checkRateLimit(`ocr:${ip}`, 5, 300000)
  if (rateError) throw createError({ statusCode: 429, statusMessage: rateError })

  const apiKey = useRuntimeConfig(event).geminiApiKey
  if (!apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'OCR service unavailable.' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  const file = formData.find((f) => f.name === 'image')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'No image provided' })
  }

  const base64 = file.data.toString('base64')
  const mimeType = file.type || 'image/jpeg'

  const prompt = `Extract the payment reference number from this GCash or bank transfer receipt image.

Return ONLY a JSON object with this exact format:
{"referenceNumber": "the extracted reference number with no spaces"}

Rules:
- For GCash receipts: look for "Ref No", "Reference No", "GCash Ref No", or the 13-digit number near the top
- For bank transfers: look for "Reference Number", "Transaction ID", "Trace Number", "Confirmation Number"
- The reference is typically 10-13 digits for GCash, or alphanumeric for bank transfers
- Remove ALL spaces, dashes, and special characters from the reference number
- Do NOT confuse amounts (like ₱1,499.00), dates, or phone numbers with the reference number
- If no reference number is found, return {"referenceNumber": ""}
- Do NOT include any other text, explanation, or markdown formatting`

  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 200,
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error('[OCR] Gemini error:', await res.text())
    throw createError({ statusCode: 502, statusMessage: 'OCR service error. Please try again.' })
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''

  try {
    const parsed = JSON.parse(text)
    return { referenceNumber: parsed.referenceNumber ?? '' }
  } catch {
    const match = text.match(/[A-Za-z0-9\-]{4,40}/)
    return { referenceNumber: match ? match[0] : '' }
  }
})
