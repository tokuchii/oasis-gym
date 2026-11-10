export type WalkinPassStatus = 'registered' | 'checked_in'

export type MemberStatus = 'walkin' | 'weekly' | 'monthly'

export type CustomerType = 'member' | 'non_member'

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
  customer_type: CustomerType
  removed: boolean
}

export interface WalkinRegisterPayload {
  fullName: string
  email: string
  phone: string
  emergencyContact: string
  memberStatus?: MemberStatus
  customerType?: CustomerType
}

export interface WalkinPassPublic {
  passCode: string
  fullName: string
  visitDate: string
  status: WalkinPassStatus
}

export type MembershipPlanId = 'daily' | 'weekly' | 'monthly'

export interface MembershipPayment {
  id: string
  full_name: string
  email: string
  phone: string
  plan: MembershipPlanId
  customer_type: CustomerType
  plan_price: number | null
  membership_fee: number
  instructor_fee: number
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
  customer_type: CustomerType
  payment_id: string | null
  total_sessions: number
  sessions_used: number
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'expired'
  note: string | null
  paid_amount: number | null
  created_at: string
}

export const PLAN_RATES: Record<CustomerType, Record<MembershipPlanId, number>> = {
  member: { daily: 65, weekly: 270, monthly: 850 },
  non_member: { daily: 85, weekly: 350, monthly: 1000 },
}

export const MEMBERSHIP_FEE = 300
export const INSTRUCTOR_FEE = 150

export const PLAN_TERMS: Record<MembershipPlanId, { days: number; sessions: number }> = {
  daily: { days: 1, sessions: 1 },
  weekly: { days: 7, sessions: 7 },
  monthly: { days: 30, sessions: 30 },
}

export const SESSION_LIMITS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
}

export const MEMBERSHIP_PLAN_TERMS: { id: MembershipPlanId; label: string; amount: number; days: number; sessions: number }[] = [
  { id: 'daily', label: 'Daily', amount: PLAN_RATES.member.daily, days: PLAN_TERMS.daily.days, sessions: PLAN_TERMS.daily.sessions },
  { id: 'weekly', label: 'Weekly', amount: PLAN_RATES.member.weekly, days: PLAN_TERMS.weekly.days, sessions: PLAN_TERMS.weekly.sessions },
  { id: 'monthly', label: 'Monthly', amount: PLAN_RATES.member.monthly, days: PLAN_TERMS.monthly.days, sessions: PLAN_TERMS.monthly.sessions },
]

export const MEMBERSHIP_PLANS = [
  {
    id: 'weekly',
    name: 'Weekly',
    price: '270',
    nonMemberPrice: '350',
    period: '/week',
    features: ['7 sessions (1 per visit)', 'Locker use', 'Coach selection available'],
    featured: true,
  },
  {
    id: 'monthly',
    name: 'Monthly',
    price: '850',
    nonMemberPrice: '1,000',
    period: '/month',
    features: ['30 sessions (1 per visit)', 'Locker + towel', 'Coach selection available', 'Fitness assessment'],
    featured: false,
  },
]

export const MEMBERSHIP_PLANS_DISPLAY = [
  {
    id: 'daily',
    name: 'Daily (Walk-in)',
    price: '65',
    nonMemberPrice: '85',
    period: '/visit',
    features: ['1 session', 'Locker use', 'No commitment', 'Permanent pass code'],
    featured: false,
  },
  ...MEMBERSHIP_PLANS,
]

export const WALKIN_DEFAULT_FEE = PLAN_RATES.non_member.daily

export const MEMBER_STATUSES: { id: MemberStatus; label: string; short: string }[] = [
  { id: 'walkin', label: 'Daily (Walk-in)', short: 'Daily' },
  { id: 'weekly', label: 'Weekly Plan', short: 'Weekly' },
  { id: 'monthly', label: 'Monthly Plan', short: 'Monthly' },
]

export function memberStatusLabel(status: string): string {
  return MEMBER_STATUSES.find((s) => s.id === status)?.short ?? 'Daily'
}

export function getPlanRate(plan: MembershipPlanId, customerType: CustomerType): number {
  return PLAN_RATES[customerType]?.[plan] ?? 0
}

export function getPlanDays(plan: MembershipPlanId): number {
  return PLAN_TERMS[plan]?.days ?? 0
}

export function getPlanSessions(plan: MembershipPlanId): number {
  return PLAN_TERMS[plan]?.sessions ?? 1
}

export function planToMemberStatus(plan: MembershipPlanId): MemberStatus {
  return plan === 'daily' ? 'walkin' : plan
}

export function clientTypeLabel(customerType: CustomerType, memberStatus: MemberStatus): string {
  if (customerType === 'non_member') return 'Non-member'
  if (memberStatus === 'weekly') return 'Member · Weekly Plan'
  if (memberStatus === 'monthly') return 'Member · Monthly Plan'
  return 'Member · No Plan'
}

export function clientDefaultRate(customerType: CustomerType, memberStatus: MemberStatus): number {
  if (memberStatus === 'weekly') return PLAN_RATES[customerType].weekly
  if (memberStatus === 'monthly') return PLAN_RATES[customerType].monthly
  return PLAN_RATES[customerType].daily
}
