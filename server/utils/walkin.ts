import type { WalkinPass, WalkinPassStatus, WalkinRegisterPayload } from '~/types/walkin'

const MANILA_TZ = 'Asia/Manila'

export function getVisitDateManila(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ }).format(date)
}

export function resolvePassStatus(pass: WalkinPass): WalkinPassStatus {
  const today = getVisitDateManila()
  if (pass.visit_date < today) return 'expired'
  if (pass.status === 'checked_in') return 'checked_in'
  return 'registered'
}

export function validateWalkinPayload(body: unknown): WalkinRegisterPayload {
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
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required.' })
  }
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Phone number is required.' })
  }
  if (!emergencyContact) {
    throw createError({ statusCode: 400, statusMessage: 'Emergency contact is required.' })
  }

  return { fullName, email, phone, emergencyContact }
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
