const PASS_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePassCode(): string {
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += PASS_CHARS[Math.floor(Math.random() * PASS_CHARS.length)]
  }
  return `OASIS-${suffix}`
}

export function normalizePassCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

export function isValidPassCodeFormat(code: string): boolean {
  return /^OASIS-[A-Z2-9]{6}$/.test(code)
}
