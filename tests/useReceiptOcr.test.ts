import { describe, it, expect } from 'vitest'
import { extractRefFromText } from '../composables/useReceiptOcr'

describe('extractRefFromText', () => {
  it('extracts reference number after "Ref No." label', () => {
    expect(extractRefFromText('Ref No. ABC123456789')).toBe('ABC123456789')
  })

  it('extracts reference number after "Reference:" label', () => {
    expect(extractRefFromText('Reference: TXN9876543210')).toBe('TXN9876543210')
  })

  it('extracts transaction ID', () => {
    expect(extractRefFromText('Transaction ID: 1234567890123')).toBe('1234567890123')
  })

  it('extracts trace number', () => {
    expect(extractRefFromText('Trace No. 9876543210')).toBe('9876543210')
  })

  it('extracts confirmation number', () => {
    expect(extractRefFromText('Confirmation # CONF123456')).toBe('CONF123456')
  })

  it('extracts RRN', () => {
    expect(extractRefFromText('RRN: 123456789012')).toBe('123456789012')
  })

  it('extracts receipt number', () => {
    expect(extractRefFromText('Receipt No. RCT20240001')).toBe('RCT20240001')
  })

  it('extracts order number', () => {
    expect(extractRefFromText('Order # ORD-123456')).toBe('ORD-123456')
  })

  it('extracts control number', () => {
    expect(extractRefFromText('Control Number: CTRL998877')).toBe('CTRL998877')
  })

  it('extracts authentication code', () => {
    expect(extractRefFromText('Auth Code: AUTH12345678')).toBe('AUTH12345678')
  })

  it('extracts GCash reference', () => {
    expect(extractRefFromText('GCash Ref No. 1234567890123456')).toBe('1234567890123456')
  })

  it('extracts Maya reference', () => {
    expect(extractRefFromText('Maya Transaction No. MAYA987654321')).toBe('MAYA987654321')
  })

  it('extracts BPI reference', () => {
    expect(extractRefFromText('BPI Reference: BPIREF123456')).toBe('BPIREF123456')
  })

  it('extracts BDO reference', () => {
    expect(extractRefFromText('BDO Transaction ID: BDO1234567890')).toBe('BDO1234567890')
  })

  it('extracts Security Bank reference', () => {
    expect(extractRefFromText('Security Bank Ref. SEC123456789')).toBe('SEC123456789')
  })

  it('extracts EastWest reference', () => {
    expect(extractRefFromText('EastWest Ref: EW1234567890')).toBe('EW1234567890')
  })

  it('extracts UnionBank reference', () => {
    expect(extractRefFromText('UnionBank Reference # UB123456789')).toBe('UB123456789')
  })

  it('extracts Landbank reference', () => {
    expect(extractRefFromText('Landbank Transaction: LB1234567890')).toBe('LB1234567890')
  })

  it('extracts 12-13 digit standalone number', () => {
    expect(extractRefFromText('Payment confirmed 123456789012')).toBe('123456789012')
  })

  it('extracts alphanumeric pattern with 2-4 letters + 8-14 digits', () => {
    expect(extractRefFromText('Code: ABC1234567890')).toBe('ABC1234567890')
  })

  it('returns null for text with no reference', () => {
    expect(extractRefFromText('Thank you for your payment')).toBeNull()
  })

  it('returns null for too-short reference (< 6 chars)', () => {
    expect(extractRefFromText('Ref: ABC12')).toBeNull()
  })

  it('handles case insensitive matching', () => {
    expect(extractRefFromText('ref no. abc123456789')).toBe('abc123456789')
  })

  it('handles irregular spacing around label', () => {
    expect(extractRefFromText('Ref  No.    ABC123456789')).toBe('ABC123456789')
  })

  it('handles multiline receipt text', () => {
    const text = `OASIS FITNESS GYM\nAmount: PHP 500.00\nRef No. GCASH20240101001\nThank you`
    expect(extractRefFromText(text)).toBe('GCASH20240101001')
  })

  it('handles real GCash receipt format', () => {
    const text = `GCash\nSend Money\nAmount: PHP 1,500.00\nReference No: 1234567890123456789\nDate: Jan 1, 2024`
    expect(extractRefFromText(text)).toBe('1234567890123456789')
  })

  it('handles real Maya receipt format', () => {
    const text = `Maya\nPayment Successful\nTransaction ID: MAYA-2024-01-001234\nAmount: PHP 2,000.00`
    expect(extractRefFromText(text)).toBe('MAYA-2024-01-001234')
  })
})
