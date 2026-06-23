import { defineEventHandler, readMultipartFormData, createError, getRequestHeader } from 'h3'
import { checkRateLimit } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  const ip = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateError = checkRateLimit(`ocr:${ip}`, 10, 300000)
  if (rateError) throw createError({ statusCode: 429, statusMessage: rateError })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'OCR service unavailable.' })
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

  const prompt = `Extract the payment reference number from this receipt image.

Return ONLY a JSON object with this exact format:
{"referenceNumber": "the extracted reference number with no spaces"}

Rules:
- Look for fields like: Ref No, Reference No, Transaction ID, Trace No, Confirmation No, RRN, Auth Code, Receipt No, Order No, Control No, or any similar identifier
- If the reference is split across multiple lines, combine the digits
- Remove all spaces from the reference number
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
