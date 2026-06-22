import type { WalkinPass, WalkinPassStatus } from '~/types/walkin'

const MANILA_TZ = 'Asia/Manila'

export function getVisitDateManila(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ }).format(date)
}

export function resolvePassStatus(pass: WalkinPass): WalkinPassStatus {
  const today = getVisitDateManila()
  if (pass.status === 'checked_in' && pass.checked_in_at) {
    const lastCheckout = new Date(pass.checked_in_at)
    const lastCheckoutDate = getVisitDateManila(lastCheckout)
    if (lastCheckoutDate >= today) return 'checked_in'
  }
  return 'registered'
}

const MAX_LENGTHS = { fullName: 100, email: 254, phone: 20, emergencyContact: 100 }

export function validateWalkinPayload(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body.' })
  }

  const data = body as Record<string, unknown>
  const fullName = String(data.fullName ?? '').trim()
  const email = String(data.email ?? '').trim()
  const phone = String(data.phone ?? '').trim()
  const emergencyContact = String(data.emergencyContact ?? '').trim()

  if (!fullName) {
    throw createError({ statusCode: 400, statusMessage: 'Full name is required.' })
  }
  if (fullName.length > MAX_LENGTHS.fullName) {
    throw createError({ statusCode: 400, statusMessage: 'Full name is too long.' })
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required.' })
  }
  if (email.length > MAX_LENGTHS.email) {
    throw createError({ statusCode: 400, statusMessage: 'Email is too long.' })
  }
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Phone number is required.' })
  }
  if (!/^(09|\+639)\d{9}$/.test(phone)) {
    throw createError({ statusCode: 400, statusMessage: 'Phone must be a valid Philippine mobile number (09XXXXXXXXX).' })
  }
  if (phone.length > MAX_LENGTHS.phone) {
    throw createError({ statusCode: 400, statusMessage: 'Phone number is too long.' })
  }
  if (!emergencyContact) {
    throw createError({ statusCode: 400, statusMessage: 'Emergency contact is required.' })
  }
  if (emergencyContact.length > MAX_LENGTHS.emergencyContact) {
    throw createError({ statusCode: 400, statusMessage: 'Emergency contact is too long.' })
  }

  return { fullName, email, phone, emergencyContact }
}

export function validateCoachPayload(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body.' })
  }

  const data = body as Record<string, unknown>
  const fullName = String(data.fullName ?? '').trim()
  const specialty = String(data.specialty ?? '').trim()
  const bio = String(data.bio ?? '').trim()
  const photoUrl = String(data.photoUrl ?? '').trim()

  if (!fullName) {
    throw createError({ statusCode: 400, statusMessage: 'Full name is required.' })
  }

  return { fullName, specialty, bio, photoUrl }
}

export function serializePass(pass: WalkinPass) {
  const status = resolvePassStatus(pass)
  return {
    id: pass.id,
    passCode: pass.pass_code,
    fullName: pass.full_name,
    email: pass.email,
    phone: pass.phone,
    emergencyContact: pass.emergency_contact,
    visitDate: pass.visit_date,
    status,
    createdAt: pass.created_at,
    checkedInAt: pass.checked_in_at,
    checkedInBy: pass.checked_in_by,
  }
}
