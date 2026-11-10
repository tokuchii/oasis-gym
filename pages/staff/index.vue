<script setup lang="ts">
import {
  MEMBER_STATUSES,
  MEMBERSHIP_PLAN_TERMS,
  MEMBERSHIP_FEE,
  INSTRUCTOR_FEE,
  PLAN_RATES,
  clientDefaultRate,
  clientTypeLabel,
  type CustomerType,
  type MemberStatus,
  type MembershipPlanId,
} from '~/types/walkin'
import { useToast } from '~/composables/useToast'
import { useCachedFetch } from '~/composables/useCachedFetch'
import { useOnlineStatus } from '~/composables/useOnlineStatus'
import { useOfflineDb } from '~/composables/useOfflineDb'
import { getApiBase } from '~/composables/useApiBase'

const toast = useToast()
const { cachedGet, cachedPost } = useCachedFetch()
const { isOnline } = useOnlineStatus()
const { put: dbPut, get: dbGet } = useOfflineDb()

function apiUrl(path: string): string {
  const base = getApiBase()
  return base ? `${base}${path}` : path
}

useHead({ title: 'Staff Dashboard — OASIS FITNESS GYM' })

interface PassResult {
  id: string
  passCode: string
  fullName: string
  email: string
  phone: string
  emergencyContact: string
  visitDate: string
  status: 'registered' | 'checked_in'
  createdAt: string
  checkedInAt: string | null
  checkedInBy: string | null
  points: number
  memberStatus: string
  customerType: CustomerType
}

interface CoachItem {
  id: string
  fullName: string
  specialty: string | null
  bio: string | null
  photoUrl: string | null
}

interface ReportVisit {
  id: string
  passCode: string
  fullName: string
  email: string
  phone: string
  visitDate: string
  status: string
  paymentAmount: number | null
  createdAt: string
  checkedInAt: string | null
}

interface ReportSummary {
  totalVisits: number
  checkedOut: number
  totalRevenue: number
  walkinRevenue: number
  membershipRevenue: number
  uniqueMembers: number
  dateFrom: string
  dateTo: string
  period: string
}

interface ChartPoint {
  date: string
  label: string
  visits: number
  checkedOut: number
  revenue: number
  walkinRevenue: number
  membershipRevenue: number
}

const authenticated = ref(false)
const checkingSession = ref(true)
const loginPassword = ref('')
const loginError = ref('')
const loginSubmitting = ref(false)

type StaffTab = 'reports' | 'checkout' | 'walkin' | 'payment' | 'coaches'

const activeTab = ref<StaffTab>('reports')

const walkinForm = reactive({
  fullName: '',
  email: '',
  emergencyContact: '',
  memberStatus: 'walkin',
  customerType: 'non_member' as CustomerType,
})
const walkinPhoneLocal = ref('')
const walkinSubmitting = ref(false)
const walkinMessage = ref('')
const walkinPassCode = ref('')
const walkinFormHoneypot = ref('')

const walkinDefaultRate = computed(() =>
  clientDefaultRate(walkinForm.customerType, walkinForm.memberStatus as MemberStatus),
)

const selectedPass = ref<PassResult | null>(null)
const checkinLoading = ref(false)
const checkinMessage = ref('')
const checkinError = ref('')
const checkinCustomerType = ref<CustomerType>('non_member')
const checkinPaymentAmount = ref(PLAN_RATES.non_member.daily)

const membersList = ref<PassResult[]>([])
const membersLoading = ref(false)
const membersError = ref('')
const membersFilter = ref('')
const membersSortAsc = ref(true)
const membersLimit = ref(5)
const membersStatusFilter = ref('all')
const memberRemoving = ref('')
const memberConfirmRemove = ref('')
const memberStatusUpdating = ref('')

const memberStatusOptions = MEMBER_STATUSES

function memberStatusLabel(status: string): string {
  return MEMBER_STATUSES.find((s) => s.id === status)?.short ?? 'Walk-in'
}

function memberStatusClass(status: string): string {
  if (status === 'weekly') return 'text-sky-300'
  if (status === 'monthly') return 'text-gold'
  return 'text-mist'
}

function clientTypeLabelFor(member: PassResult): string {
  return clientTypeLabel(member.customerType ?? 'non_member', (member.memberStatus ?? 'walkin') as MemberStatus)
}

function clientDefaultRateFor(member: PassResult): number {
  return clientDefaultRate(member.customerType ?? 'non_member', (member.memberStatus ?? 'walkin') as MemberStatus)
}

function clientTypeClass(member: PassResult): string {
  if (member.customerType === 'non_member') return 'text-mist'
  if (member.memberStatus === 'weekly') return 'text-sky-300'
  if (member.memberStatus === 'monthly') return 'text-gold'
  return 'text-green-400'
}

const memberStatusCounts = computed(() => {
  const counts: Record<string, number> = { all: membersList.value.length }
  for (const option of MEMBER_STATUSES) {
    counts[option.id] = membersList.value.filter((m) => (m.memberStatus ?? 'walkin') === option.id).length
  }
  return counts
})

const filteredMembers = computed(() => {
  const query = membersFilter.value.trim().toLowerCase()
  const byStatus = membersStatusFilter.value === 'all'
    ? membersList.value
    : membersList.value.filter((m) => (m.memberStatus ?? 'walkin') === membersStatusFilter.value)
  const filtered = query
    ? byStatus.filter((m) =>
        m.fullName.toLowerCase().includes(query) || m.phone.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')),
      )
    : byStatus
  return [...filtered].sort((a, b) => {
    const cmp = a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' })
    return membersSortAsc.value ? cmp : -cmp
  })
})

function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

const reportPeriod = ref<'day' | 'week' | 'month' | 'year'>('day')
const reportPeriodLabel = computed(() => {
  if (reportPeriod.value === 'day') return 'Today'
  if (reportPeriod.value === 'week') return 'This Week'
  if (reportPeriod.value === 'month') return 'This Month'
  return 'This Year'
})
const reportGeneratedAtLabel = computed(() => reportGeneratedAt.value ? formatPdfDateTime(reportGeneratedAt.value) : '—')
const reportLoading = ref(false)
const reportError = ref('')
const reportGeneratedAt = ref('')
const reportData = ref<{ visits: ReportVisit[]; summary: ReportSummary; chartData: ChartPoint[]; availableDates: string[] } | null>(null)

const showExportModal = ref(false)
const exportFrom = ref('')
const exportTo = ref('')
const exportLoading = ref(false)
const exportError = ref('')

const sortedVisits = computed(() => {
  if (!reportData.value) return []
  return [...reportData.value.visits].sort((a, b) => {
    const aTime = a.checkedInAt || a.createdAt
    const bTime = b.checkedInAt || b.createdAt
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })
})

const reminderLoading = ref(false)
const reminderMessage = ref('')
const reminderError = ref('')

async function sendReminders() {
  reminderLoading.value = true

  try {
    const api = useApi()
    const data = await api<{ message: string; sent: number; failed: number }>(apiUrl('/api/membership/send-reminders'), {
      method: 'POST',
    })
    toast.success(data.message)
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    toast.error(fetchErr.data?.statusMessage ?? 'Failed to send reminders.')
  } finally {
    reminderLoading.value = false
  }
}

const coachesList = ref<CoachItem[]>([])
const coachLoading = ref(false)
const coachError = ref('')
const coachSuccess = ref('')
const editingCoach = ref<CoachItem | null>(null)
const visitLogLimit = ref(5)
const coachForm = reactive({
  fullName: '',
  specialty: [] as string[],
  bio: '',
  photoUrl: '',
})
const coachPhotoFile = ref<File | null>(null)
const coachPhotoPreview = ref('')
const coachPhotoUploading = ref(false)

const specialtyOptions = [
  'Strength Training',
  'Cardio & HIIT',
  'Weight Loss',
  'Yoga & Flexibility',
  'CrossFit',
  'Boxing & MMA',
  'Rehabilitation',
  'Sports Performance',
  'Other',
]
const customSpecialty = ref('')

function getSpecialtyString(): string {
  const selected = coachForm.specialty.filter((s) => s !== 'Other')
  if (coachForm.specialty.includes('Other') && customSpecialty.value.trim()) {
    selected.push(customSpecialty.value.trim())
  }
  return selected.join(', ')
}

async function loadOverview() {
  try {
    await Promise.all([loadPayments(), loadCoaches()])
  } catch {}
}

const showAllCoaches = ref(false)

const maxRevenue = computed(() => {
  if (!reportData.value?.chartData.length) return 1
  return Math.max(...reportData.value.chartData.map(p => p.revenue), 1)
})

const maxVisits = computed(() => {
  if (!reportData.value?.chartData.length) return 1
  return Math.max(...reportData.value.chartData.map(p => p.visits), 1)
})

async function checkSession() {
  checkingSession.value = true
  try {
    const api = useApi()
    const data = await api<{ authenticated: boolean }>(apiUrl('/api/admin/session'))
    authenticated.value = data.authenticated
    await dbPut('meta', { key: 'session', authenticated: data.authenticated, cachedAt: Date.now() })
  } catch {
    const cached = await dbGet<{ authenticated: boolean; cachedAt: number }>('meta', 'session')
    if (cached && Date.now() - cached.cachedAt < 8 * 60 * 60 * 1000) {
      authenticated.value = cached.authenticated
    } else {
      authenticated.value = false
    }
  } finally {
    checkingSession.value = false
  }
}

async function login() {
  loginError.value = ''
  loginSubmitting.value = true
  try {
    const api = useApi()
    await api(apiUrl('/api/admin/login'), {
      method: 'POST',
      body: { password: loginPassword.value },
    })
    authenticated.value = true
    loginPassword.value = ''
    loadReports()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    loginError.value = fetchErr.data?.statusMessage ?? 'Login failed.'
  } finally {
    loginSubmitting.value = false
  }
}

async function logout() {
  const api = useApi()
  await api(apiUrl('/api/admin/logout'), { method: 'POST' })
  authenticated.value = false
  resetState()
  navigateTo('/')
}

function resetState() {
  selectedPass.value = null
  membersList.value = []
  membersFilter.value = ''
  membersError.value = ''
  checkinMessage.value = ''
  checkinError.value = ''
  walkinMessage.value = ''
  walkinPassCode.value = ''
}

const walkinPhone = computed(() => (walkinPhoneLocal.value ? `+63${walkinPhoneLocal.value}` : ''))

function onPhoneInput(event: Event) {
  const input = event.target as HTMLInputElement
  let digits = input.value.replace(/\D/g, '')
  if (digits.startsWith('63')) digits = digits.slice(2)
  digits = digits.replace(/^0+/, '').slice(0, 10)
  walkinPhoneLocal.value = digits
  input.value = digits
}

async function submitWalkin() {
  walkinMessage.value = ''
  walkinPassCode.value = ''

  if (walkinFormHoneypot.value) return

  const errors: string[] = []
  const name = walkinForm.fullName.trim()
  if (!name) errors.push('Full name is required.')
  else if (name.length < 2) errors.push('Full name must be at least 2 characters.')
  else if (name.length > 100) errors.push('Full name is too long.')

  const email = walkinForm.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email format is invalid.')

  const phone = walkinPhone.value
  if (!phone) errors.push('Phone number is required.')
  else if (!/^(\+639|09)\d{9}$/.test(phone)) errors.push('Phone must be a valid Philippine mobile number (+639XXXXXXXXX).')

  const emergency = walkinForm.emergencyContact.trim()
  if (emergency && emergency.length < 2) errors.push('Emergency contact must be at least 2 characters.')
  else if (emergency && emergency.length > 100) errors.push('Emergency contact is too long.')

  if (errors.length > 0) {
    toast.error(errors.join(' '))
    return
  }

  walkinSubmitting.value = true
  try {
    const data = await cachedPost<{ passCode?: string; message: string; duplicate?: boolean; restored?: boolean }>('/api/walkin/register', {
      fullName: walkinForm.fullName,
      email: walkinForm.email,
      phone: walkinPhone.value,
      emergencyContact: walkinForm.emergencyContact,
      memberStatus: walkinForm.memberStatus,
      customerType: walkinForm.customerType,
    }, {
      label: `Register ${walkinForm.fullName}`,
      cacheInvalidates: ['passes'],
    })
    if (data.duplicate) {
      toast.warning(data.message)
      return
    }
    walkinPassCode.value = data.passCode ?? ''
    walkinMessage.value = data.message
    walkinForm.fullName = ''
    walkinForm.email = ''
    walkinPhoneLocal.value = ''
    walkinForm.emergencyContact = ''
    walkinForm.memberStatus = 'walkin'
    walkinForm.customerType = 'non_member'
    if (data.restored) toast.info(data.message)
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    toast.error(fetchErr.data?.statusMessage ?? 'Registration failed.')
  } finally {
    walkinSubmitting.value = false
  }
}

async function loadMembers() {
  if (membersLoading.value) return
  membersLoading.value = true
  membersError.value = ''
  membersLimit.value = 5
  try {
    const data = await cachedGet<{ members: PassResult[] }>('/api/walkin/list', {
      cache: { store: 'passes', label: 'Walk-in members' },
    })
    membersList.value = data.members
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    membersError.value = fetchErr.data?.statusMessage ?? (err instanceof Error ? err.message : 'Failed to load members.')
    membersList.value = []
  } finally {
    membersLoading.value = false
  }
}

function resetTabState(tab: StaffTab) {
  if (tab === 'reports') {
    reportPeriod.value = 'day'
    reportGeneratedAt.value = ''
    reminderMessage.value = ''
    reminderError.value = ''
    visitLogLimit.value = 5
    showAllCoaches.value = false
  } else if (tab === 'checkout') {
    selectedPass.value = null
    checkinMessage.value = ''
    checkinError.value = ''
    checkinCustomerType.value = 'non_member'
    checkinPaymentAmount.value = PLAN_RATES.non_member.daily
    membersFilter.value = ''
    membersSortAsc.value = true
    membersLimit.value = 5
    membersStatusFilter.value = 'all'
    membersError.value = ''
    memberConfirmRemove.value = ''
  } else if (tab === 'walkin') {
    walkinForm.fullName = ''
    walkinForm.email = ''
    walkinForm.emergencyContact = ''
    walkinForm.memberStatus = 'walkin'
    walkinForm.customerType = 'non_member'
    walkinPhoneLocal.value = ''
    walkinMessage.value = ''
    walkinPassCode.value = ''
    walkinFormHoneypot.value = ''
  } else if (tab === 'payment') {
    clearTxMember()
    txForm.plan = 'monthly'
    txForm.customerType = 'member'
    txForm.includeMembershipFee = false
    txForm.includeInstructorFee = false
    txForm.paidAmount = PLAN_RATES.member.monthly
    txForm.paymentMethod = 'cash'
    txForm.referenceNo = ''
    txForm.coach = ''
    txForm.note = ''
    txMemberSearch.value = ''
    txError.value = ''
    paymentsError.value = ''
    paymentNoteInput.value = ''
    paymentPaidAmountInput.value = ''
    paymentPartialAmountInput.value = ''
    paymentPartialNoteInput.value = ''
    receiptModalUrl.value = ''
    receiptModalName.value = ''
    receiptModalLoading.value = false
  } else if (tab === 'coaches') {
    resetCoachForm()
    coachError.value = ''
    coachSuccess.value = ''
    coachConfirmDelete.value = ''
  }
}

watch(activeTab, (tab, prevTab) => {
  if (prevTab) resetTabState(prevTab)

  if (tab === 'reports') loadReports()
  else if (tab === 'checkout') loadMembers()
  else if (tab === 'payment') initPaymentTab()
  else if (tab === 'coaches') loadCoaches()
})

function syncCheckinFromPass(pass: PassResult) {
  const type: CustomerType = pass.customerType === 'member' ? 'member' : 'non_member'
  checkinCustomerType.value = type
  const hasPlan = type === 'member' && (pass.memberStatus === 'weekly' || pass.memberStatus === 'monthly')
  checkinPaymentAmount.value = hasPlan ? 0 : PLAN_RATES[type].daily
}

function selectPass(pass: PassResult) {
  selectedPass.value = pass
  checkinMessage.value = ''
  checkinError.value = ''
  syncCheckinFromPass(pass)
}

async function checkIn(passCode: string, auto = false) {
  if (!auto) {
    toast.info('Processing checkout...')
  }
  checkinLoading.value = true
  checkinMessage.value = ''
  checkinError.value = ''

  try {
    const data = await cachedPost<{ pass: PassResult; message: string }>('/api/walkin/checkout', {
      passCode, paymentAmount: checkinPaymentAmount.value,
    }, {
      label: `Checkout ${passCode}`,
      cacheInvalidates: ['passes', 'reports'],
    })
    checkinMessage.value = data.message
    toast.success(data.message)
    selectedPass.value = data.pass
    await loadMembers()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      checkinMessage.value = 'Checkout queued — will sync when back online.'
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      checkinError.value = fetchErr.data?.statusMessage ?? 'Check-out failed.'
      toast.error(fetchErr.data?.statusMessage ?? 'Check-out failed.')
    }
  } finally {
    checkinLoading.value = false
  }
}

async function removeMember(member: PassResult) {
  if (memberConfirmRemove.value !== member.id) {
    memberConfirmRemove.value = member.id
    setTimeout(() => { memberConfirmRemove.value = '' }, 5000)
    return
  }

  memberConfirmRemove.value = ''
  memberRemoving.value = member.id
  membersError.value = ''

  try {
    const data = await cachedPost<{ message: string }>('/api/walkin/delete', { id: member.id }, {
      label: `Remove member ${member.fullName}`,
      cacheInvalidates: ['passes', 'reports'],
    })
    if (selectedPass.value?.id === member.id) selectedPass.value = null
    toast.success(data.message)
    await loadMembers()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Removal queued — will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      membersError.value = fetchErr.data?.statusMessage ?? 'Failed to remove member.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to remove member.')
    }
  } finally {
    memberRemoving.value = ''
  }
}

async function updateMemberStatus(member: PassResult, memberStatus: string) {
  if (!memberStatus || memberStatus === (member.memberStatus ?? 'walkin')) return

  memberStatusUpdating.value = member.id
  membersError.value = ''

  try {
    const data = await cachedPost<{ pass: PassResult; message: string }>('/api/walkin/update-status', {
      id: member.id,
      memberStatus,
    }, {
      label: `Update status for ${member.fullName}`,
      cacheInvalidates: ['passes'],
    })
    const index = membersList.value.findIndex((m) => m.id === member.id)
    if (index !== -1) membersList.value[index] = data.pass
    if (selectedPass.value?.id === member.id) {
      selectedPass.value = data.pass
      syncCheckinFromPass(data.pass)
    }
    toast.success(data.message)
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Status update queued — will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      membersError.value = fetchErr.data?.statusMessage ?? 'Failed to update membership status.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to update membership status.')
    }
  } finally {
    memberStatusUpdating.value = ''
  }
}

async function updateCustomerType(member: PassResult, customerType: CustomerType) {
  if (!customerType || customerType === (member.customerType ?? 'non_member')) return

  memberStatusUpdating.value = member.id
  membersError.value = ''

  try {
    const data = await cachedPost<{ pass: PassResult; message: string }>('/api/walkin/update-status', {
      id: member.id,
      customerType,
    }, {
      label: `Update client type for ${member.fullName}`,
      cacheInvalidates: ['passes'],
    })
    const index = membersList.value.findIndex((m) => m.id === member.id)
    if (index !== -1) membersList.value[index] = data.pass
    if (selectedPass.value?.id === member.id) {
      selectedPass.value = data.pass
      syncCheckinFromPass(data.pass)
    }
    toast.success(data.message)
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Client type update queued — will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      membersError.value = fetchErr.data?.statusMessage ?? 'Failed to update client type.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to update client type.')
    }
  } finally {
    memberStatusUpdating.value = ''
  }
}

function onMemberToggle(member: PassResult, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  updateCustomerType(member, checked ? 'member' : 'non_member')
}

interface MembershipPayment {
  id: string
  fullName: string
  email: string
  phone: string
  plan: MembershipPlanId
  customerType: CustomerType
  planPrice: number | null
  membershipFee: number
  instructorFee: number
  coach: string | null
  paymentMethod: string
  referenceNo: string | null
  amount: number
  receiptUrl: string | null
  status: 'pending' | 'partial' | 'approved' | 'rejected'
  note: string | null
  paidAmount: number | null
  expiryDate: string | null
  createdAt: string
}

interface PaymentSummary {
  total: number
  pending: number
  partial: number
  approved: number
  history: number
  rejected: number
  totalRevenue: number
}

const paymentsList = ref<MembershipPayment[]>([])
const paymentsSummary = ref<PaymentSummary | null>(null)
const paymentsLoading = ref(false)
const paymentsError = ref('')
const paymentActionLoading = ref('')
const paymentNoteInput = ref('')
const paymentPaidAmountInput = ref('')
const paymentPartialAmountInput = ref('')
const paymentPartialNoteInput = ref('')
const receiptModalUrl = ref('')
const receiptModalName = ref('')
const receiptModalLoading = ref(false)

const txForm = reactive({
  memberId: '',
  memberName: '',
  memberPhone: '',
  memberEmail: '',
  plan: 'monthly' as MembershipPlanId,
  customerType: 'member' as CustomerType,
  includeMembershipFee: false,
  includeInstructorFee: false,
  paidAmount: PLAN_RATES.member.monthly,
  paymentMethod: 'cash',
  referenceNo: '',
  coach: '',
  note: '',
})
const txMemberSearch = ref('')
const txMembers = ref<PassResult[]>([])
const txSubmitting = ref(false)
const txError = ref('')

const txMemberMatches = computed(() => {
  const query = txMemberSearch.value.trim().toLowerCase()
  if (!query) return txMembers.value.slice(0, 6)
  return txMembers.value
    .filter((m) =>
      m.fullName.toLowerCase().includes(query) || m.phone.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')),
    )
    .slice(0, 6)
})

const txExpiry = computed(() => {
  const term = MEMBERSHIP_PLAN_TERMS.find((t) => t.id === txForm.plan)
  if (!term) return ''
  const date = new Date()
  date.setDate(date.getDate() + term.days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
})

const txPlanPrice = computed(() => PLAN_RATES[txForm.customerType][txForm.plan] ?? 0)
const txFeeTotal = computed(() => (txForm.includeMembershipFee ? MEMBERSHIP_FEE : 0) + (txForm.includeInstructorFee ? INSTRUCTOR_FEE : 0))
const txSuggestedAmount = computed(() => txPlanPrice.value + txFeeTotal.value)
const txAmountValue = computed(() => txSuggestedAmount.value)
const txPaidValue = computed(() => Number(txForm.paidAmount) || 0)
const txPaymentStatus = computed(() => txPaidValue.value >= txAmountValue.value ? 'Full' : 'Partial')
const txBalance = computed(() => Math.max(0, txAmountValue.value - txPaidValue.value))
const txChange = computed(() => Math.max(0, txPaidValue.value - txAmountValue.value))

function syncTxPaid(resetPaid = true) {
  if (resetPaid) txForm.paidAmount = txSuggestedAmount.value
}

function setTxPlan(planId: MembershipPlanId) {
  txForm.plan = planId
  syncTxPaid()
}

function setTxCustomerType(type: CustomerType) {
  txForm.customerType = type
  syncTxPaid()
}

function toggleTxFee() {
  syncTxPaid()
}

function selectTxMember(member: PassResult) {
  txForm.memberId = member.id
  txForm.memberName = member.fullName
  txForm.memberPhone = member.phone
  txForm.memberEmail = member.email
  txMemberSearch.value = ''
  txForm.customerType = member.customerType === 'member' ? 'member' : 'non_member'
  const suggestedPlan: MembershipPlanId = member.memberStatus === 'walkin' ? 'daily' : member.memberStatus as MembershipPlanId
  setTxPlan(suggestedPlan)
}

function clearTxMember() {
  txForm.memberId = ''
  txForm.memberName = ''
  txForm.memberPhone = ''
  txForm.memberEmail = ''
  syncTxPaid()
}

async function loadTxMembers() {
  if (txMembers.value.length) return
  try {
    const data = await cachedGet<{ members: PassResult[] }>('/api/walkin/list', {
      params: { all: '1' },
      cache: { store: 'passes', label: 'Members for transactions' },
    })
    txMembers.value = data.members
  } catch {
    if (isOnline.value) toast.error('Failed to load members for transactions.')
  }
}

async function submitTransaction() {
  txError.value = ''

  if (!txForm.memberName.trim()) {
    txError.value = 'Select a member first.'
    toast.error('Select a member first.')
    return
  }
  if (!txSuggestedAmount.value || txSuggestedAmount.value <= 0) {
    txError.value = 'Select a valid plan and customer type.'
    toast.error('Select a valid plan and customer type.')
    return
  }
  if (!txForm.paidAmount || txForm.paidAmount <= 0) {
    txError.value = 'Enter the amount the client paid.'
    toast.error('Enter the amount the client paid.')
    return
  }

  txSubmitting.value = true
  try {
    const data = await cachedPost<{ message: string }>('/api/membership/create', {
      memberId: txForm.memberId,
      fullName: txForm.memberName,
      email: txForm.memberEmail,
      phone: txForm.memberPhone,
      plan: txForm.plan,
      customerType: txForm.customerType,
      includeMembershipFee: txForm.includeMembershipFee,
      includeInstructorFee: txForm.includeInstructorFee,
      paidAmount: txForm.paidAmount,
      paymentMethod: txForm.paymentMethod,
      referenceNo: txForm.referenceNo,
      coach: txForm.coach,
      note: txForm.note,
    }, {
      label: `Transaction for ${txForm.memberName}`,
      cacheInvalidates: ['clients', 'passes'],
    })
    toast.success(data.message)
    clearTxMember()
    txForm.plan = 'monthly'
    txForm.customerType = 'member'
    txForm.includeMembershipFee = false
    txForm.includeInstructorFee = false
    txForm.paidAmount = PLAN_RATES.member.monthly
    txForm.referenceNo = ''
    txForm.coach = ''
    txForm.note = ''
    await loadPayments()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Transaction queued — will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      txError.value = fetchErr.data?.statusMessage ?? 'Failed to record transaction.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to record transaction.')
    }
  } finally {
    txSubmitting.value = false
  }
}

function initPaymentTab() {
  loadPayments()
  loadCoaches()
  loadTxMembers()
}

async function openReceiptModal(url: string, name: string) {
  receiptModalLoading.value = true
  receiptModalUrl.value = ''
  receiptModalName.value = name
  try {
    const api = useApi()
    const data = await api<{ signedUrl: string }>(apiUrl('/api/membership/receipt-url'), {
      method: 'POST',
      body: { url },
    })
    receiptModalUrl.value = data.signedUrl
  } catch {
    receiptModalUrl.value = ''
    receiptModalName.value = 'Failed to load receipt'
  } finally {
    receiptModalLoading.value = false
  }
}

async function loadPayments() {
  paymentsError.value = ''
  paymentsLoading.value = true
  try {
    const data = await cachedGet<{ payments: MembershipPayment[]; summary: PaymentSummary }>('/api/membership/list', {
      cache: { store: 'clients', label: 'Payments' },
    })
    paymentsList.value = data.payments
    paymentsSummary.value = data.summary
  } catch {
    if (isOnline.value) toast.error('Failed to load payments.')
  } finally {
    paymentsLoading.value = false
  }
}

async function updatePaymentStatus(id: string, status: 'approved' | 'rejected' | 'partial') {
  const label = status === 'approved' ? 'Approve' : status === 'partial' ? 'Mark Partial' : 'Reject'

  paymentActionLoading.value = id
  try {
    const body: Record<string, unknown> = { id, status, note: paymentNoteInput.value.trim() || null }
    if (status === 'partial') {
      const paid = parseFloat(paymentPaidAmountInput.value)
      if (!isNaN(paid) && paid > 0) body.paidAmount = paid
    }
    await cachedPost('/api/membership/update-status', body, {
      label: `${label} payment`,
      cacheInvalidates: ['clients'],
    })
    paymentNoteInput.value = ''
    paymentPaidAmountInput.value = ''
    await loadPayments()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning(`${label} queued — will sync when back online.`)
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      paymentsError.value = fetchErr.data?.statusMessage ?? `Failed to ${label.toLowerCase()} payment.`
    }
  } finally {
    paymentActionLoading.value = ''
  }
}

async function markPartialDone(payment: MembershipPayment) {
  paymentActionLoading.value = payment.id
  try {
    await cachedPost('/api/membership/update-status', {
      id: payment.id, status: 'approved', paidAmount: payment.amount, note: 'Remaining balance paid — fully settled.',
    }, {
      label: `Mark ${payment.fullName} done`,
      cacheInvalidates: ['clients'],
    })
    toast.success(`${payment.fullName}'s payment marked as fully paid.`)
    await loadPayments()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Mark done queued — will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      paymentsError.value = fetchErr.data?.statusMessage ?? 'Failed to mark as done.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to mark as done.')
    }
  } finally {
    paymentActionLoading.value = ''
  }
}

async function addPartialPayment(payment: MembershipPayment) {
  const addAmount = parseFloat(paymentPartialAmountInput.value)
  if (!addAmount || isNaN(addAmount) || addAmount <= 0) {
    toast.error('Enter a valid amount to add.')
    return
  }
  paymentActionLoading.value = payment.id
  try {
    const result = await cachedPost<{ message: string; overpayment: number }>('/api/membership/add-partial', {
      id: payment.id, addAmount, note: paymentPartialNoteInput.value.trim() || null,
    }, {
      label: `Add ₱${addAmount} to ${payment.fullName}`,
      cacheInvalidates: ['clients'],
    })
    if (result.overpayment > 0) {
      toast.success(`₱${addAmount.toLocaleString()} added. ₱${result.overpayment.toLocaleString()} overpaid — ready for approval.`)
    } else {
      toast.success(result.message)
    }
    paymentPartialAmountInput.value = ''
    paymentPartialNoteInput.value = ''
    await loadPayments()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Payment queued — will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      paymentsError.value = fetchErr.data?.statusMessage ?? 'Failed to add payment.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to add payment.')
    }
  } finally {
    paymentActionLoading.value = ''
  }
}

async function approvePartialPayment(payment: MembershipPayment) {
  paymentActionLoading.value = payment.id
  try {
    await cachedPost('/api/membership/update-status', {
      id: payment.id, status: 'approved', paidAmount: payment.paidAmount, note: 'Fully settled — approved.',
    }, {
      label: `Approve ${payment.fullName}`,
      cacheInvalidates: ['clients'],
    })
    toast.success(`${payment.fullName}'s payment approved.`)
    await loadPayments()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Approval queued — will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      paymentsError.value = fetchErr.data?.statusMessage ?? 'Failed to approve payment.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to approve payment.')
    }
  } finally {
    paymentActionLoading.value = ''
  }
}

function setReportPeriod(period: 'day' | 'week' | 'month' | 'year') {
  reportPeriod.value = period
  loadReports()
}

async function loadReports() {
  reportError.value = ''
  reportLoading.value = true
  reportData.value = null
  visitLogLimit.value = 5

  try {
    const params: Record<string, string> = { period: reportPeriod.value }
    const data = await cachedGet<{ visits: ReportVisit[]; summary: ReportSummary; chartData: ChartPoint[]; availableDates: string[] }>('/api/staff/reports', {
      params,
      cache: { store: 'reports', label: 'Reports' },
    })
    reportData.value = data
    reportGeneratedAt.value = new Date().toISOString()
  } catch {
    if (isOnline.value) toast.error('Failed to load reports.')
  } finally {
    reportLoading.value = false
    loadOverview()
  }
}

async function loadCoaches() {
  coachError.value = ''
  try {
    const data = await cachedGet<{ coaches: CoachItem[] }>('/api/coaches/list', {
      cache: { store: 'coaches', label: 'Coaches' },
    })
    coachesList.value = data.coaches
  } catch {
    if (isOnline.value) toast.error('Failed to load coaches.')
  }
}

function resetCoachForm() {
  coachForm.fullName = ''
  coachForm.specialty = []
  coachForm.bio = ''
  coachForm.photoUrl = ''
  coachPhotoFile.value = null
  coachPhotoPreview.value = ''
  customSpecialty.value = ''
  editingCoach.value = null
}

function handleCoachPhotoChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) { coachPhotoFile.value = null; coachPhotoPreview.value = ''; return }
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) { coachError.value = 'Photo must be under 5MB'; input.value = ''; return }
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) { coachError.value = 'Only JPEG, PNG, or WebP images accepted'; input.value = ''; return }
  coachError.value = ''
  coachPhotoFile.value = file
  coachPhotoPreview.value = URL.createObjectURL(file)
}

async function uploadCoachPhoto(): Promise<string | null> {
  if (!coachPhotoFile.value) return coachForm.photoUrl || null
  coachPhotoUploading.value = true
  try {
    const formData = new FormData()
    formData.append('photo', coachPhotoFile.value)
    const api = useApi()
    const data = await api<{ photoUrl: string }>(apiUrl('/api/coaches/upload-photo'), { method: 'POST', body: formData })
    return data.photoUrl
  } catch {
    return null
  } finally {
    coachPhotoUploading.value = false
  }
}

function startEditCoach(coach: CoachItem) {
  editingCoach.value = coach
  coachForm.fullName = coach.fullName
  const specialties = coach.specialty ? coach.specialty.split(', ').filter(Boolean) : []
  const known = specialtyOptions.filter((o) => o !== 'Other')
  coachForm.specialty = specialties.filter((s) => known.includes(s))
  const customParts = specialties.filter((s) => !known.includes(s))
  customSpecialty.value = customParts.join(', ')
  if (customParts.length > 0) coachForm.specialty.push('Other')
  coachForm.bio = coach.bio ?? ''
  coachForm.photoUrl = coach.photoUrl ?? ''
  coachError.value = ''
  coachSuccess.value = ''
}

async function addCoach() {
  const errors: string[] = []
  const name = coachForm.fullName.trim()
  if (!name) errors.push('Full name is required.')
  else if (name.length < 2) errors.push('Full name must be at least 2 characters.')
  else if (name.length > 100) errors.push('Full name is too long.')

  if (coachForm.bio.length > 500) errors.push('Bio is too long (max 500 characters).')
  if (getSpecialtyString().length > 200) errors.push('Specialty is too long (max 200 characters).')

  if (errors.length > 0) {
    coachError.value = errors.join(' ')
    return
  }

  coachError.value = ''
  coachSuccess.value = ''
  coachLoading.value = true

  try {
    const photoUrl = await uploadCoachPhoto()
    const data = await cachedPost<{ message: string }>('/api/coaches/create', {
      fullName: coachForm.fullName,
      specialty: getSpecialtyString(),
      bio: coachForm.bio,
      photoUrl: photoUrl ?? '',
    }, {
      label: `Add coach ${coachForm.fullName}`,
      cacheInvalidates: ['coaches'],
    })
    coachSuccess.value = data.message
    toast.success(data.message)
    resetCoachForm()
    await loadCoaches()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Coach creation queued ΓÇö will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      coachError.value = fetchErr.data?.statusMessage ?? 'Failed to add coach.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to add coach.')
    }
  } finally {
    coachLoading.value = false
  }
}

async function updateCoach() {
  if (!editingCoach.value) return

  const errors: string[] = []
  const name = coachForm.fullName.trim()
  if (!name) errors.push('Full name is required.')
  else if (name.length < 2) errors.push('Full name must be at least 2 characters.')
  else if (name.length > 100) errors.push('Full name is too long.')

  if (coachForm.bio.length > 500) errors.push('Bio is too long (max 500 characters).')
  if (getSpecialtyString().length > 200) errors.push('Specialty is too long (max 200 characters).')

  if (errors.length > 0) {
    coachError.value = errors.join(' ')
    return
  }

  coachError.value = ''
  coachSuccess.value = ''
  coachLoading.value = true

  try {
    const photoUrl = await uploadCoachPhoto()
    const data = await cachedPost<{ message: string }>('/api/coaches/update', {
      id: editingCoach.value.id,
      fullName: coachForm.fullName,
      specialty: getSpecialtyString(),
      bio: coachForm.bio,
      photoUrl: photoUrl ?? coachForm.photoUrl,
    }, {
      label: `Update coach ${coachForm.fullName}`,
      cacheInvalidates: ['coaches'],
    })
    coachSuccess.value = data.message
    toast.success(data.message)
    resetCoachForm()
    await loadCoaches()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Coach update queued ΓÇö will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      coachError.value = fetchErr.data?.statusMessage ?? 'Failed to update coach.'
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to update coach.')
    }
  } finally {
    coachLoading.value = false
  }
}

const coachConfirmDelete = ref('')

async function deleteCoach(id: string, name: string) {
  if (coachConfirmDelete.value !== id) {
    coachConfirmDelete.value = id
    setTimeout(() => { coachConfirmDelete.value = '' }, 5000)
    return
  }

  coachConfirmDelete.value = ''
  coachError.value = ''
  coachSuccess.value = ''

  try {
    await cachedPost('/api/coaches/delete', { id }, {
      label: `Delete coach ${name}`,
      cacheInvalidates: ['coaches'],
    })
    toast.success(`${name} removed from coaches.`)
    await loadCoaches()
  } catch (err: unknown) {
    if (String(err).includes('Queued')) {
      toast.warning('Coach deletion queued ΓÇö will sync when back online.')
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      toast.error(fetchErr.data?.statusMessage ?? 'Failed to remove coach.')
    }
  }
}

function statusLabel(status: string) {
  if (status === 'registered') return 'Registered'
  if (status === 'checked_in') return 'Checked out'
  return status
}

function statusClass(status: string) {
  if (status === 'registered') return 'text-gold'
  if (status === 'checked_in') return 'text-green-400'
  return 'text-mist'
}

function statusBadgeClass(status: string) {
  if (status === 'registered') return 'border-gold/40 text-gold bg-gold/5'
  if (status === 'checked_in') return 'border-green-400/40 text-green-400 bg-green-400/5'
  return 'border-iron text-mist bg-obsidian/40'
}

function timeLabel(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  })
}

function amountLabel(amount: number | null): string {
  return amount ? `₱${amount.toLocaleString('en-PH')}` : '—'
}

function revenueShare(part: number, total: number): number {
  if (!total) return 0
  return Math.min(100, Math.round((part / total) * 100))
}

function openExportModal() {
  if (!reportData.value) return
  exportError.value = ''
  const summary = reportData.value.summary
  const today = manilaToday()
  exportFrom.value = summary.dateFrom || today
  exportTo.value = summary.dateTo || today
  showExportModal.value = true
}

function formatPdfMoney(amount: number): string {
  return `PHP ${Math.round(amount).toLocaleString('en-PH')}`
}

function formatPdfDate(value: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
}

function formatPdfDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

async function downloadReportPdf(data: { visits: ReportVisit[]; summary: ReportSummary }) {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentWidth = pageWidth - margin * 2

  const gold: [number, number, number] = [186, 150, 78]
  const ink: [number, number, number] = [28, 32, 38]
  const muted: [number, number, number] = [108, 114, 122]
  const line: [number, number, number] = [222, 225, 230]
  const light: [number, number, number] = [247, 248, 250]
  const highlight: [number, number, number] = [250, 246, 236]
  const green: [number, number, number] = [32, 132, 82]
  const blue: [number, number, number] = [40, 98, 170]
  const white: [number, number, number] = [255, 255, 255]

  doc.setFillColor(...gold)
  doc.rect(0, 0, pageWidth, 3.5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...ink)
  doc.text('OASIS', margin, 18.5)
  doc.setTextColor(...gold)
  doc.text('FIT', margin + doc.getTextWidth('OASIS'), 18.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...muted)
  doc.text('FITNESS GYM', margin, 23.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...ink)
  doc.text('BUSINESS REPORT', pageWidth - margin, 16.5, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...muted)
  doc.text(`Generated ${formatPdfDateTime(new Date().toISOString())}`, pageWidth - margin, 21, { align: 'right' })

  doc.setDrawColor(...line)
  doc.setLineWidth(0.3)
  doc.line(margin, 27, pageWidth - margin, 27)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...ink)
  doc.text('Report Summary', margin, 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...muted)
  const rangeText = data.summary.dateFrom === data.summary.dateTo
    ? formatPdfDate(data.summary.dateFrom)
    : `${formatPdfDate(data.summary.dateFrom)} — ${formatPdfDate(data.summary.dateTo)}`
  doc.text(rangeText, pageWidth - margin, 36, { align: 'right' })

  const cardY = 42
  const cardGap = 4
  const cardWidth = (contentWidth - cardGap * 3) / 4
  const cardHeight = 23
  const kpis: { label: string; value: string; accent: [number, number, number] }[] = [
    { label: 'TOTAL VISITS', value: String(data.summary.totalVisits), accent: gold },
    { label: 'CHECKED OUT', value: String(data.summary.checkedOut), accent: green },
    { label: 'TOTAL REVENUE', value: formatPdfMoney(data.summary.totalRevenue), accent: gold },
    { label: 'UNIQUE MEMBERS', value: String(data.summary.uniqueMembers), accent: blue },
  ]

  kpis.forEach((kpi, index) => {
    const x = margin + index * (cardWidth + cardGap)
    doc.setFillColor(...light)
    doc.setDrawColor(...line)
    doc.setLineWidth(0.25)
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 1.5, 1.5, 'FD')
    doc.setFillColor(...kpi.accent)
    doc.rect(x, cardY, 1.5, cardHeight, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.2)
    doc.setTextColor(...muted)
    doc.text(kpi.label, x + 4.5, cardY + 6.5)
    doc.setFontSize(kpi.label === 'TOTAL REVENUE' ? 10.5 : 15)
    doc.setTextColor(...ink)
    doc.text(kpi.value, x + 4.5, cardY + 15.5)
  })

  const revenueTitleY = cardY + cardHeight + 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...ink)
  doc.text('Revenue Breakdown', margin, revenueTitleY)
  doc.setDrawColor(...line)
  doc.line(margin, revenueTitleY + 2, pageWidth - margin, revenueTitleY + 2)

  const revenueBody = [
    ['Walk-in Revenue', formatPdfMoney(data.summary.walkinRevenue)],
    ['Membership Revenue', formatPdfMoney(data.summary.membershipRevenue)],
    ['Total Revenue', formatPdfMoney(data.summary.totalRevenue)],
  ]

  autoTable(doc, {
    startY: revenueTitleY + 5,
    head: [['Source', 'Amount']],
    body: revenueBody,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.4,
      textColor: ink,
      lineColor: line,
      lineWidth: 0.2,
    },
    headStyles: { fillColor: gold, textColor: white, fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.72 },
      1: { halign: 'right', cellWidth: contentWidth * 0.28 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.row.index === revenueBody.length - 1) {
        hookData.cell.styles.fontStyle = 'bold'
        hookData.cell.styles.fillColor = highlight
      }
    },
  })

  const sorted = [...data.visits].sort((a, b) => {
    const aTime = a.checkedInAt || a.createdAt
    const bTime = b.checkedInAt || b.createdAt
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })

  const revenueEndY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? revenueTitleY + 20
  const logTitleY = revenueEndY + 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...ink)
  doc.text(`Visit Log (${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'})`, margin, logTitleY)
  doc.setDrawColor(...line)
  doc.line(margin, logTitleY + 2, pageWidth - margin, logTitleY + 2)

  const visitBody = sorted.map((v) => {
    const status = v.status === 'checked_in' ? 'Checked Out' : v.status === 'registered' ? 'Registered' : 'Expired'
    const amount = v.paymentAmount ? formatPdfMoney(v.paymentAmount) : '—'
    const time = v.checkedInAt
      ? new Date(v.checkedInAt).toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Manila',
      })
      : '—'
    return [v.visitDate, time, v.fullName, v.passCode, amount, status]
  })

  autoTable(doc, {
    startY: logTitleY + 5,
    head: [['Date', 'Time', 'Name', 'Pass Code', 'Amount', 'Status']],
    body: visitBody.length > 0 ? visitBody : [['—', '—', 'No visits recorded for this period.', '—', '—', '—']],
    margin: { left: margin, right: margin, top: 16, bottom: 18 },
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      textColor: ink,
      lineColor: line,
      lineWidth: 0.15,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: { fillColor: gold, textColor: white, fontStyle: 'bold', fontSize: 7 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      2: { cellWidth: 55 },
      3: { cellWidth: 28 },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 29 },
    },
  })

  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page)
    doc.setDrawColor(...line)
    doc.setLineWidth(0.2)
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(...muted)
    doc.text('Oasis Fitness Gym · Confidential business report', margin, pageHeight - 7)
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' })
  }

  const fileLabel = data.summary.dateFrom === data.summary.dateTo
    ? data.summary.dateFrom
    : `${data.summary.dateFrom}-to-${data.summary.dateTo}`
  doc.save(`oasis-report-${fileLabel}.pdf`)
}

async function exportRange() {
  exportError.value = ''
  if (!exportFrom.value || !exportTo.value) {
    exportError.value = 'Select both a from and to date.'
    return
  }
  if (exportFrom.value > exportTo.value) {
    exportError.value = 'The from date must be before the to date.'
    return
  }

  exportLoading.value = true
  try {
    const data = await cachedGet<{ visits: ReportVisit[]; summary: ReportSummary; chartData: ChartPoint[]; availableDates: string[] }>('/api/staff/reports', {
      params: { from: exportFrom.value, to: exportTo.value },
      cache: { store: 'reports', label: 'Export report' },
    })
    await downloadReportPdf(data)
    showExportModal.value = false
  } catch {
    if (isOnline.value) toast.error('Failed to export report.')
  } finally {
    exportLoading.value = false
  }
}

onMounted(async () => {
  await checkSession()
  if (authenticated.value) {
    loadReports()
  }
})

</script>

<template>
  <div class="min-h-screen bg-onyx text-cream font-body">
    <header class="border-b border-iron bg-obsidian/80 backdrop-blur-md sticky top-0 z-10">
      <div class="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
        <div>
          <p class="font-display text-xl sm:text-2xl text-gold tracking-widest">OASIS<span class="text-cream">FIT</span></p>
          <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider">Staff Dashboard</p>
        </div>
        <button
          v-if="authenticated"
          type="button"
          class="text-xs sm:text-sm text-mist hover:text-gold transition-colors"
          @click="logout"
        >
          Log out
        </button>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
      <div v-if="checkingSession" class="text-center text-mist py-20">Loading…</div>

      <!-- Login -->
      <div v-else-if="!authenticated" class="card p-5 sm:p-8 max-w-md mx-auto">
        <h1 class="font-display text-2xl sm:text-3xl text-cream tracking-wide mb-1 sm:mb-2">Staff Login</h1>
        <p class="text-mist text-xs sm:text-sm mb-4 sm:mb-6">Enter the staff password to access the dashboard.</p>
        <form class="space-y-3 sm:space-y-4" @submit.prevent="login">
          <div>
            <label for="staff-password" class="block text-xs sm:text-sm text-mist mb-1">Password</label>
            <input
              id="staff-password"
              v-model="loginPassword"
              type="password"
              class="input-field"
              autocomplete="current-password"
            />
          </div>
          <p v-if="loginError" class="text-red-400 text-xs sm:text-sm">{{ loginError }}</p>
          <button type="submit" class="btn-primary w-full" :disabled="loginSubmitting">
            {{ loginSubmitting ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>
        <p class="text-center mt-4 sm:mt-6">
          <NuxtLink to="/" class="text-mist text-xs sm:text-sm hover:text-cream transition-colors">&larr; Go back to website</NuxtLink>
        </p>
      </div>

      <!-- Dashboard -->
      <div v-else class="space-y-6 sm:space-y-8">
        <!-- Tab Navigation -->
        <div class="flex gap-1.5 sm:gap-2 border-b border-iron overflow-x-auto">
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'reports' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'reports'"
          >
            Reports
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'checkout' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'checkout'"
          >
            Check-out
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'walkin' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'walkin'"
          >
            Register
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'payment' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'payment'"
          >
            Payment
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'coaches' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'coaches'"
          >
            Coaches
          </button>
        </div>

        <!-- REPORTS TAB -->
        <template v-if="activeTab === 'reports'">
          <!-- Renewal Reminders -->
          <section class="card p-4 sm:p-6 mb-4 sm:mb-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide">Membership Renewals</h2>
                <p class="text-mist text-[10px] sm:text-xs mt-0.5">Send renewal reminders to members expiring within 3 days.</p>
              </div>
              <button
                type="button"
                class="btn-primary text-[10px] sm:text-xs px-3 sm:px-4 py-1.5 sm:py-2 shrink-0"
                :disabled="reminderLoading"
                @click="sendReminders()"
              >
                {{ reminderLoading ? 'Sending…' : 'Send Reminders' }}
              </button>
            </div>
          </section>

          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Reports & Analytics</h2>

            <div class="flex gap-1.5 sm:gap-2 mb-4 sm:mb-6 flex-wrap">
              <button
                type="button"
                class="px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                :class="reportPeriod === 'day' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:border-gold/50'"
                @click="setReportPeriod('day')"
              >
                Today
              </button>
              <button
                type="button"
                class="px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                :class="reportPeriod === 'week' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:border-gold/50'"
                @click="setReportPeriod('week')"
              >
                This Week
              </button>
              <button
                type="button"
                class="px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                :class="reportPeriod === 'month' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:border-gold/50'"
                @click="setReportPeriod('month')"
              >
                This Month
              </button>
              <button
                type="button"
                class="px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                :class="reportPeriod === 'year' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:border-gold/50'"
                @click="setReportPeriod('year')"
              >
                This Year
              </button>
              <button v-if="reportData" type="button" class="btn-outline px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs ml-auto" @click="openExportModal">
                Export PDF
              </button>
            </div>

            <Teleport to="body">
              <div
                v-if="showExportModal"
                class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-onyx/90 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-label="Export report"
                @click.self="showExportModal = false"
              >
                <div class="bg-graphite border border-iron rounded-sm max-w-sm w-full p-5 sm:p-6">
                  <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-1">Export PDF Report</h2>
                  <p class="text-mist text-[10px] sm:text-xs mb-4">Select the date range to include in the printable report.</p>

                  <div class="space-y-3">
                    <div>
                      <label for="export-from" class="block text-[11px] sm:text-sm text-mist mb-1">From *</label>
                      <input
                        id="export-from"
                        v-model="exportFrom"
                        type="date"
                        class="input-field"
                      />
                    </div>
                    <div>
                      <label for="export-to" class="block text-[11px] sm:text-sm text-mist mb-1">To *</label>
                      <input
                        id="export-to"
                        v-model="exportTo"
                        type="date"
                        class="input-field"
                      />
                    </div>
                  </div>

                  <p v-if="exportError" class="text-red-400 text-xs sm:text-sm mt-3">{{ exportError }}</p>

                  <div class="flex gap-2 mt-4">
                    <button type="button" class="btn-outline flex-1 text-[10px] sm:text-xs" @click="showExportModal = false">
                      Cancel
                    </button>
                    <button type="button" class="btn-primary flex-1 text-[10px] sm:text-xs" :disabled="exportLoading" @click="exportRange">
                      {{ exportLoading ? 'Generating…' : 'Export PDF' }}
                    </button>
                  </div>
                </div>
              </div>
            </Teleport>

            <div v-if="reportLoading" class="text-center py-10">
              <p class="text-mist text-xs sm:text-sm">Loading report…</p>
            </div>

            <template v-else-if="reportData">
              <div class="border border-iron bg-obsidian/40 mb-4 sm:mb-6">
                <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-2 px-4 sm:px-5 py-4 border-b border-iron">
                  <div>
                    <p class="text-gold text-[9px] sm:text-[10px] uppercase tracking-[0.2em] mb-1">Oasis Fitness Gym</p>
                    <h3 class="font-display text-lg sm:text-2xl text-cream tracking-wide">Business Report</h3>
                    <p class="text-mist text-[10px] sm:text-xs mt-1">
                      {{ reportPeriodLabel }} · <span class="text-cream/80">{{ reportData.summary.dateFrom }}</span> — <span class="text-cream/80">{{ reportData.summary.dateTo }}</span>
                    </p>
                  </div>
                  <div class="sm:text-right">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">Generated</p>
                    <p class="text-cream text-[10px] sm:text-xs">{{ reportGeneratedAtLabel }}</p>
                  </div>
                </div>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-iron">
                  <div class="bg-onyx px-4 py-3 sm:py-4">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">Total Visits</p>
                    <p class="font-display text-2xl sm:text-3xl text-cream tabular-nums">{{ reportData.summary.totalVisits }}</p>
                    <p class="text-mist text-[9px] sm:text-[10px] mt-0.5">Recorded check-ins</p>
                  </div>
                  <div class="bg-onyx px-4 py-3 sm:py-4">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">Checked Out</p>
                    <p class="font-display text-2xl sm:text-3xl text-green-400 tabular-nums">{{ reportData.summary.checkedOut }}</p>
                    <p class="text-mist text-[9px] sm:text-[10px] mt-0.5">Completed sessions</p>
                  </div>
                  <div class="bg-onyx px-4 py-3 sm:py-4">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">Total Revenue</p>
                    <p class="font-display text-2xl sm:text-3xl text-gold tabular-nums">₱{{ reportData.summary.totalRevenue.toLocaleString() }}</p>
                    <p class="text-mist text-[9px] sm:text-[10px] mt-0.5">Walk-in + membership</p>
                  </div>
                  <div class="bg-onyx px-4 py-3 sm:py-4">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">Unique Members</p>
                    <p class="font-display text-2xl sm:text-3xl text-blue-400 tabular-nums">{{ reportData.summary.uniqueMembers }}</p>
                    <p class="text-mist text-[9px] sm:text-[10px] mt-0.5">Distinct clients</p>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div class="border border-iron bg-graphite/40 p-4">
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">Walk-in Revenue</p>
                    <span class="text-gold text-[10px] sm:text-xs font-semibold tabular-nums">{{ revenueShare(reportData.summary.walkinRevenue, reportData.summary.totalRevenue) }}%</span>
                  </div>
                  <p class="font-display text-xl sm:text-2xl text-gold tabular-nums mt-1">₱{{ reportData.summary.walkinRevenue.toLocaleString() }}</p>
                  <div class="h-1.5 bg-iron/60 mt-3 overflow-hidden">
                    <div class="h-full bg-gold" :style="{ width: `${revenueShare(reportData.summary.walkinRevenue, reportData.summary.totalRevenue)}%` }" />
                  </div>
                </div>
                <div class="border border-iron bg-graphite/40 p-4">
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">Membership Revenue</p>
                    <span class="text-blue-400 text-[10px] sm:text-xs font-semibold tabular-nums">{{ revenueShare(reportData.summary.membershipRevenue, reportData.summary.totalRevenue) }}%</span>
                  </div>
                  <p class="font-display text-xl sm:text-2xl text-blue-400 tabular-nums mt-1">₱{{ reportData.summary.membershipRevenue.toLocaleString() }}</p>
                  <div class="h-1.5 bg-iron/60 mt-3 overflow-hidden">
                    <div class="h-full bg-blue-400" :style="{ width: `${revenueShare(reportData.summary.membershipRevenue, reportData.summary.totalRevenue)}%` }" />
                  </div>
                </div>
                <div class="border border-iron bg-graphite/40 p-4">
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">Combined Revenue</p>
                    <span class="text-cream text-[10px] sm:text-xs font-semibold tabular-nums">100%</span>
                  </div>
                  <p class="font-display text-xl sm:text-2xl text-cream tabular-nums mt-1">₱{{ reportData.summary.totalRevenue.toLocaleString() }}</p>
                  <div class="h-1.5 bg-iron/60 mt-3 flex overflow-hidden">
                    <div class="h-full bg-gold" :style="{ width: `${revenueShare(reportData.summary.walkinRevenue, reportData.summary.totalRevenue)}%` }" />
                    <div class="h-full bg-blue-400" :style="{ width: `${revenueShare(reportData.summary.membershipRevenue, reportData.summary.totalRevenue)}%` }" />
                  </div>
                </div>
              </div>

              <div v-if="reportData?.chartData?.length > 0 && reportData.chartData.some(p => p.revenue > 0)" class="border border-iron bg-graphite/30 mb-4 sm:mb-6">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-iron">
                  <div>
                    <h3 class="font-display text-base sm:text-lg text-cream tracking-wide">Revenue Trend</h3>
                    <p class="text-mist text-[9px] sm:text-[10px] mt-0.5">{{ reportPeriodLabel }} · walk-in vs membership</p>
                  </div>
                  <div class="flex items-center gap-4">
                    <div class="flex items-center gap-1.5">
                      <div class="w-2.5 h-2.5 bg-gold rounded-sm" />
                      <span class="text-[9px] sm:text-[10px] text-mist uppercase tracking-wider">Walk-in</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <div class="w-2.5 h-2.5 bg-blue-400 rounded-sm" />
                      <span class="text-[9px] sm:text-[10px] text-mist uppercase tracking-wider">Membership</span>
                    </div>
                  </div>
                </div>
                <div class="overflow-x-auto p-4">
                  <div class="flex items-end gap-1 sm:gap-1.5 min-h-[160px] sm:min-h-[200px] px-2 pb-8 border-b border-iron/60">
                    <div
                      v-for="point in reportData.chartData"
                      :key="point.date"
                      class="flex-1 flex flex-col items-center gap-1 min-w-[28px] sm:min-w-[36px]"
                    >
                      <span v-if="point.revenue > 0" class="text-[8px] sm:text-[10px] text-gold font-semibold tabular-nums">₱{{ point.revenue.toLocaleString() }}</span>
                      <div class="w-full flex flex-col" :style="{ height: point.revenue > 0 ? `${Math.max((point.revenue / maxRevenue) * 100, 12)}%` : '4px' }">
                        <div
                          v-if="point.membershipRevenue > 0"
                          class="w-full bg-blue-400 transition-all"
                          :style="{ height: point.revenue > 0 ? `${(point.membershipRevenue / point.revenue) * 100}%` : '0' }"
                        />
                        <div
                          class="w-full transition-all rounded-t"
                          :class="point.walkinRevenue > 0 ? 'bg-gold' : point.membershipRevenue > 0 ? '' : 'bg-iron/30'"
                          :style="{ height: point.revenue > 0 ? `${(point.walkinRevenue / point.revenue) * 100}%` : '4px' }"
                        />
                      </div>
                      <span class="text-[8px] sm:text-[10px] text-mist font-medium">{{ point.label }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="border border-iron bg-graphite/30">
                <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-iron">
                  <div>
                    <h3 class="font-display text-base sm:text-lg text-cream tracking-wide">Visit Log</h3>
                    <p class="text-mist text-[9px] sm:text-[10px] mt-0.5">{{ sortedVisits.length }} total entries</p>
                  </div>
                  <span class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">{{ reportPeriodLabel }}</span>
                </div>
                <div v-if="sortedVisits.length > 0" class="overflow-x-auto">
                  <table class="w-full text-[10px] sm:text-xs min-w-[560px]">
                    <thead>
                      <tr class="bg-obsidian/60 border-b border-iron">
                        <th class="text-left p-2.5 sm:p-3 text-gold font-display tracking-wide text-[9px] sm:text-[10px] uppercase">Date</th>
                        <th class="text-left p-2.5 sm:p-3 text-gold font-display tracking-wide text-[9px] sm:text-[10px] uppercase">Name</th>
                        <th class="text-left p-2.5 sm:p-3 text-gold font-display tracking-wide text-[9px] sm:text-[10px] uppercase">Pass Code</th>
                        <th class="text-right p-2.5 sm:p-3 text-gold font-display tracking-wide text-[9px] sm:text-[10px] uppercase">Amount</th>
                        <th class="text-right p-2.5 sm:p-3 text-gold font-display tracking-wide text-[9px] sm:text-[10px] uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="v in sortedVisits.slice(0, visitLogLimit)" :key="v.id" class="border-b border-iron/40 last:border-0 hover:bg-obsidian/30 transition-colors">
                        <td class="p-2.5 sm:p-3 whitespace-nowrap">
                          <span class="text-cream">{{ v.visitDate }}</span>
                          <span class="text-mist text-[9px] sm:text-[10px] ml-1.5">{{ timeLabel(v.checkedInAt || v.createdAt) }}</span>
                        </td>
                        <td class="p-2.5 sm:p-3 text-cream">{{ v.fullName }}</td>
                        <td class="p-2.5 sm:p-3 text-gold font-display tracking-wider">{{ v.passCode }}</td>
                        <td class="p-2.5 sm:p-3 text-cream text-right tabular-nums">{{ amountLabel(v.paymentAmount) }}</td>
                        <td class="p-2.5 sm:p-3 text-right">
                          <span class="inline-flex items-center px-2 py-0.5 text-[9px] sm:text-[10px] uppercase tracking-wider border" :class="statusBadgeClass(v.status)">
                            {{ statusLabel(v.status) }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-else class="text-center py-10">
                  <p class="text-mist text-xs sm:text-sm">No visits found for this period.</p>
                </div>
                <div v-if="sortedVisits.length > 0" class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-t border-iron">
                  <p class="text-mist text-[9px] sm:text-[10px]">
                    Showing {{ Math.min(visitLogLimit, sortedVisits.length) }} of {{ sortedVisits.length }} entries
                  </p>
                  <div class="flex gap-3">
                    <button v-if="visitLogLimit > 5 && sortedVisits.length > 5" type="button" class="text-mist text-[10px] sm:text-[11px] uppercase tracking-wider hover:text-cream" @click="visitLogLimit = 5">
                      Show Less
                    </button>
                    <button v-if="sortedVisits.length > visitLogLimit" type="button" class="text-gold text-[10px] sm:text-xs uppercase tracking-wider hover:underline" @click="visitLogLimit += 5">
                      Show More ({{ sortedVisits.length - visitLogLimit }})
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <div v-else class="text-center py-10">
              <p class="text-mist text-xs sm:text-sm">Select a period above to view the report.</p>
            </div>

            <!-- Overview Section -->
            <div class="mt-6 sm:mt-8 border-t border-iron pt-6 sm:pt-8">
              <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-4 sm:mb-6">Overview</h2>

              <!-- Coaches -->
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-display text-sm sm:text-base text-gold tracking-wide">Coaches</h3>
                  <span v-if="coachesList.length > 0" class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">{{ coachesList.length }} active</span>
                </div>
                <div v-if="coachesList.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div v-for="coach in coachesList.slice(0, showAllCoaches ? coachesList.length : 4)" :key="coach.id" class="bg-graphite border border-iron p-2.5 sm:p-3 flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full overflow-hidden bg-graphite border border-iron flex items-center justify-center shrink-0">
                      <img v-if="coach.photoUrl" :src="coach.photoUrl" class="w-full h-full object-cover" loading="lazy" decoding="async" width="32" height="32" />
                      <span v-else class="text-gold text-xs font-display">{{ coach.fullName.charAt(0) }}</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-cream text-[10px] sm:text-xs truncate">{{ coach.fullName }}</p>
                      <p v-if="coach.specialty" class="text-mist text-[8px] sm:text-[9px] truncate">{{ coach.specialty }}</p>
                    </div>
                  </div>
                </div>
                <button v-if="coachesList.length > 4" type="button" class="text-gold text-[9px] sm:text-[10px] uppercase tracking-wider hover:underline mt-2" @click="showAllCoaches = !showAllCoaches">
                  {{ showAllCoaches ? 'Show Less' : `Show All (${coachesList.length})` }}
                </button>
                <p v-if="coachesList.length === 0" class="text-mist text-[10px] sm:text-xs">No coaches added yet.</p>
              </div>

              <!-- Membership Summary -->
              <div v-if="paymentsSummary" class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-display text-sm sm:text-base text-gold tracking-wide">Payment</h3>
                  <span class="text-mist text-[9px] sm:text-[10px] uppercase tracking-wider">{{ paymentsSummary.total }} total</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                  <div class="bg-graphite border border-iron p-2.5 sm:p-3 text-center">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase">Pending</p>
                    <p class="font-display text-lg sm:text-xl text-yellow-400">{{ paymentsSummary.pending }}</p>
                  </div>
                  <div class="bg-graphite border border-iron p-2.5 sm:p-3 text-center">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase">Partial</p>
                    <p class="font-display text-lg sm:text-xl text-orange-400">{{ paymentsSummary.partial }}</p>
                  </div>
                  <div class="bg-graphite border border-iron p-2.5 sm:p-3 text-center">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase">Approved</p>
                    <p class="font-display text-lg sm:text-xl text-green-400">{{ paymentsSummary.approved }}</p>
                  </div>
                  <div class="bg-graphite border border-iron p-2.5 sm:p-3 text-center">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase">History</p>
                    <p class="font-display text-lg sm:text-xl text-purple-400">{{ paymentsSummary.history }}</p>
                  </div>
                  <div class="bg-graphite border border-iron p-2.5 sm:p-3 text-center">
                    <p class="text-mist text-[9px] sm:text-[10px] uppercase">Revenue</p>
                    <p class="font-display text-lg sm:text-xl text-gold">₱{{ paymentsSummary.totalRevenue.toLocaleString() }}</p>
                  </div>
                </div>
              </div>

            </div>
          </section>
        </template>

        <!-- CHECK-OUT TAB -->
        <template v-if="activeTab === 'checkout'">

          <!-- Registered Members -->
          <section class="card p-4 sm:p-6">
            <div class="flex items-center justify-between gap-3 mb-3 sm:mb-4">
              <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide">Registered Members</h2>
              <div class="flex gap-2 shrink-0">
                <button
                  type="button"
                  class="btn-outline text-[10px] sm:text-xs px-3 py-1.5"
                  :disabled="membersLoading"
                  @click="membersSortAsc = !membersSortAsc"
                >
                  {{ membersSortAsc ? 'A → Z' : 'Z → A' }}
                </button>
                <button
                  type="button"
                  class="btn-outline text-[10px] sm:text-xs px-3 py-1.5"
                  :disabled="membersLoading"
                  @click="loadMembers()"
                >
                  {{ membersLoading ? 'Loading…' : 'Refresh' }}
                </button>
              </div>
            </div>

            <input
              v-model="membersFilter"
              type="search"
              class="input-field"
              placeholder="Filter by name or phone…"
            />

            <div class="flex flex-wrap gap-1.5 sm:gap-2 mt-2 sm:mt-3">
              <button
                type="button"
                class="text-[10px] sm:text-xs uppercase tracking-wider px-2.5 py-1 border transition-colors"
                :class="membersStatusFilter === 'all' ? 'border-gold text-gold' : 'border-iron text-mist hover:text-cream'"
                @click="membersStatusFilter = 'all'"
              >
                All ({{ memberStatusCounts.all }})
              </button>
              <button
                v-for="option in memberStatusOptions"
                :key="option.id"
                type="button"
                class="text-[10px] sm:text-xs uppercase tracking-wider px-2.5 py-1 border transition-colors"
                :class="membersStatusFilter === option.id ? 'border-gold text-gold' : 'border-iron text-mist hover:text-cream'"
                @click="membersStatusFilter = option.id"
              >
                {{ option.short }} ({{ memberStatusCounts[option.id] }})
              </button>
            </div>

            <p v-if="membersError" class="text-red-400 text-xs sm:text-sm mt-2 sm:mt-3">{{ membersError }}</p>

            <div v-if="membersLoading && !membersList.length" class="text-mist text-xs sm:text-sm text-center py-4">
              Loading members…
            </div>
            <p v-else-if="!filteredMembers.length" class="text-mist text-xs sm:text-sm text-center py-4">
              {{ membersFilter || membersStatusFilter !== 'all' ? 'No members match your filter.' : 'No registered members yet.' }}
            </p>
            <template v-else>
              <ul class="mt-3 sm:mt-4 space-y-1.5 sm:space-y-2 max-h-80 sm:max-h-96 overflow-y-auto">
                <li
                  v-for="member in filteredMembers.slice(0, membersLimit)"
                  :key="member.id"
                  class="border border-iron p-3 sm:p-4 cursor-pointer hover:border-gold/50 transition-colors"
                  :class="selectedPass?.id === member.id ? 'border-gold' : ''"
                  @click="selectPass(member)"
                >
                  <div class="flex items-center justify-between gap-3 sm:gap-4">
                    <div class="min-w-0">
                      <p class="text-cream font-medium text-sm sm:text-base truncate">{{ member.fullName }}</p>
                      <p class="text-mist text-xs sm:text-sm truncate">{{ member.phone }}</p>
                      <p class="text-[10px] sm:text-xs uppercase tracking-wider mt-0.5" :class="clientTypeClass(member)">
                        {{ clientTypeLabelFor(member) }}
                      </p>
                      <p class="text-mist text-[10px] sm:text-xs mt-0.5">
                        Default: ₱{{ clientDefaultRateFor(member).toLocaleString() }}
                      </p>
                      <label class="inline-flex items-center gap-1.5 mt-1 text-[10px] sm:text-xs text-mist cursor-pointer" @click.stop>
                        <input
                          type="checkbox"
                          class="accent-gold"
                          :checked="member.customerType === 'member'"
                          :disabled="memberStatusUpdating === member.id"
                          @change="onMemberToggle(member, $event)"
                        />
                        Member
                      </label>
                    </div>
                    <div class="shrink-0 text-right">
                      <span class="block text-[10px] sm:text-xs uppercase tracking-wider" :class="statusClass(member.status)">
                        {{ statusLabel(member.status) }}
                      </span>
                      <button
                        type="button"
                        class="mt-1 text-[10px] sm:text-[11px] uppercase tracking-wider transition-colors"
                        :class="memberConfirmRemove === member.id ? 'text-red-400' : 'text-mist hover:text-red-400'"
                        :disabled="memberRemoving === member.id"
                        @click.stop="removeMember(member)"
                      >
                        {{ memberRemoving === member.id ? 'Removing…' : memberConfirmRemove === member.id ? 'Confirm?' : 'Remove' }}
                      </button>
                    </div>
                  </div>
                </li>
              </ul>
              <div v-if="filteredMembers.length > membersLimit" class="text-center mt-3">
                <button
                  type="button"
                  class="text-gold text-[11px] sm:text-xs uppercase tracking-wider hover:underline"
                  @click="membersLimit += 5"
                >
                  Show More ({{ filteredMembers.length - membersLimit }} remaining)
                </button>
              </div>
              <div v-if="membersLimit > 5 && filteredMembers.length > 5" class="text-center mt-2">
                <button
                  type="button"
                  class="text-mist text-[10px] sm:text-[11px] uppercase tracking-wider hover:text-cream"
                  @click="membersLimit = 5"
                >
                  Show Less
                </button>
              </div>
            </template>
          </section>

          <!-- Pass Details Modal -->
          <Teleport to="body">
            <div
              v-if="selectedPass"
              class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-onyx/90 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label="Pass details"
              @click.self="selectedPass = null"
            >
              <div class="bg-graphite border border-iron rounded-sm max-w-sm w-full p-5 sm:p-6 max-h-[85vh] overflow-y-auto">
                <div class="flex items-center justify-between gap-3 mb-3 sm:mb-4">
                  <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide">Pass Details</h2>
                  <button
                    type="button"
                    class="text-mist hover:text-cream text-xl leading-none shrink-0"
                    aria-label="Close"
                    @click="selectedPass = null"
                  >
                    &times;
                  </button>
                </div>

                <dl class="space-y-2 text-xs sm:text-sm mb-4 sm:mb-6">
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Name</dt>
                    <dd class="text-cream text-right break-all">{{ selectedPass.fullName }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Pass code</dt>
                    <dd class="text-gold font-display text-base sm:text-lg tracking-wider">{{ selectedPass.passCode }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Phone</dt>
                    <dd class="text-cream text-right">{{ selectedPass.phone }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Email</dt>
                    <dd class="text-cream text-right break-all">{{ selectedPass.email || '—' }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Emergency</dt>
                    <dd class="text-cream text-right break-all">{{ selectedPass.emergencyContact || '—' }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Visit date</dt>
                    <dd class="text-cream text-right">{{ selectedPass.visitDate }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Status</dt>
                    <dd :class="statusClass(selectedPass.status)">{{ statusLabel(selectedPass.status) }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Membership</dt>
                    <dd :class="memberStatusClass(selectedPass.memberStatus)">{{ memberStatusLabel(selectedPass.memberStatus) }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Client Type</dt>
                    <dd class="text-right" :class="clientTypeClass(selectedPass)">{{ clientTypeLabelFor(selectedPass) }}</dd>
                  </div>
                  <div class="flex justify-between gap-3 sm:gap-4">
                    <dt class="text-mist shrink-0">Default Rate</dt>
                    <dd class="text-cream text-right">₱{{ clientDefaultRateFor(selectedPass).toLocaleString() }}</dd>
                  </div>
                </dl>

                <div class="mb-4 sm:mb-6">
                  <p class="block text-[11px] sm:text-sm text-mist mb-1 sm:mb-2">Change Membership Status</p>
                  <div class="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <button
                      v-for="option in memberStatusOptions"
                      :key="option.id"
                      type="button"
                      class="border px-2 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider transition-colors"
                      :class="(selectedPass.memberStatus ?? 'walkin') === option.id ? 'border-gold text-gold' : 'border-iron text-mist hover:text-cream'"
                      :disabled="memberStatusUpdating === selectedPass.id"
                      @click="updateMemberStatus(selectedPass, option.id)"
                    >
                      {{ option.short }}
                    </button>
                  </div>
                </div>

                <div class="mb-4 sm:mb-6">
                  <p class="block text-[11px] sm:text-sm text-mist mb-1 sm:mb-2">Change Customer Type</p>
                  <div class="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      class="border px-2 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider transition-colors"
                      :class="selectedPass.customerType === 'member' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:text-cream'"
                      :disabled="memberStatusUpdating === selectedPass.id"
                      @click="updateCustomerType(selectedPass, 'member')"
                    >
                      Member
                    </button>
                    <button
                      type="button"
                      class="border px-2 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider transition-colors"
                      :class="selectedPass.customerType !== 'member' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:text-cream'"
                      :disabled="memberStatusUpdating === selectedPass.id"
                      @click="updateCustomerType(selectedPass, 'non_member')"
                    >
                      Non-member
                    </button>
                  </div>
                </div>

                <div v-if="selectedPass.status === 'registered'" class="mb-4 sm:mb-6">
                  <label for="co-pay-amount" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Payment Amount (₱)</label>
                  <input
                    id="co-pay-amount"
                    v-model.number="checkinPaymentAmount"
                    type="number"
                    min="0"
                    step="1"
                    class="input-field"
                    :placeholder="`Default: ₱${PLAN_RATES[checkinCustomerType].daily}`"
                  />
                  <p class="text-mist text-[10px] sm:text-xs mt-1">Plan members consume 1 session on check-in.</p>
                </div>

                <p v-if="checkinError" class="text-red-400 text-xs sm:text-sm text-center mb-3">{{ checkinError }}</p>
                <p v-if="checkinMessage && selectedPass.status === 'registered'" class="text-green-400 text-xs sm:text-sm text-center mb-3">
                  {{ checkinMessage }}
                </p>

                <button
                  v-if="selectedPass.status === 'registered'"
                  type="button"
                  class="btn-primary w-full"
                  :disabled="checkinLoading"
                  @click="checkIn(selectedPass.passCode)"
                >
                  {{ checkinLoading ? 'Checking out…' : 'Check Out Guest' }}
                </button>
                <p v-else class="text-green-400 text-xs sm:text-sm text-center">
                  Already checked out today. Come back tomorrow for another session.
                </p>

                <button
                  type="button"
                  class="btn-outline w-full mt-3"
                  :class="memberConfirmRemove === selectedPass.id ? 'border-red-400 text-red-400' : ''"
                  :disabled="memberRemoving === selectedPass.id"
                  @click="removeMember(selectedPass)"
                >
                  {{ memberRemoving === selectedPass.id ? 'Removing…' : memberConfirmRemove === selectedPass.id ? 'Tap again to confirm removal' : 'Remove Member' }}
                </button>
                <p class="text-mist text-[10px] sm:text-xs text-center mt-1.5">
                  Removal keeps their visit history but hides them from the member list.
                </p>
              </div>
            </div>
          </Teleport>
        </template>

        <!-- REGISTER TAB -->
        <template v-if="activeTab === 'walkin'">
          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Register Client</h2>
            <p class="text-mist text-[11px] sm:text-sm mb-3 sm:mb-6">
              Register a new client. They will receive a permanent pass code for future visits.
            </p>

            <template v-if="!walkinPassCode">
              <form class="space-y-3 sm:space-y-4" @submit.prevent="submitWalkin">
                <fieldset>
                  <legend class="block text-[11px] sm:text-sm text-mist mb-1 sm:mb-2">Customer Type *</legend>
                  <div class="grid grid-cols-2 gap-2">
                    <label
                      class="flex items-center gap-2 border px-3 py-2 cursor-pointer transition-colors text-xs sm:text-sm"
                      :class="walkinForm.customerType === 'member' ? 'border-gold text-gold' : 'border-iron text-mist hover:text-cream'"
                    >
                      <input
                        v-model="walkinForm.customerType"
                        type="radio"
                        name="customer-type"
                        value="member"
                        class="accent-gold"
                      />
                      Member
                    </label>
                    <label
                      class="flex items-center gap-2 border px-3 py-2 cursor-pointer transition-colors text-xs sm:text-sm"
                      :class="walkinForm.customerType === 'non_member' ? 'border-gold text-gold' : 'border-iron text-mist hover:text-cream'"
                    >
                      <input
                        v-model="walkinForm.customerType"
                        type="radio"
                        name="customer-type"
                        value="non_member"
                        class="accent-gold"
                      />
                      Non-member
                    </label>
                  </div>
                  <p class="text-mist text-[10px] sm:text-xs mt-1">
                    Default rate: ₱{{ walkinDefaultRate.toLocaleString() }}
                  </p>
                </fieldset>

                <fieldset>
                  <legend class="block text-[11px] sm:text-sm text-mist mb-1 sm:mb-2">Membership Status *</legend>
                  <div class="grid grid-cols-2 gap-2">
                    <label
                      v-for="option in memberStatusOptions"
                      :key="option.id"
                      class="flex items-center gap-2 border px-3 py-2 cursor-pointer transition-colors text-xs sm:text-sm"
                      :class="walkinForm.memberStatus === option.id ? 'border-gold text-gold' : 'border-iron text-mist hover:text-cream'"
                    >
                      <input
                        v-model="walkinForm.memberStatus"
                        type="radio"
                        name="member-status"
                        :value="option.id"
                        class="accent-gold"
                      />
                      {{ option.label }}
                    </label>
                  </div>
                </fieldset>

                <div>
                  <label for="wi-name" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Full Name *</label>
                  <input id="wi-name" v-model="walkinForm.fullName" type="text" class="input-field" maxlength="100" placeholder="Guest name" />
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label for="wi-email" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Email (optional)</label>
                    <input id="wi-email" v-model="walkinForm.email" type="email" class="input-field" placeholder="guest@email.com" />
                  </div>
                  <div>
                    <label for="wi-phone" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Phone *</label>
                    <div class="flex items-stretch w-full bg-graphite border border-iron rounded-sm focus-within:border-gold transition-colors">
                      <span class="flex items-center px-3 sm:px-4 text-sm sm:text-base text-mist border-r border-iron select-none" aria-hidden="true">+63</span>
                      <input
                        id="wi-phone"
                        :value="walkinPhoneLocal"
                        type="tel"
                        inputmode="numeric"
                        autocomplete="off"
                        maxlength="10"
                        class="flex-1 min-w-0 bg-transparent px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base text-cream placeholder:text-mist/60 focus:outline-none"
                        placeholder="9171234567"
                        aria-label="Philippine mobile number without the +63 prefix"
                        @input="onPhoneInput"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label for="wi-emergency" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Emergency Contact (optional)</label>
                  <input id="wi-emergency" v-model="walkinForm.emergencyContact" type="text" class="input-field" maxlength="100" placeholder="Name & phone number" />
                </div>

                <div class="absolute left-[-9999px]" aria-hidden="true">
                  <input v-model="walkinFormHoneypot" type="text" tabindex="-1" autocomplete="off" />
                </div>

                <button type="submit" class="btn-primary w-full" :disabled="walkinSubmitting">
                  {{ walkinSubmitting ? 'Registering…' : 'Register Client' }}
                </button>
              </form>
            </template>

            <!-- Success -->
            <template v-else>
              <div class="text-center space-y-3 sm:space-y-4">
                <div class="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 border border-green-400/30 rounded-full">
                  <span class="text-green-400 text-lg sm:text-2xl">✓</span>
                </div>
                <p class="text-green-400 text-xs sm:text-sm">{{ walkinMessage }}</p>

                <div>
                  <p class="text-mist text-[9px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Pass Code</p>
                  <p class="font-display text-xl sm:text-3xl text-gold tracking-widest">{{ walkinPassCode }}</p>
                </div>

                <p class="text-mist text-[9px] sm:text-xs">Give this pass code to the guest. It works for every future visit.</p>

                <button type="button" class="btn-outline w-full" @click="walkinPassCode = ''; walkinMessage = ''">
                  Register Another
                </button>
              </div>
            </template>
          </section>
        </template>

        <!-- PAYMENT TAB -->
        <template v-if="activeTab === 'payment'">
          <!-- New Membership Transaction -->
          <section class="card p-4 sm:p-6 mb-4 sm:mb-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-1">Record Membership Transaction</h2>
            <p class="text-mist text-[10px] sm:text-xs mb-4 sm:mb-5">
              Charge a member for the plan they availed. Enter the amount actually paid and the status is detected automatically (Full or Partial). Expiry is set from the plan.
            </p>

            <!-- Member picker -->
            <div class="mb-4">
              <label class="block text-[11px] sm:text-sm text-mist mb-1 sm:mb-2">Member *</label>
              <div v-if="txForm.memberName" class="flex items-center justify-between gap-3 border border-gold bg-gold/5 px-3 py-2.5">
                <div class="min-w-0">
                  <p class="text-cream text-xs sm:text-sm font-medium truncate">{{ txForm.memberName }}</p>
                  <p class="text-mist text-[10px] sm:text-xs">{{ txForm.memberPhone }}</p>
                </div>
                <button type="button" class="text-mist hover:text-red-400 text-[10px] sm:text-xs uppercase tracking-wider shrink-0" @click="clearTxMember">
                  Change
                </button>
              </div>
              <template v-else>
                <input
                  v-model="txMemberSearch"
                  type="search"
                  class="input-field"
                  placeholder="Search member by name or phone…"
                />
                <ul v-if="txMemberMatches.length" class="mt-1.5 border border-iron divide-y divide-iron max-h-56 overflow-y-auto">
                  <li v-for="member in txMemberMatches" :key="member.id">
                    <button
                      type="button"
                      class="w-full text-left px-3 py-2 hover:bg-graphite transition-colors"
                      @click="selectTxMember(member)"
                    >
                      <p class="text-cream text-xs sm:text-sm truncate">{{ member.fullName }}</p>
                      <p class="text-mist text-[10px] sm:text-xs">
                        {{ member.phone }} · <span :class="clientTypeClass(member)">{{ clientTypeLabelFor(member) }}</span> · ₱{{ clientDefaultRateFor(member).toLocaleString() }}
                      </p>
                    </button>
                  </li>
                </ul>
                <p v-else class="text-mist text-[10px] sm:text-xs mt-1.5">
                  {{ txMemberSearch ? 'No members match.' : 'Loading members…' }}
                </p>
              </template>
            </div>

            <!-- Plan -->
            <div class="mb-4">
              <label class="block text-[11px] sm:text-sm text-mist mb-1 sm:mb-2">Plan *</label>
              <div class="grid grid-cols-3 gap-1.5 sm:gap-2">
                <button
                  v-for="term in MEMBERSHIP_PLAN_TERMS"
                  :key="term.id"
                  type="button"
                  class="border px-2 py-2 text-[10px] sm:text-xs uppercase tracking-wider transition-colors"
                  :class="txForm.plan === term.id ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:text-cream'"
                  @click="setTxPlan(term.id)"
                >
                  {{ term.label }}
                  <span class="block text-[9px] normal-case tracking-normal text-mist">₱{{ PLAN_RATES[txForm.customerType][term.id] }}</span>
                </button>
              </div>
            </div>

            <!-- Customer type -->
            <div class="mb-4">
              <label class="block text-[11px] sm:text-sm text-mist mb-1 sm:mb-2">Customer Type *</label>
              <div class="grid grid-cols-2 gap-1.5 sm:gap-2">
                <button
                  type="button"
                  class="border px-2 py-2 text-[10px] sm:text-xs uppercase tracking-wider transition-colors"
                  :class="txForm.customerType === 'member' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:text-cream'"
                  @click="setTxCustomerType('member')"
                >
                  Member
                </button>
                <button
                  type="button"
                  class="border px-2 py-2 text-[10px] sm:text-xs uppercase tracking-wider transition-colors"
                  :class="txForm.customerType === 'non_member' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:text-cream'"
                  @click="setTxCustomerType('non_member')"
                >
                  Non-member
                </button>
              </div>
            </div>

            <!-- Add-ons -->
            <div class="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label class="flex items-center gap-2 border border-iron px-3 py-2 cursor-pointer hover:border-gold/50 transition-colors">
                <input v-model="txForm.includeMembershipFee" type="checkbox" class="accent-gold" @change="toggleTxFee" />
                <span class="text-[10px] sm:text-xs text-cream">Membership fee (+₱{{ MEMBERSHIP_FEE }})</span>
              </label>
              <label class="flex items-center gap-2 border border-iron px-3 py-2 cursor-pointer hover:border-gold/50 transition-colors">
                <input v-model="txForm.includeInstructorFee" type="checkbox" class="accent-gold" @change="toggleTxFee" />
                <span class="text-[10px] sm:text-xs text-cream">Instructor fee (+₱{{ INSTRUCTOR_FEE }})</span>
              </label>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <label for="tx-paid" class="block text-[11px] sm:text-sm text-mist mb-1">Amount Paid (₱) *</label>
                <input id="tx-paid" v-model.number="txForm.paidAmount" type="number" min="1" step="1" class="input-field" placeholder="Amount actually paid" />
                <p class="text-mist text-[9px] sm:text-[10px] mt-0.5">
                  Default total: ₱{{ txSuggestedAmount.toLocaleString() }} (plan ₱{{ txPlanPrice.toLocaleString() }} + fees ₱{{ txFeeTotal.toLocaleString() }})
                </p>
              </div>
              <div>
                <label for="tx-method" class="block text-[11px] sm:text-sm text-mist mb-1">Payment Method *</label>
                <select id="tx-method" v-model="txForm.paymentMethod" class="input-field">
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label for="tx-ref" class="block text-[11px] sm:text-sm text-mist mb-1">Reference No. (optional)</label>
                <input id="tx-ref" v-model="txForm.referenceNo" type="text" class="input-field" maxlength="40" placeholder="GCash / bank ref" />
              </div>
              <div>
                <label for="tx-coach" class="block text-[11px] sm:text-sm text-mist mb-1">Coach (optional)</label>
                <select id="tx-coach" v-model="txForm.coach" class="input-field">
                  <option value="">No preference</option>
                  <option v-for="coach in coachesList" :key="coach.id" :value="coach.fullName">{{ coach.fullName }}</option>
                </select>
              </div>
            </div>

            <div
              class="mb-4 border px-3 py-2 text-[11px] sm:text-xs"
              :class="txPaymentStatus === 'Full' ? 'border-green-400/30 bg-green-400/5' : 'border-orange-400/30 bg-orange-400/5'"
            >
              <span class="font-medium" :class="txPaymentStatus === 'Full' ? 'text-green-400' : 'text-orange-400'">{{ txPaymentStatus }}</span>
              <span class="text-mist"> — ₱{{ txPaidValue.toLocaleString() }} of ₱{{ txAmountValue.toLocaleString() }}</span>
              <span v-if="txPaymentStatus === 'Partial'" class="text-mist"> (₱{{ txBalance.toLocaleString() }} balance)</span>
              <span v-else-if="txChange > 0" class="text-yellow-400"> (₱{{ txChange.toLocaleString() }} change)</span>
            </div>

            <div class="mb-4">
              <label for="tx-note" class="block text-[11px] sm:text-sm text-mist mb-1">Note (optional)</label>
              <input id="tx-note" v-model="txForm.note" type="text" class="input-field" maxlength="200" placeholder="Discount, promo, remarks…" />
            </div>

            <p v-if="txExpiry" class="text-mist text-[10px] sm:text-xs mb-3">
              {{ txForm.plan.charAt(0).toUpperCase() + txForm.plan.slice(1) }} plan · expires <span class="text-cream">{{ txExpiry }}</span>
            </p>
            <p v-if="txError" class="text-red-400 text-xs sm:text-sm mb-3">{{ txError }}</p>

            <button type="button" class="btn-primary w-full" :disabled="txSubmitting" @click="submitTransaction">
              {{ txSubmitting ? 'Recording…' : 'Record Transaction' }}
            </button>
          </section>

          <!-- Summary Cards -->
          <div v-if="paymentsSummary && !paymentsLoading" class="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Total</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">{{ paymentsSummary.total }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Pending</p>
              <p class="font-display text-2xl sm:text-3xl text-yellow-400">{{ paymentsSummary.pending }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Partial</p>
              <p class="font-display text-2xl sm:text-3xl text-orange-400">{{ paymentsSummary.partial }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Approved</p>
              <p class="font-display text-2xl sm:text-3xl text-green-400">{{ paymentsSummary.approved }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Revenue</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">₱{{ paymentsSummary.totalRevenue.toLocaleString() }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">History</p>
              <p class="font-display text-2xl sm:text-3xl text-purple-400">{{ paymentsSummary.history }}</p>
            </div>
          </div>

          <section class="card p-4 sm:p-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
              <div>
                <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide">Membership Payments</h2>
                <p class="text-mist text-[10px] sm:text-xs mt-0.5">Review membership submissions, view receipts, and manage approvals.</p>
              </div>
              <button
                type="button"
                class="btn-outline text-[10px] sm:text-xs px-3 py-1.5 shrink-0"
                :disabled="paymentsLoading"
                @click="loadPayments()"
              >
                {{ paymentsLoading ? 'Loading…' : 'Refresh' }}
              </button>
            </div>

            <!-- Status counts -->
            <div v-if="paymentsSummary" class="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
              <span class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border border-yellow-400/30 text-yellow-400 bg-yellow-400/5">
                Pending {{ paymentsSummary.pending }}
              </span>
              <span class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border border-orange-400/30 text-orange-400 bg-orange-400/5">
                Partial {{ paymentsSummary.partial }}
              </span>
              <span class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border border-green-400/30 text-green-400 bg-green-400/5">
                Approved {{ paymentsSummary.approved }}
              </span>
              <span class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border border-red-400/30 text-red-400 bg-red-400/5">
                Rejected {{ paymentsSummary.rejected }}
              </span>
              <span class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border border-purple-400/30 text-purple-400 bg-purple-400/5">
                History {{ paymentsSummary.history }}
              </span>
            </div>

            <div v-if="paymentsLoading" class="text-center py-12">
              <div class="inline-flex items-center gap-2 text-mist text-xs sm:text-sm">
                <svg class="animate-spin h-4 w-4 text-gold" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading payments…
              </div>
            </div>

            <div v-else-if="paymentsList.length === 0" class="text-center py-12">
              <div class="text-4xl sm:text-5xl mb-3">💳</div>
              <p class="text-cream text-sm sm:text-base font-medium">No payments found.</p>
              <p class="text-mist text-[10px] sm:text-xs mt-1">Recorded transactions and website submissions will appear here.</p>
            </div>

            <div v-else class="space-y-3 sm:space-y-4">
              <div
                v-for="payment in paymentsList"
                :key="payment.id"
                class="border border-iron rounded-sm overflow-hidden"
              >
                <!-- Payment Header -->
                <div class="flex items-center justify-between gap-3 p-3 sm:p-4 bg-graphite/50">
                  <div class="min-w-0">
                    <p class="text-cream font-medium text-sm sm:text-base truncate">{{ payment.fullName }}</p>
                    <p class="text-mist text-[10px] sm:text-xs mt-0.5">{{ payment.phone }} · {{ payment.email }}</p>
                  </div>
                  <span
                    class="text-[9px] sm:text-[10px] uppercase tracking-wider px-2 sm:px-2.5 py-0.5 sm:py-1 shrink-0 font-medium rounded-sm"
                    :class="payment.status === 'approved' ? 'text-green-400 bg-green-400/10 border border-green-400/30' : payment.status === 'rejected' ? 'text-red-400 bg-red-400/10 border border-red-400/30' : payment.status === 'partial' ? 'text-orange-400 bg-orange-400/10 border border-orange-400/30' : 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/30'"
                  >
                    {{ payment.status }}
                  </span>
                </div>

                <!-- Payment Body -->
                <div class="p-3 sm:p-4 space-y-3 sm:space-y-4">

                  <!-- Payment Details -->
                  <div class="space-y-2">
                    <div class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Plan</span>
                      <span class="text-cream font-medium uppercase">{{ payment.plan }}</span>
                    </div>
                    <div class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Customer Type</span>
                      <span class="text-cream font-medium">{{ payment.customerType === 'non_member' ? 'Non-member' : 'Member' }}</span>
                    </div>
                    <div v-if="payment.planPrice != null" class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Plan Price</span>
                      <span class="text-cream font-medium">₱{{ payment.planPrice.toLocaleString() }}</span>
                    </div>
                    <div v-if="payment.membershipFee > 0" class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Membership Fee</span>
                      <span class="text-cream font-medium">₱{{ payment.membershipFee.toLocaleString() }}</span>
                    </div>
                    <div v-if="payment.instructorFee > 0" class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Instructor Fee</span>
                      <span class="text-cream font-medium">₱{{ payment.instructorFee.toLocaleString() }}</span>
                    </div>
                    <div class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Amount Due</span>
                      <span class="text-gold font-display text-base sm:text-lg">₱{{ payment.amount.toLocaleString() }}</span>
                    </div>
                    <template v-if="payment.paidAmount != null && payment.status !== 'pending'">
                      <div class="flex justify-between items-baseline text-[11px] sm:text-xs">
                        <span class="text-mist">Amount Paid</span>
                        <span class="text-green-400 font-medium">₱{{ payment.paidAmount.toLocaleString() }}</span>
                      </div>
                      <div v-if="payment.paidAmount < payment.amount" class="flex justify-between items-baseline text-[11px] sm:text-xs">
                        <span class="text-mist">Balance</span>
                        <span class="text-orange-400 font-medium">₱{{ (payment.amount - payment.paidAmount).toLocaleString() }}</span>
                      </div>
                      <div v-else class="flex justify-between items-baseline text-[11px] sm:text-xs">
                        <span class="text-mist">Change</span>
                        <span :class="payment.paidAmount > payment.amount ? 'text-yellow-400 font-medium' : 'text-cream'">₱{{ Math.max(0, payment.paidAmount - payment.amount).toLocaleString() }}</span>
                      </div>
                    </template>
                    <div class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Coach</span>
                      <span class="text-cream font-medium">{{ payment.coach ?? 'No preference' }}</span>
                    </div>
                    <div class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Payment Method</span>
                      <span class="text-cream font-medium uppercase">{{ payment.paymentMethod }}</span>
                    </div>
                    <div class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Reference No.</span>
                      <span class="text-cream font-medium">{{ payment.referenceNo ?? '—' }}</span>
                    </div>
                    <div class="flex justify-between items-baseline text-[11px] sm:text-xs">
                      <span class="text-mist">Expiry</span>
                      <span class="text-cream font-medium">{{ payment.expiryDate ?? '—' }}</span>
                    </div>
                  </div>

                  <div class="text-[9px] sm:text-[10px] text-mist pt-1 border-t border-iron/50">
                    Submitted: {{ new Date(payment.createdAt).toLocaleString() }}
                  </div>

                  <!-- Note -->
                  <div v-if="payment.note" class="bg-gold/5 border border-gold/20 rounded-sm p-2.5 text-[10px] sm:text-xs">
                    <span class="text-gold font-medium">Note:</span> <span class="text-cream">{{ payment.note }}</span>
                  </div>

                  <!-- Pending: Amount Input -->
                  <div v-if="payment.status === 'pending'" class="space-y-2 pt-1">
                    <div class="relative">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gold text-[10px] sm:text-xs">₱</span>
                      <input
                        v-model="paymentPaidAmountInput"
                        type="number"
                        min="0"
                        :max="payment.amount"
                        step="0.01"
                        class="input-field text-[11px] sm:text-xs py-2 pl-6"
                        :placeholder="`Amount paid (of ₱${payment.amount.toLocaleString()})`"
                      />
                    </div>
                    <input
                      v-model="paymentNoteInput"
                      type="text"
                      class="input-field text-[11px] sm:text-xs py-2"
                      placeholder="Add note (optional)"
                      maxlength="200"
                    />
                  </div>

                  <!-- Partial: Status & Input -->
                  <div v-if="payment.status === 'partial'" class="space-y-2 pt-1">
                    <div class="bg-orange-400/5 border border-orange-400/20 rounded-sm p-2.5 text-[10px] sm:text-xs">
                      <template v-if="payment.paidAmount >= payment.amount">
                        <span class="text-green-400 font-medium">Fully paid</span>
                        <span class="text-mist"> — ₱{{ payment.paidAmount.toLocaleString() }} of ₱{{ payment.amount.toLocaleString() }}</span>
                        <span v-if="payment.paidAmount > payment.amount" class="text-yellow-400 font-medium"> (₱{{ (payment.paidAmount - payment.amount).toLocaleString() }} change due)</span>
                      </template>
                      <template v-else>
                        <span class="text-orange-400 font-medium">Partially paid</span>
                        <span class="text-cream"> — ₱{{ (payment.paidAmount ?? 0).toLocaleString() }} of ₱{{ payment.amount.toLocaleString() }}</span>
                        <span class="text-mist"> (₱{{ (payment.amount - (payment.paidAmount ?? 0)).toLocaleString() }} remaining)</span>
                      </template>
                    </div>
                    <div class="relative">
                      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-gold text-[10px] sm:text-xs">₱</span>
                      <input
                        v-model="paymentPartialAmountInput"
                        type="number"
                        min="0"
                        step="0.01"
                        class="input-field text-[11px] sm:text-xs py-2 pl-6"
                        :placeholder="`Add amount (₱${(payment.amount - (payment.paidAmount ?? 0)).toLocaleString()} remaining)`"
                      />
                    </div>
                    <input
                      v-model="paymentPartialNoteInput"
                      type="text"
                      class="input-field text-[11px] sm:text-xs py-2"
                      placeholder="Add note (optional)"
                      maxlength="200"
                    />
                  </div>

                  <!-- Actions -->
                  <div class="flex gap-2 pt-1">
                    <button
                      v-if="payment.receiptUrl"
                      type="button"
                      class="btn-outline flex-1 text-[10px] sm:text-xs py-2 sm:py-2.5"
                      @click="openReceiptModal(payment.receiptUrl, payment.fullName)"
                    >
                      View Receipt
                    </button>
                    <template v-if="payment.status === 'pending'">
                      <button
                        type="button"
                        class="btn-primary flex-1 text-[10px] sm:text-xs py-2 sm:py-2.5"
                        :disabled="paymentActionLoading === payment.id"
                        @click="updatePaymentStatus(payment.id, 'approved')"
                      >
                        {{ paymentActionLoading === payment.id ? 'Processing…' : 'Approve' }}
                      </button>
                      <button
                        type="button"
                        class="btn-outline flex-1 text-[10px] sm:text-xs py-2 sm:py-2.5 text-orange-400 border-orange-400/30 hover:border-orange-400/50"
                        :disabled="paymentActionLoading === payment.id"
                        @click="updatePaymentStatus(payment.id, 'partial')"
                      >
                        Mark Partial
                      </button>
                      <button
                        type="button"
                        class="btn-outline flex-1 text-[10px] sm:text-xs py-2 sm:py-2.5 text-red-400 border-red-400/30 hover:border-red-400/50"
                        :disabled="paymentActionLoading === payment.id"
                        @click="updatePaymentStatus(payment.id, 'rejected')"
                      >
                        Reject
                      </button>
                    </template>
                    <template v-if="payment.status === 'partial'">
                      <button
                        v-if="payment.paidAmount == null || payment.paidAmount < payment.amount"
                        type="button"
                        class="btn-outline flex-1 text-[10px] sm:text-xs py-2 sm:py-2.5 text-orange-400 border-orange-400/30 hover:border-orange-400/50"
                        :disabled="paymentActionLoading === payment.id"
                        @click="addPartialPayment(payment)"
                      >
                        {{ paymentActionLoading === payment.id ? 'Processing…' : 'Add Payment' }}
                      </button>
                      <button
                        v-if="payment.paidAmount == null || payment.paidAmount < payment.amount"
                        type="button"
                        class="btn-outline flex-1 text-[10px] sm:text-xs py-2 sm:py-2.5 text-gold border-gold/30 hover:border-gold/50"
                        :disabled="paymentActionLoading === payment.id"
                        @click="markPartialDone(payment)"
                      >
                        {{ paymentActionLoading === payment.id ? 'Processing…' : 'Mark Done (₱' + payment.amount.toLocaleString() + ')' }}
                      </button>
                      <button
                        v-if="payment.paidAmount != null && payment.paidAmount >= payment.amount"
                        type="button"
                        class="btn-primary flex-1 text-[10px] sm:text-xs py-1.5 sm:py-2"
                        :disabled="paymentActionLoading === payment.id"
                        @click="approvePartialPayment(payment)"
                      >
                        {{ paymentActionLoading === payment.id ? 'Processing…' : 'Approve (₱' + (payment.paidAmount - payment.amount).toLocaleString() + ' change)' }}
                      </button>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Receipt Modal -->
          <div v-if="receiptModalUrl || receiptModalLoading" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-onyx/90 backdrop-blur-sm" @click.self="receiptModalUrl = ''; receiptModalLoading = false">
            <div class="bg-graphite border border-iron rounded-sm max-w-lg w-full max-h-[90vh] overflow-hidden">
              <div class="flex items-center justify-between p-3 sm:p-4 border-b border-iron">
                <div>
                  <p class="text-cream font-medium text-sm sm:text-base">Receipt</p>
                  <p class="text-mist text-[10px] sm:text-xs">{{ receiptModalName }}</p>
                </div>
                <button type="button" class="text-mist hover:text-cream transition-colors text-lg" @click="receiptModalUrl = ''; receiptModalLoading = false">
                  ✕
                </button>
              </div>
              <div class="p-3 sm:p-4 overflow-y-auto max-h-[70vh]">
                <div v-if="receiptModalLoading" class="text-center py-10">
                  <div class="inline-flex items-center gap-2 text-mist text-xs sm:text-sm">
                    <svg class="animate-spin h-4 w-4 text-gold" viewBox="0 0 24 24" fill="none">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading receipt…
                  </div>
                </div>
                <img v-else-if="receiptModalUrl" :src="receiptModalUrl" alt="Payment receipt" class="w-full rounded-sm" loading="lazy" decoding="async" />
              </div>
            </div>
          </div>
        </template>
        <!-- COACHES TAB -->
        <template v-if="activeTab === 'coaches'">
          <!-- Add/Edit Coach Form -->
          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">
              {{ editingCoach ? 'Edit Coach' : 'Add Coach' }}
            </h2>
            <form class="space-y-3 sm:space-y-4" @submit.prevent="editingCoach ? updateCoach() : addCoach()">
              <div>
                <label for="coach-name" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Full Name *</label>
                <input id="coach-name" v-model="coachForm.fullName" type="text" class="input-field" maxlength="100" placeholder="Coach name" />
              </div>
              <div>
                <label class="block text-[11px] sm:text-sm text-mist mb-1.5 sm:mb-2">Specialty</label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                  <label
                    v-for="opt in specialtyOptions"
                    :key="opt"
                    class="flex items-center gap-1.5 sm:gap-2 cursor-pointer p-1.5 sm:p-2 border border-iron hover:border-gold/50 transition-colors"
                    :class="coachForm.specialty.includes(opt) ? 'border-gold bg-gold/5' : ''"
                  >
                    <input
                      type="checkbox"
                      :value="opt"
                      v-model="coachForm.specialty"
                      class="accent-gold"
                    />
                    <span class="text-[10px] sm:text-xs text-cream">{{ opt }}</span>
                  </label>
                </div>
                <div v-if="coachForm.specialty.includes('Other')" class="mt-2">
                  <input
                    v-model="customSpecialty"
                    type="text"
                    class="input-field"
                    maxlength="100"
                    placeholder="Type your specialty"
                  />
                </div>
              </div>
              <div>
                <label for="coach-bio" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Bio</label>
                <textarea id="coach-bio" v-model="coachForm.bio" rows="3" class="input-field resize-none" maxlength="500" placeholder="Short description about the coach" />
              </div>
              <div>
                <label for="coach-photo" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Photo</label>
                <label for="coach-photo" class="flex items-center gap-3 cursor-pointer">
                  <div class="w-16 h-16 rounded-full overflow-hidden border border-iron bg-graphite flex items-center justify-center shrink-0">
                    <img v-if="coachPhotoPreview || coachForm.photoUrl" :src="coachPhotoPreview || coachForm.photoUrl" alt="Coach photo" class="w-full h-full object-cover" loading="lazy" decoding="async" width="64" height="64" />
                    <span v-else class="text-mist text-lg">📷</span>
                  </div>
                  <div class="text-[10px] sm:text-xs text-mist">
                    <p class="text-gold hover:underline">Tap to upload photo</p>
                    <p class="text-mist/60">JPEG, PNG, or WebP — max 5MB</p>
                  </div>
                </label>
                <input id="coach-photo" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" class="sr-only" @change="handleCoachPhotoChange" />
                <p v-if="coachPhotoUploading" class="text-gold text-[9px] sm:text-[10px] mt-0.5">Uploading photo...</p>
              </div>


              <div class="flex gap-2">
                <button type="submit" class="btn-primary flex-1" :disabled="coachLoading">
                  {{ coachLoading ? 'Saving…' : editingCoach ? 'Update Coach' : 'Add Coach' }}
                </button>
                <button v-if="editingCoach" type="button" class="btn-outline" @click="resetCoachForm">
                  Cancel
                </button>
              </div>
            </form>
          </section>

          <!-- Coaches List -->
          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Current Coaches</h2>
            <div v-if="coachesList.length === 0" class="text-center py-6">
              <p class="text-mist text-xs sm:text-sm">No coaches added yet.</p>
            </div>
            <ul v-else class="space-y-2 sm:space-y-3">
              <li
                v-for="coach in coachesList"
                :key="coach.id"
                class="border border-iron p-3 sm:p-4"
                :class="editingCoach?.id === coach.id ? 'border-gold' : ''"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-cream font-medium text-sm sm:text-base">{{ coach.fullName }}</p>
                    <p v-if="coach.specialty" class="text-gold text-[11px] sm:text-xs mt-0.5">{{ coach.specialty }}</p>
                    <p v-if="coach.bio" class="text-mist text-[10px] sm:text-xs truncate mt-0.5">{{ coach.bio }}</p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button
                      type="button"
                      class="text-gold hover:text-gold-light text-[10px] sm:text-xs uppercase tracking-wider transition-colors"
                      @click="startEditCoach(coach)"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="text-[10px] sm:text-xs uppercase tracking-wider transition-colors px-2 py-1"
                      :class="coachConfirmDelete === coach.id ? 'bg-red-400/20 text-red-400 border border-red-400/50' : 'text-red-400 hover:text-red-300'"
                      @click="deleteCoach(coach.id, coach.fullName)"
                    >
                      {{ coachConfirmDelete === coach.id ? 'Confirm Remove' : 'Remove' }}
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </section>
        </template>
      </div>
    </main>
  </div>
</template>

<style>
@media (max-width: 380px) {
  .font-display {
    letter-spacing: 0.05em;
  }
}
</style>
