import { timingSafeEqual } from 'node:crypto'
import { setStaffSession } from '~/server/utils/auth'

const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 60_000

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const record = loginAttempts.get(ip)

  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  record.count++
  return record.count > MAX_ATTEMPTS
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const password = String(body?.password ?? '')
  const ip = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  if (!config.adminPassword) {
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable.' })
  }

  if (isRateLimited(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Try again later.' })
  }

  const pwBuf = Buffer.from(password)
  const expectedBuf = Buffer.from(config.adminPassword)
  const valid = pwBuf.length === expectedBuf.length && timingSafeEqual(pwBuf, expectedBuf)

  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid password.' })
  }

  setStaffSession(event)

  return { ok: true }
})
