export type WalkinPassStatus = 'registered' | 'checked_in'

export type MemberStatus = 'walkin' | 'weekly' | 'monthly' | 'yearly'

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
  points: number
  member_status: MemberStatus
  removed: boolean
}

export interface WalkinRegisterPayload {
  fullName: string
  email: string
  phone: string
  emergencyContact: string
  memberStatus?: MemberStatus
}

export interface WalkinPassPublic {
  passCode: string
  fullName: string
  visitDate: string
  status: WalkinPassStatus
}

export type MembershipPlanId = 'weekly' | 'monthly' | 'yearly'

export interface MembershipPayment {
  id: string
  full_name: string
  email: string
  phone: string
  plan: MembershipPlanId
  coach: string | null
  payment_method: string
  reference_no: string | null
  amount: number
  receipt_url: string | null
  status: 'pending' | 'partial' | 'approved' | 'rejected'
  note: string | null
  paid_amount: number | null
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
  plan: MembershipPlanId
  total_sessions: number
  sessions_used: number
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'expired'
  note: string | null
  paid_amount: number | null
  created_at: string
}

export const SESSION_LIMITS: Record<string, number> = {
  weekly: 4,
  monthly: 13,
  yearly: 156,
}

export const MEMBERSHIP_PLAN_TERMS: { id: MembershipPlanId; label: string; amount: number; days: number }[] = [
  { id: 'weekly', label: 'Weekly', amount: 599, days: 7 },
  { id: 'monthly', label: 'Monthly', amount: 1499, days: 30 },
  { id: 'yearly', label: 'Yearly', amount: 0, days: 365 },
]

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
    features: ['Full-day access', 'Locker use', 'No commitment', 'Permanent pass code'],
    featured: false,
  },
  ...MEMBERSHIP_PLANS,
]

export const WALKIN_DEFAULT_FEE = 65

export const MEMBER_STATUSES: { id: MemberStatus; label: string; short: string }[] = [
  { id: 'walkin', label: 'Walk-in (Daily)', short: 'Walk-in' },
  { id: 'weekly', label: 'Weekly Plan', short: 'Weekly' },
  { id: 'monthly', label: 'Monthly Plan', short: 'Monthly' },
  { id: 'yearly', label: 'Yearly Plan', short: 'Yearly' },
]

export function memberStatusLabel(status: string): string {
  return MEMBER_STATUSES.find((s) => s.id === status)?.short ?? 'Walk-in'
}
