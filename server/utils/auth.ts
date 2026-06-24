import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE_NAME = 'oasis_staff_session'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

function getSessionSecret(): string {
  const secret = useRuntimeConfig().sessionSecret
  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'SESSION_SECRET is not configured.',
    })
  }
  return secret
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url')
}

export function createStaffSessionToken(): string {
  const payload = JSON.stringify({
    role: 'staff',
    exp: Date.now() + SESSION_TTL_MS,
  })
  const encoded = Buffer.from(payload).toString('base64url')
  return `${encoded}.${signPayload(encoded)}`
}

export function verifyStaffSessionToken(token: string | undefined): boolean {
  if (!token) return false

  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return false

  const expected = signPayload(encoded)
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (sigBuffer.length !== expectedBuffer.length) return false
  if (!timingSafeEqual(sigBuffer, expectedBuffer)) return false

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    return payload.role === 'staff' && typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

export function setStaffSession(event: H3Event) {
  const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
  setCookie(event, COOKIE_NAME, createStaffSessionToken(), {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function clearStaffSession(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function isStaffAuthenticated(event: H3Event): boolean {
  return verifyStaffSessionToken(getCookie(event, COOKIE_NAME))
}

export function requireStaff(event: H3Event) {
  if (!isStaffAuthenticated(event)) {
    throw createError({ statusCode: 401, statusMessage: 'Staff authentication required.' })
  }
}
