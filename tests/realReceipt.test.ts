import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { createWorker } from 'tesseract.js'
import { extractRefFromText } from '../composables/useReceiptOcr'

const imagePath = resolve(__dirname, './fixtures/real-receipt.jpg')

describe('Real receipt OCR test', () => {
  it('extracts text from receipt image and finds reference number', async () => {
    const worker = await createWorker('eng')
    try {
      const { data } = await worker.recognize(imagePath)
      console.log('=== Raw OCR text ===')
      console.log(data.text)
      console.log('=== End OCR text ===')

      const ref = extractRefFromText(data.text)
      console.log('Extracted reference:', ref)

      expect(data.text.length).toBeGreaterThan(0)
    } finally {
      await worker.terminate()
    }
  }, 60000)
})
