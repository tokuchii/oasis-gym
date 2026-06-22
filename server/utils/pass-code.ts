import { randomInt } from 'node:crypto'

const PASS_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePassCode(): string {
  let suffix = ''
  for (let i = 0; i < 8; i++) {
    suffix += PASS_CHARS[randomInt(PASS_CHARS.length)]
  }
  return `OASIS-${suffix}`
}

export function normalizePassCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

export function isValidPassCodeFormat(code: string): boolean {
  return /^OASIS-[A-Z2-9]{6,8}$/.test(code)
}
