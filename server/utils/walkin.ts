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

const MAX_LENGTHS = { fullName: 100, email: 254, phone: 15, emergencyContact: 100, specialty: 200, bio: 500 }

export const MEMBER_STATUS_IDS = ['walkin', 'weekly', 'monthly']
export const CUSTOMER_TYPE_IDS = ['member', 'non_member']

const SQL_INJECTION_RE = /(\b(OR|AND)\b\s+\d+\s*=\s*\d+|;\s*DROP|;\s*DELETE|;\s*INSERT|;\s*UPDATE|--\s*$|'\s*OR\s+')/i
const XSS_RE = /<\s*script|on\w+\s*=|javascript\s*:|<\s*iframe|<\s*object|<\s*embed|<\s*img[^>]+onerror/i
const DISPOSIVE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.com', 'guerrillamail.com', 'mailinator.com',
  'yopmail.com', 'temp-mail.org', 'fakeinbox.com', 'sharklasers.com',
  'guerrillamailblock.com', 'grr.la', 'dispostable.com', '10minutemail.com',
  'trashmail.com', 'discard.email', 'maildrop.cc', 'getnada.com',
  'mohmal.com', 'emailondeck.com', '33mail.com', 'mytemp.email',
  'tmpmail.net', 'tmpmail.org', 'discardmail.com', 'tempr.email',
])

const REPEATED_CHAR_RE = /(.)\1{4,}/

export function isSpamInput(input: string): string | null {
  if (SQL_INJECTION_RE.test(input)) return 'Input contains suspicious characters.'
  if (XSS_RE.test(input)) return 'Input contains invalid characters.'
  if (REPEATED_CHAR_RE.test(input.replace(/[@.\-+]/g, ''))) return 'Input contains repeated characters.'
  return null
}

export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim()
}

const NTC_PREFIXES = new Set([
  '0817', '0904', '0905', '0906', '0915', '0916', '0917', '0926',
  '0927', '0935', '0936', '0937', '0945', '0953', '0954', '0955',
  '0956', '0965', '0966', '0967', '0975', '0976', '0977', '0978',
  '0979', '0994', '0995', '0996', '0997',
  '0813', '0907', '0908', '0909', '0910', '0911', '0912', '0913',
  '0914', '0918', '0919', '0920', '0921', '0928', '0929', '0930',
  '0938', '0939', '0940', '0941', '0942', '0943', '0944', '0946',
  '0947', '0948', '0949', '0950', '0951', '0961', '0963', '0968',
  '0969', '0970', '0971', '0980', '0981', '0982', '0983', '0984',
  '0985', '0986', '0987', '0988', '0989', '0990', '0991', '0992',
  '0993', '0998', '0999',
])

const SEQUENTIAL_RE = /^09(1234567|2345678|3456789|0123456|1111111|0000000)/
const LOOKUP_RE = /^09(123456789|123123123|121212121|000000000|111111111)/

function hasRepeatingPattern(digits: string): boolean {
  if (digits.length !== 11) return false
  const suffix = digits.slice(2)
  const len = suffix.length
  if (len >= 9 && /^(.)\1{8}$/.test(suffix)) return true
  if (len >= 8 && /^(.{2})\1{3}$/.test(suffix)) return true
  if (len >= 9 && /^(.{3})\1{2}$/.test(suffix)) return true
  if (len === 8 && /^(.{4})\1$/.test(suffix)) return true
  if (/^(\d)\1(\d)\2{6}$/.test(suffix)) return true
  return false
}

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '')
  if (cleaned.startsWith('+639')) return cleaned
  if (cleaned.startsWith('639')) return '+' + cleaned
  if (cleaned.startsWith('09')) return '+63' + cleaned.slice(1)
  if (/^\d{10}$/.test(cleaned)) return '+63' + cleaned
  return cleaned
}

export function validatePhone(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-()]/g, '')
  if (!cleaned) return 'Phone number is required.'
  if (cleaned === '+63' || cleaned === '63') return 'Phone number is required.'
  if (cleaned.length > 13) return 'Phone number is too long (max 13 characters including +).'
  if (!/^\+?\d+$/.test(cleaned)) return 'Phone number must contain only digits (and optional leading +).'

  let localDigits = ''
  if (cleaned.startsWith('+639')) {
    if (cleaned.length !== 13) return 'International format must be +639XXXXXXXXX (13 characters).'
    localDigits = '0' + cleaned.slice(3)
  } else if (cleaned.startsWith('639')) {
    if (cleaned.length !== 12) return 'International format must be 639XXXXXXXXX (12 digits).'
    localDigits = '0' + cleaned.slice(2)
  } else if (cleaned.startsWith('09')) {
    if (cleaned.length !== 11) return 'Local format must be 09XXXXXXXXX (11 digits).'
    localDigits = cleaned
  } else {
    return 'Phone must start with 09, 639, or +639.'
  }

  const prefix4 = localDigits.slice(0, 4)
  if (!NTC_PREFIXES.has(prefix4)) return `Prefix ${prefix4} is not a registered Philippine mobile prefix.`

  if (localDigits.length === 11 && SEQUENTIAL_RE.test(localDigits)) return 'Sequential phone numbers are not allowed.'
  if (hasRepeatingPattern(localDigits)) return 'Repeating pattern phone numbers are not allowed.'
  if (LOOKUP_RE.test(localDigits)) return 'This phone number is not valid.'

  const spamCheck = isSpamInput(cleaned)
  if (spamCheck) return spamCheck
  return null
}

const GMAIL_PLACEHOLDERS = ['test', 'user', 'example', 'admin', 'info', 'contact', 'hello', 'support', 'demo', 'sample', 'null', 'undefined', 'email', 'mail', 'me']

export function validateEmail(email: string): string | null {
  const cleaned = email.trim().toLowerCase()
  if (!cleaned) return 'Email is required.'
  if (cleaned.length > MAX_LENGTHS.email) return 'Email is too long (max 254 characters).'
  if (/\s/.test(cleaned)) return 'Email must not contain spaces.'
  const atCount = (cleaned.match(/@/g) || []).length
  if (atCount !== 1) return 'Email must contain exactly one @ symbol.'
  const [localPart, domain] = cleaned.split('@')
  if (!localPart || !domain) return 'Invalid email format.'
  if (localPart.length < 1 || localPart.length > 64) return 'Email local part must be 1–64 characters.'
  if (/\.\./.test(localPart)) return 'Email must not contain consecutive dots.'
  if (localPart.startsWith('.') || localPart.endsWith('.')) return 'Email must not start or end with a dot.'
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return 'Email domain is invalid.'
  if (domain.includes('..')) return 'Email domain contains consecutive dots.'
  const tld = domain.split('.').pop()
  const validTlds = ['com', 'net', 'org', 'ph', 'edu', 'gov', 'io', 'info', 'biz', 'xyz']
  if (!tld || !validTlds.includes(tld)) return 'Email TLD is not supported.'
  if (tld === 'co') return 'Email TLD .co is not accepted.'
  if (DISPOSIVE_DOMAINS.has(domain)) return 'Disposable email addresses are not allowed.'
  const spamCheck = isSpamInput(cleaned)
  if (spamCheck) return spamCheck

  if (domain === 'gmail.com') {
    if (localPart.length < 6 || localPart.length > 30) return 'Gmail address must be 6–30 characters.'
    if (/[^a-z0-9.]/.test(localPart)) return 'Gmail can only contain letters, numbers, and dots.'
    if (/^\d+$/.test(localPart)) return 'Gmail username cannot be all numbers.'
    if (GMAIL_PLACEHOLDERS.includes(localPart.replace(/\./g, ''))) return 'Gmail username looks like a placeholder.'
    if (localPart.includes('+')) return 'Gmail alias with + is not accepted for registration.'
  } else {
    if (!/^[a-z0-9._-]+$/.test(localPart)) return 'Email local part contains invalid characters.'
  }

  return null
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string, maxRequests = 5, windowMs = 60000): string | null {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }
  entry.count++
  if (entry.count > maxRequests) return 'Too many requests. Please wait a moment and try again.'
  return null
}

export function validateWalkinPayload(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body.' })
  }

  const data = body as Record<string, unknown>
  if (data._hp) throw createError({ statusCode: 400, statusMessage: 'Invalid submission.' })

  const fullName = sanitizeText(String(data.fullName ?? ''))
  const emailRaw = String(data.email ?? '')
  const phoneRaw = String(data.phone ?? '')
  const emergencyContact = sanitizeText(String(data.emergencyContact ?? ''))
  const memberStatus = String(data.memberStatus ?? 'walkin').toLowerCase()
  const customerType = String(data.customerType ?? 'non_member').toLowerCase()

  if (!MEMBER_STATUS_IDS.includes(memberStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Member status must be daily, weekly, or monthly.' })
  }

  if (!CUSTOMER_TYPE_IDS.includes(customerType)) {
    throw createError({ statusCode: 400, statusMessage: 'Customer type must be member or non-member.' })
  }

  const spamCheck = isSpamInput(fullName)
  if (spamCheck) throw createError({ statusCode: 400, statusMessage: spamCheck })

  if (!fullName) {
    throw createError({ statusCode: 400, statusMessage: 'Full name is required.' })
  }
  if (fullName.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Full name must be at least 2 characters.' })
  }
  if (fullName.length > MAX_LENGTHS.fullName) {
    throw createError({ statusCode: 400, statusMessage: 'Full name is too long.' })
  }

  if (emailRaw.trim()) {
    const emailErr = validateEmail(emailRaw)
    if (emailErr) throw createError({ statusCode: 400, statusMessage: emailErr })
  }

  const phoneErr = validatePhone(phoneRaw)
  if (phoneErr) throw createError({ statusCode: 400, statusMessage: phoneErr })

  if (emergencyContact && emergencyContact.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Emergency contact must be at least 2 characters.' })
  }
  if (emergencyContact.length > MAX_LENGTHS.emergencyContact) {
    throw createError({ statusCode: 400, statusMessage: 'Emergency contact is too long.' })
  }

  return { fullName, email: emailRaw.trim().toLowerCase(), phone: normalizePhone(phoneRaw), emergencyContact, memberStatus, customerType }
}

export function validateCoachPayload(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body.' })
  }

  const data = body as Record<string, unknown>
  const fullName = sanitizeText(String(data.fullName ?? ''))
  const specialty = sanitizeText(String(data.specialty ?? ''))
  const bio = sanitizeText(String(data.bio ?? ''))
  const photoUrl = String(data.photoUrl ?? '').trim()

  if (!fullName) {
    throw createError({ statusCode: 400, statusMessage: 'Full name is required.' })
  }
  if (fullName.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Full name must be at least 2 characters.' })
  }
  if (fullName.length > MAX_LENGTHS.fullName) {
    throw createError({ statusCode: 400, statusMessage: 'Full name is too long.' })
  }
  if (specialty.length > MAX_LENGTHS.specialty) {
    throw createError({ statusCode: 400, statusMessage: 'Specialty is too long.' })
  }
  if (bio.length > MAX_LENGTHS.bio) {
    throw createError({ statusCode: 400, statusMessage: 'Bio is too long.' })
  }
  if (photoUrl && !/^(https?:\/\/|coach-photos\/)/.test(photoUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid photo URL.' })
  }

  return { fullName, specialty, bio, photoUrl }
}

export function validateMembershipPayload(fields: Record<string, string>) {
  const fullName = sanitizeText(fields.fullName ?? '')
  const emailRaw = fields.email ?? ''
  const phoneRaw = fields.phone ?? ''
  const plan = String(fields.plan ?? '').toLowerCase()
  const customerType = String(fields.customerType ?? 'member').toLowerCase()
  const paymentMethod = String(fields.paymentMethod ?? '').trim()
  const referenceNo = sanitizeText(fields.referenceNo ?? '')
  const amount = Number(fields.amount)

  const errors: string[] = []

  if (!fullName || fullName.length < 2) errors.push('Full name is required (min 2 characters).')
  if (fullName.length > MAX_LENGTHS.fullName) errors.push('Full name is too long.')

  const emailErr = validateEmail(emailRaw)
  if (emailErr) errors.push(emailErr)

  const phoneErr = validatePhone(phoneRaw)
  if (phoneErr) errors.push(phoneErr)

  if (!['daily', 'weekly', 'monthly'].includes(plan)) errors.push('Plan must be daily, weekly, or monthly.')
  if (!['member', 'non_member'].includes(customerType)) errors.push('Customer type must be member or non-member.')
  if (!['gcash', 'bank'].includes(paymentMethod)) errors.push('Payment method must be GCash or Bank Transfer.')
  if (isNaN(amount) || amount <= 0 || amount > 100000) errors.push('Amount must be between ₱1 and ₱100,000.')
  if (referenceNo && referenceNo.length > 40) errors.push('Reference number is too long.')

  if (errors.length > 0) {
    throw createError({ statusCode: 400, statusMessage: errors.join(' ') })
  }

  return { fullName, email: emailRaw.trim().toLowerCase(), phone: normalizePhone(phoneRaw), plan, customerType, paymentMethod, referenceNo, amount }
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
    points: pass.points ?? 0,
    memberStatus: pass.member_status ?? 'walkin',
    customerType: pass.customer_type ?? 'non_member',
  }
}
