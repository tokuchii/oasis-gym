export type WalkinPassStatus = 'registered' | 'checked_in' | 'expired'

export interface WalkinPass {
  id: string
  pass_code: string
  full_name: string
  email: string
  phone: string
  emergency_contact: string
  visit_date: string
  status: WalkinPassStatus
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
