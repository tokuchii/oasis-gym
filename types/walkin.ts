export type WalkinPassStatus = 'registered' | 'checked_in'

export interface WalkinPass {
  id: string
  pass_code: string
  full_name: string
  email: string
  phone: string
  emergency_contact: string
  visit_date: string
  status: WalkinPassStatus
  payment_amount: number | null
  created_at: string
  checked_in_at: string | null
  checked_in_by: string | null
}

export interface WalkinRegisterPayload {
  fullName: string
  email: string
  phone: string
  emergencyContact: string
}

export interface WalkinPassPublic {
  passCode: string
  fullName: string
  visitDate: string
  status: WalkinPassStatus
  qrPayload: string
}

export interface MembershipPayment {
  id: string
  full_name: string
  email: string
  phone: string
  plan: 'weekly' | 'monthly'
  coach: string | null
  payment_method: string
  reference_no: string | null
  amount: number
  receipt_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  expiry_date: string | null
  reminder_sent: boolean
  created_at: string
}

export interface Coach {
  id: string
  full_name: string
  specialty: string | null
  bio: string | null
  photo_url: string | null
  display_order: number
  active: boolean
  created_at: string
}

export interface CoachPayload {
  fullName: string
  specialty: string
  bio: string
  photoUrl: string
}

export interface ClientSession {
  id: string
  client_name: string
  client_email: string
  client_phone: string
  coach_name: string | null
  plan: 'weekly' | 'monthly'
  total_sessions: number
  sessions_used: number
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'expired'
  created_at: string
}

export const SESSION_LIMITS: Record<string, number> = {
  weekly: 4,
  monthly: 13,
}

export const MEMBERSHIP_PLANS = [
  {
    id: 'weekly',
    name: 'Weekly',
    price: '599',
    period: '/week',
    features: ['7 days unlimited access', 'Locker use', '1 group class', 'Coach selection available'],
    featured: true,
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: '1,499',
    period: '/month',
    features: ['30 days unlimited access', 'Locker + towel', 'Unlimited group classes', 'Coach selection available', 'Fitness assessment'],
    featured: false,
  },
]

export const MEMBERSHIP_PLANS_DISPLAY = [
  {
    id: 'daily',
    name: 'Daily (Walk-in)',
    price: '65',
    period: '/visit',
    features: ['Full-day access', 'Locker use', 'No commitment', 'Permanent QR code'],
    featured: false,
  },
  ...MEMBERSHIP_PLANS,
]

export const WALKIN_DEFAULT_FEE = 65
