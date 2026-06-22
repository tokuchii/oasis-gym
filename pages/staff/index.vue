<script setup lang="ts">
import { Html5Qrcode } from 'html5-qrcode'
import { WALKIN_DEFAULT_FEE } from '~/types/walkin'
import { generateWalkinQrDataUrl } from '~/composables/useWalkinPass'

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
}

const authenticated = ref(false)
const checkingSession = ref(true)
const loginPassword = ref('')
const loginError = ref('')
const loginSubmitting = ref(false)

const activeTab = ref<'checkout' | 'walkin' | 'membership' | 'reports' | 'coaches' | 'management' | 'leaderboard'>('checkout')

const walkinForm = reactive({
  fullName: '',
  email: '',
  phone: '',
  emergencyContact: '',
})
const walkinSubmitting = ref(false)
const walkinMessage = ref('')
const walkinError = ref('')
const walkinPassCode = ref('')
const walkinQrDataUrl = ref('')

const scannerActive = ref(false)

const searchMode = ref<'code' | 'phone' | 'name'>('code')
const searchQuery = ref('')
const searchResults = ref<PassResult[]>([])
const searchLoading = ref(false)
const searchError = ref('')

const selectedPass = ref<PassResult | null>(null)
const checkinLoading = ref(false)
const checkinMessage = ref('')
const checkinError = ref('')
const checkinPaymentAmount = ref(WALKIN_DEFAULT_FEE)

const reportPeriod = ref<'day' | 'week' | 'month'>('day')
const reportLoading = ref(false)
const reportError = ref('')
const reportData = ref<{ visits: ReportVisit[]; summary: ReportSummary; chartData: ChartPoint[] } | null>(null)

const reminderLoading = ref(false)
const reminderMessage = ref('')
const reminderError = ref('')

async function sendReminders() {
  reminderLoading.value = true
  reminderMessage.value = ''
  reminderError.value = ''

  try {
    const data = await $fetch<{ message: string; sent: number; failed: number }>('/api/membership/send-reminders', {
      method: 'POST',
    })
    reminderMessage.value = data.message
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    reminderError.value = fetchErr.data?.statusMessage ?? 'Failed to send reminders.'
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

const clientsList = ref<ClientSession[]>([])
const clientLoading = ref(false)
const clientError = ref('')
const clientSuccess = ref('')
const clientCoachFilter = ref('')

interface LeaderboardEntry {
  rank: number
  id: string
  passCode: string
  fullName: string
  email: string
  phone: string
  points: number
  totalVisits: number
}

interface LeaderboardStats {
  totalGuests: number
  totalPointsAwarded: number
  topGuestName: string | null
  topGuestPoints: number
}

const leaderboardData = ref<LeaderboardEntry[]>([])
const leaderboardStats = ref<LeaderboardStats | null>(null)
const leaderboardLoading = ref(false)
const leaderboardError = ref('')
const leaderboardSearch = ref('')

const filteredLeaderboard = computed(() => {
  if (!leaderboardSearch.value.trim()) return leaderboardData.value
  const q = leaderboardSearch.value.toLowerCase()
  return leaderboardData.value.filter(
    (e) => e.fullName.toLowerCase().includes(q) || e.passCode.toLowerCase().includes(q),
  )
})

function rankBadge(rank: number) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

async function loadLeaderboard() {
  leaderboardError.value = ''
  leaderboardLoading.value = true
  try {
    const data = await $fetch<{ leaderboard: LeaderboardEntry[]; stats: LeaderboardStats }>('/api/walkin/leaderboard')
    leaderboardData.value = data.leaderboard
    leaderboardStats.value = data.stats
  } catch {
    leaderboardError.value = 'Failed to load leaderboard.'
  } finally {
    leaderboardLoading.value = false
  }
}

const filteredClients = computed(() => {
  if (!clientCoachFilter.value) return clientsList.value
  return clientsList.value.filter((c) => c.coach_name === clientCoachFilter.value)
})

const clientForm = reactive({
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  coachName: '',
  plan: '' as 'weekly' | 'monthly' | '',
})

const scannerRef = ref<HTMLElement | null>(null)
let scanner: Html5Qrcode | null = null

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
    const data = await $fetch<{ authenticated: boolean }>('/api/admin/session')
    authenticated.value = data.authenticated
  } catch {
    authenticated.value = false
  } finally {
    checkingSession.value = false
  }
}

async function login() {
  loginError.value = ''
  loginSubmitting.value = true
  try {
    await $fetch('/api/admin/login', {
      method: 'POST',
      body: { password: loginPassword.value },
    })
    authenticated.value = true
    loginPassword.value = ''
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    loginError.value = fetchErr.data?.statusMessage ?? 'Login failed.'
  } finally {
    loginSubmitting.value = false
  }
}

async function logout() {
  await $fetch('/api/admin/logout', { method: 'POST' })
  authenticated.value = false
  destroyScanner()
  resetState()
}

function resetState() {
  searchMode.value = 'code'
  searchResults.value = []
  selectedPass.value = null
  searchQuery.value = ''
  searchError.value = ''
  checkinMessage.value = ''
  checkinError.value = ''
  walkinMessage.value = ''
  walkinError.value = ''
  scannerActive.value = false
  destroyScanner()
}

async function startScanner() {
  scannerActive.value = true
  await nextTick()
  await initScanner()
}

function stopScanner() {
  destroyScanner()
  scannerActive.value = false
}

async function submitWalkin() {
  walkinMessage.value = ''
  walkinError.value = ''
  walkinPassCode.value = ''
  walkinQrDataUrl.value = ''

  if (!walkinForm.fullName.trim()) { walkinError.value = 'Full name is required.'; return }
  if (!walkinForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(walkinForm.email)) { walkinError.value = 'Valid email is required.'; return }
  if (!walkinForm.phone.trim()) { walkinError.value = 'Phone number is required.'; return }
  if (!/^(09|\+639)\d{9}$/.test(walkinForm.phone.trim())) { walkinError.value = 'Phone must be a valid Philippine mobile number (09XXXXXXXXX).' ; return }
  if (!walkinForm.emergencyContact.trim()) { walkinError.value = 'Emergency contact is required.'; return }

  walkinSubmitting.value = true
  try {
    const data = await $fetch<{ passCode: string; qrPayload: string; message: string }>('/api/walkin/register', {
      method: 'POST',
      body: {
        fullName: walkinForm.fullName,
        email: walkinForm.email,
        phone: walkinForm.phone,
        emergencyContact: walkinForm.emergencyContact,
      },
    })
    walkinPassCode.value = data.passCode
    try {
      walkinQrDataUrl.value = await generateWalkinQrDataUrl(data.qrPayload)
    } catch {
      walkinQrDataUrl.value = ''
    }
    walkinMessage.value = data.message
    walkinForm.fullName = ''
    walkinForm.email = ''
    walkinForm.phone = ''
    walkinForm.emergencyContact = ''
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    walkinError.value = fetchErr.data?.statusMessage ?? 'Registration failed.'
  } finally {
    walkinSubmitting.value = false
  }
}

function destroyScanner() {
  if (scanner) {
    scanner.stop().catch(() => {})
    scanner.clear().catch(() => {})
    scanner = null
  }
}

async function initScanner() {
  if (!scannerRef.value || scanner) return

  const readerEl = document.getElementById('qr-reader')
  if (!readerEl) return

  scanner = new Html5Qrcode('qr-reader')

  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        const code = decodedText.trim().toUpperCase()
        searchMode.value = 'code'
        searchQuery.value = code
        await runSearch()
        const match = searchResults.value.find((p) => p.passCode === code)
        if (match) selectPass(match)
      },
      () => {},
    )
  } catch (err: unknown) {
    const message = String(err ?? '')
    if (message.includes('NotAllowedError') || message.includes('Permission')) {
      searchError.value = 'Camera access denied. Please allow camera permission.'
    } else {
      searchError.value = 'Could not start camera. Please try again.'
    }
    scanner = null
  }
}

async function runSearch() {
  searchError.value = ''
  checkinMessage.value = ''
  checkinError.value = ''
  selectedPass.value = null
  searchLoading.value = true

  try {
    const params: Record<string, string> = {}
    if (searchMode.value === 'code') params.code = searchQuery.value
    else if (searchMode.value === 'phone') params.phone = searchQuery.value
    else params.name = searchQuery.value

    const data = await $fetch<{ results: PassResult[] }>('/api/walkin/lookup', { params })
    searchResults.value = data.results
    if (data.results.length === 0) {
      searchError.value = 'No passes found.'
    }
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    searchError.value = fetchErr.data?.statusMessage ?? 'Search failed.'
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

function selectPass(pass: PassResult) {
  selectedPass.value = pass
  checkinMessage.value = ''
  checkinError.value = ''
  checkinPaymentAmount.value = WALKIN_DEFAULT_FEE
}

async function checkIn(passCode: string) {
  if (!window.confirm('Check out this guest?')) return
  checkinLoading.value = true
  checkinMessage.value = ''
  checkinError.value = ''

  try {
    const data = await $fetch<{ pass: PassResult; message: string }>('/api/walkin/checkout', {
      method: 'POST',
      body: { passCode, paymentAmount: checkinPaymentAmount.value },
    })
    checkinMessage.value = data.message
    selectedPass.value = data.pass
    await runSearch()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    checkinError.value = fetchErr.data?.statusMessage ?? 'Check-out failed.'
  } finally {
    checkinLoading.value = false
  }
}

interface MembershipPayment {
  id: string
  fullName: string
  email: string
  phone: string
  plan: 'weekly' | 'monthly'
  coach: string | null
  paymentMethod: string
  referenceNo: string | null
  amount: number
  receiptUrl: string | null
  status: 'pending' | 'approved' | 'rejected'
  expiryDate: string | null
  createdAt: string
}

interface PaymentSummary {
  total: number
  pending: number
  approved: number
  rejected: number
  totalRevenue: number
}

const paymentsList = ref<MembershipPayment[]>([])
const paymentsSummary = ref<PaymentSummary | null>(null)
const paymentsLoading = ref(false)
const paymentsError = ref('')
const paymentsStatusFilter = ref('')
const paymentsCoachFilter = ref('')
const paymentActionLoading = ref('')
const receiptModalUrl = ref('')
const receiptModalName = ref('')
const receiptModalLoading = ref(false)

async function openReceiptModal(url: string, name: string) {
  receiptModalLoading.value = true
  receiptModalUrl.value = ''
  receiptModalName.value = name
  try {
    const data = await $fetch<{ signedUrl: string }>('/api/membership/receipt-url', {
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
    const params: Record<string, string> = {}
    if (paymentsStatusFilter.value) params.status = paymentsStatusFilter.value
    if (paymentsCoachFilter.value) params.coach = paymentsCoachFilter.value
    const data = await $fetch<{ payments: MembershipPayment[]; summary: PaymentSummary }>('/api/membership/list', { params })
    paymentsList.value = data.payments
    paymentsSummary.value = data.summary
  } catch {
    paymentsError.value = 'Failed to load payments.'
  } finally {
    paymentsLoading.value = false
  }
}

async function updatePaymentStatus(id: string, status: 'approved' | 'rejected') {
  const label = status === 'approved' ? 'Approve' : 'Reject'
  if (!window.confirm(`${label} this payment?`)) return

  paymentActionLoading.value = id
  try {
    await $fetch('/api/membership/update-status', {
      method: 'POST',
      body: { id, status },
    })
    await loadPayments()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    paymentsError.value = fetchErr.data?.statusMessage ?? `Failed to ${label.toLowerCase()} payment.`
  } finally {
    paymentActionLoading.value = ''
  }
}

async function loadReports() {
  reportError.value = ''
  reportLoading.value = true
  reportData.value = null
  visitLogLimit.value = 5

  try {
    const data = await $fetch<{ visits: ReportVisit[]; summary: ReportSummary; chartData: ChartPoint[] }>('/api/staff/reports', {
      params: { period: reportPeriod.value },
    })
    reportData.value = data
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    reportError.value = fetchErr.data?.statusMessage ?? 'Failed to load reports.'
  } finally {
    reportLoading.value = false
  }
}

async function loadCoaches() {
  coachError.value = ''
  try {
    const data = await $fetch<{ coaches: CoachItem[] }>('/api/coaches/list')
    coachesList.value = data.coaches
  } catch {
    coachError.value = 'Failed to load coaches.'
  }
}

function resetCoachForm() {
  coachForm.fullName = ''
  coachForm.specialty = []
  coachForm.bio = ''
  coachForm.photoUrl = ''
  customSpecialty.value = ''
  editingCoach.value = null
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
  if (!coachForm.fullName.trim()) {
    coachError.value = 'Full name is required.'
    return
  }

  coachError.value = ''
  coachSuccess.value = ''
  coachLoading.value = true

  try {
    const data = await $fetch<{ message: string }>('/api/coaches/create', {
      method: 'POST',
      body: {
        fullName: coachForm.fullName,
        specialty: getSpecialtyString(),
        bio: coachForm.bio,
        photoUrl: coachForm.photoUrl,
      },
    })
    coachSuccess.value = data.message
    resetCoachForm()
    await loadCoaches()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    coachError.value = fetchErr.data?.statusMessage ?? 'Failed to add coach.'
  } finally {
    coachLoading.value = false
  }
}

async function updateCoach() {
  if (!editingCoach.value) return
  if (!coachForm.fullName.trim()) {
    coachError.value = 'Full name is required.'
    return
  }

  coachError.value = ''
  coachSuccess.value = ''
  coachLoading.value = true

  try {
    const data = await $fetch<{ message: string }>('/api/coaches/update', {
      method: 'POST',
      body: {
        id: editingCoach.value.id,
        fullName: coachForm.fullName,
        specialty: getSpecialtyString(),
        bio: coachForm.bio,
        photoUrl: coachForm.photoUrl,
      },
    })
    coachSuccess.value = data.message
    resetCoachForm()
    await loadCoaches()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    coachError.value = fetchErr.data?.statusMessage ?? 'Failed to update coach.'
  } finally {
    coachLoading.value = false
  }
}

async function deleteCoach(id: string, name: string) {
  if (!window.confirm(`Remove ${name} from coaches?`)) return

  coachError.value = ''
  coachSuccess.value = ''

  try {
    await $fetch('/api/coaches/delete', {
      method: 'POST',
      body: { id },
    })
    coachSuccess.value = 'Coach removed.'
    await loadCoaches()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    coachError.value = fetchErr.data?.statusMessage ?? 'Failed to remove coach.'
  }
}

async function loadClients() {
  clientError.value = ''
  try {
    const [clientsData, coachesData] = await Promise.all([
      $fetch<{ clients: ClientSession[] }>('/api/clients/list'),
      $fetch<{ coaches: CoachItem[] }>('/api/coaches/list'),
    ])
    clientsList.value = clientsData.clients
    coachesList.value = coachesData.coaches
  } catch {
    clientError.value = 'Failed to load data.'
  }
}

async function addClient() {
  if (!clientForm.clientName.trim()) { clientError.value = 'Client name is required.'; return }
  if (!clientForm.clientEmail.trim()) { clientError.value = 'Client email is required.'; return }
  if (!clientForm.clientPhone.trim()) { clientError.value = 'Client phone is required.'; return }
  if (!clientForm.plan) { clientError.value = 'Please select a plan.'; return }

  clientError.value = ''
  clientSuccess.value = ''
  clientLoading.value = true

  try {
    const data = await $fetch<{ message: string }>('/api/clients/create', {
      method: 'POST',
      body: {
        clientName: clientForm.clientName,
        clientEmail: clientForm.clientEmail,
        clientPhone: clientForm.clientPhone,
        coachName: clientForm.coachName,
        plan: clientForm.plan,
      },
    })
    clientSuccess.value = data.message
    clientForm.clientName = ''
    clientForm.clientEmail = ''
    clientForm.clientPhone = ''
    clientForm.coachName = ''
    clientForm.plan = ''
    await loadClients()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    clientError.value = fetchErr.data?.statusMessage ?? 'Failed to add client.'
  } finally {
    clientLoading.value = false
  }
}

async function toggleSession(clientId: string, action: 'add_session' | 'remove_session') {
  clientError.value = ''

  try {
    await $fetch('/api/clients/update', {
      method: 'POST',
      body: { id: clientId, action },
    })
    await loadClients()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    clientError.value = fetchErr.data?.statusMessage ?? 'Failed to update session.'
  }
}

async function deleteClient(id: string, name: string) {
  if (!window.confirm(`Remove ${name} from clients?`)) return

  clientError.value = ''
  clientSuccess.value = ''

  try {
    await $fetch('/api/clients/delete', { method: 'POST', body: { id } })
    clientSuccess.value = 'Client removed.'
    await loadClients()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    clientError.value = fetchErr.data?.statusMessage ?? 'Failed to remove client.'
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

function exportReport() {
  if (!reportData.value) return

  const rows: string[] = []
  rows.push('Date,Name,Pass Code,Phone,Status,Amount')
  for (const v of reportData.value.visits) {
    const status = v.status === 'checked_in' ? 'Checked Out' : v.status === 'registered' ? 'Registered' : 'Expired'
    const amount = v.paymentAmount ? `₱${v.paymentAmount}` : '—'
    rows.push(`"${v.visitDate}","${v.fullName}","${v.passCode}","${v.phone}","${status}","${amount}"`)
  }
  rows.push('')
  rows.push('Summary')
  rows.push(`Total Visits,${reportData.value.summary.totalVisits}`)
  rows.push(`Checked Out,${reportData.value.summary.checkedOut}`)
  rows.push(`Total Revenue,₱${reportData.value.summary.totalRevenue}`)
  rows.push(`Unique Members,${reportData.value.summary.uniqueMembers}`)
  rows.push(`Period,${reportData.value.summary.period}`)
  rows.push(`Date From,${reportData.value.summary.dateFrom}`)
  rows.push(`Date To,${reportData.value.summary.dateTo}`)

  const csv = rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `oasis-report-${reportData.value.summary.dateFrom}-to-${reportData.value.summary.dateTo}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  await checkSession()
})

onUnmounted(() => {
  destroyScanner()
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
      </div>

      <!-- Dashboard -->
      <div v-else class="space-y-6 sm:space-y-8">
        <!-- Tab Navigation -->
        <div class="flex gap-1.5 sm:gap-2 border-b border-iron overflow-x-auto">
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
            Walk-in
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'membership' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'membership'; loadPayments()"
          >
            Membership
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'reports' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'reports'; loadReports()"
          >
            Reports
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'coaches' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'coaches'; loadCoaches()"
          >
            Coaches
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'management' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'management'; loadClients()"
          >
            Management
          </button>
          <button
            type="button"
            class="px-3 sm:px-4 py-2 text-[10px] sm:text-xs uppercase tracking-wider border-b-2 transition-colors shrink-0"
            :class="activeTab === 'leaderboard' ? 'border-gold text-gold' : 'border-transparent text-mist hover:text-cream'"
            @click="activeTab = 'leaderboard'; loadLeaderboard()"
          >
            Leaderboard
          </button>
        </div>

        <!-- CHECK-OUT TAB -->
        <template v-if="activeTab === 'checkout'">
          <!-- QR Scanner -->
          <section class="card p-4 sm:p-6">
            <div class="flex items-center justify-between mb-3 sm:mb-4">
              <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide">Scan QR Code</h2>
              <button
                v-if="!scannerActive"
                type="button"
                class="btn-primary text-[10px] sm:text-xs px-3 py-1.5"
                @click="startScanner"
              >
                Start Camera
              </button>
              <button
                v-else
                type="button"
                class="btn-outline text-[10px] sm:text-xs px-3 py-1.5"
                @click="stopScanner"
              >
                Stop Camera
              </button>
            </div>
            <div v-if="scannerActive" ref="scannerRef">
              <div id="qr-reader" class="overflow-hidden rounded-sm" />
            </div>
            <p v-else class="text-mist text-[11px] sm:text-sm text-center py-4">
              Tap "Start Camera" to scan a guest's QR code.
            </p>
          </section>

          <!-- Search -->
          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Search Pass</h2>
            <div class="flex gap-1.5 sm:gap-2 mb-3 sm:mb-4 overflow-x-auto">
              <button
                type="button"
                class="px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors shrink-0"
                :class="searchMode === 'code' ? 'border-gold text-gold' : 'border-iron text-mist'"
                @click="searchMode = 'code'"
              >
                Code
              </button>
              <button
                type="button"
                class="px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors shrink-0"
                :class="searchMode === 'phone' ? 'border-gold text-gold' : 'border-iron text-mist'"
                @click="searchMode = 'phone'"
              >
                Phone
              </button>
              <button
                type="button"
                class="px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors shrink-0"
                :class="searchMode === 'name' ? 'border-gold text-gold' : 'border-iron text-mist'"
                @click="searchMode = 'name'"
              >
                Name
              </button>
            </div>
            <form class="flex gap-2" @submit.prevent="runSearch">
              <input
                v-model="searchQuery"
                type="text"
                class="input-field flex-1 min-w-0"
                :placeholder="searchMode === 'code' ? 'OASIS-XXXXXX' : searchMode === 'phone' ? 'Phone number' : 'Guest name'"
              />
              <button type="submit" class="btn-primary shrink-0" :disabled="searchLoading">
                {{ searchLoading ? '…' : 'Search' }}
              </button>
            </form>
            <p v-if="searchError" class="text-red-400 text-xs sm:text-sm mt-2 sm:mt-3">{{ searchError }}</p>

            <ul v-if="searchResults.length" class="mt-3 sm:mt-4 space-y-1.5 sm:space-y-2">
              <li
                v-for="pass in searchResults"
                :key="pass.id"
                class="border border-iron p-3 sm:p-4 cursor-pointer hover:border-gold/50 transition-colors"
                :class="selectedPass?.id === pass.id ? 'border-gold' : ''"
                @click="selectPass(pass)"
              >
                <div class="flex items-center justify-between gap-3 sm:gap-4">
                  <div class="min-w-0">
                    <p class="text-cream font-medium text-sm sm:text-base truncate">{{ pass.fullName }}</p>
                    <p class="text-mist text-xs sm:text-sm truncate">{{ pass.passCode }} · {{ pass.phone }}</p>
                  </div>
                  <span class="text-[10px] sm:text-xs uppercase tracking-wider shrink-0" :class="statusClass(pass.status)">
                    {{ statusLabel(pass.status) }}
                  </span>
                </div>
              </li>
            </ul>
          </section>

          <!-- Pass Details + Check-out -->
          <section v-if="selectedPass" class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Pass Details</h2>
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
                <dd class="text-cream text-right break-all">{{ selectedPass.email }}</dd>
              </div>
              <div class="flex justify-between gap-3 sm:gap-4">
                <dt class="text-mist shrink-0">Emergency</dt>
                <dd class="text-cream text-right break-all">{{ selectedPass.emergencyContact }}</dd>
              </div>
              <div class="flex justify-between gap-3 sm:gap-4">
                <dt class="text-mist shrink-0">Visit date</dt>
                <dd class="text-cream text-right">{{ selectedPass.visitDate }}</dd>
              </div>
              <div class="flex justify-between gap-3 sm:gap-4">
                <dt class="text-mist shrink-0">Status</dt>
                <dd :class="statusClass(selectedPass.status)">{{ statusLabel(selectedPass.status) }}</dd>
              </div>
            </dl>

            <div v-if="selectedPass.status === 'registered'" class="mb-4 sm:mb-6">
              <label for="co-pay-amount" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Payment Amount (₱)</label>
              <input
                id="co-pay-amount"
                v-model.number="checkinPaymentAmount"
                type="number"
                min="0"
                step="1"
                class="input-field"
                :placeholder="`Default: ₱${WALKIN_DEFAULT_FEE}`"
              />
            </div>

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

            <p v-if="checkinMessage" class="text-green-400 text-xs sm:text-sm text-center mt-3 sm:mt-4">{{ checkinMessage }}</p>
            <p v-if="checkinError" class="text-red-400 text-xs sm:text-sm text-center mt-3 sm:mt-4">{{ checkinError }}</p>
          </section>
        </template>

        <!-- WALK-IN TAB -->
        <template v-if="activeTab === 'walkin'">
          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Register Walk-in</h2>
            <p class="text-mist text-[11px] sm:text-sm mb-3 sm:mb-6">
              Register a new walk-in guest. They will receive a permanent QR code for future visits.
            </p>

            <template v-if="!walkinPassCode">
              <form class="space-y-3 sm:space-y-4" @submit.prevent="submitWalkin">
                <div>
                  <label for="wi-name" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Full Name *</label>
                  <input id="wi-name" v-model="walkinForm.fullName" type="text" class="input-field" maxlength="100" placeholder="Guest name" />
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label for="wi-email" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Email *</label>
                    <input id="wi-email" v-model="walkinForm.email" type="email" class="input-field" placeholder="guest@email.com" />
                  </div>
                  <div>
                    <label for="wi-phone" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Phone *</label>
                    <input id="wi-phone" v-model="walkinForm.phone" type="tel" class="input-field" maxlength="11" placeholder="09XXXXXXXXX" />
                  </div>
                </div>
                <div>
                  <label for="wi-emergency" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Emergency Contact *</label>
                  <input id="wi-emergency" v-model="walkinForm.emergencyContact" type="text" class="input-field" maxlength="100" placeholder="Name & phone number" />
                </div>

                <p v-if="walkinError" class="text-red-400 text-xs sm:text-sm">{{ walkinError }}</p>

                <button type="submit" class="btn-primary w-full" :disabled="walkinSubmitting">
                  {{ walkinSubmitting ? 'Registering…' : 'Register Walk-in' }}
                </button>
              </form>
            </template>

            <!-- Success + QR Code -->
            <template v-else>
              <div class="text-center space-y-3 sm:space-y-4">
                <div class="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 border border-green-400/30 rounded-full">
                  <span class="text-green-400 text-lg sm:text-2xl">✓</span>
                </div>
                <p class="text-green-400 text-xs sm:text-sm">{{ walkinMessage }}</p>

                <div v-if="walkinQrDataUrl" class="inline-block p-2.5 sm:p-4 bg-cream rounded-sm">
                  <img :src="walkinQrDataUrl" alt="Walk-in QR code" class="w-40 h-40 sm:w-52 sm:h-52" />
                </div>

                <div>
                  <p class="text-mist text-[9px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Pass Code</p>
                  <p class="font-display text-xl sm:text-3xl text-gold tracking-widest">{{ walkinPassCode }}</p>
                </div>

                <p class="text-mist text-[9px] sm:text-xs">Show this QR code to the guest. It works for every future visit.</p>

                <button type="button" class="btn-outline w-full" @click="walkinPassCode = ''; walkinQrDataUrl = ''; walkinMessage = ''">
                  Register Another
                </button>
              </div>
            </template>
          </section>
        </template>

        <!-- MEMBERSHIP TAB -->
        <template v-if="activeTab === 'membership'">
          <!-- Summary Cards -->
          <div v-if="paymentsSummary && !paymentsLoading" class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Total</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">{{ paymentsSummary.total }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Pending</p>
              <p class="font-display text-2xl sm:text-3xl text-yellow-400">{{ paymentsSummary.pending }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Approved</p>
              <p class="font-display text-2xl sm:text-3xl text-green-400">{{ paymentsSummary.approved }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Revenue</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">₱{{ paymentsSummary.totalRevenue.toLocaleString() }}</p>
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

            <!-- Filters -->
            <div class="flex gap-1.5 sm:gap-2 mb-4 sm:mb-6 flex-wrap">
              <button
                type="button"
                class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border transition-colors"
                :class="paymentsStatusFilter === '' ? 'border-gold text-gold bg-gold/10' : 'border-iron text-mist hover:border-gold/50'"
                @click="paymentsStatusFilter = ''; loadPayments()"
              >
                All
              </button>
              <button
                type="button"
                class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border transition-colors"
                :class="paymentsStatusFilter === 'pending' ? 'border-yellow-400 text-yellow-400 bg-yellow-400/10' : 'border-iron text-mist hover:border-yellow-400/50'"
                @click="paymentsStatusFilter = 'pending'; loadPayments()"
              >
                Pending
              </button>
              <button
                type="button"
                class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border transition-colors"
                :class="paymentsStatusFilter === 'approved' ? 'border-green-400 text-green-400 bg-green-400/10' : 'border-iron text-mist hover:border-green-400/50'"
                @click="paymentsStatusFilter = 'approved'; loadPayments()"
              >
                Approved
              </button>
              <button
                type="button"
                class="px-2.5 sm:px-3 py-1 text-[9px] sm:text-[10px] uppercase tracking-wider border transition-colors"
                :class="paymentsStatusFilter === 'rejected' ? 'border-red-400 text-red-400 bg-red-400/10' : 'border-iron text-mist hover:border-red-400/50'"
                @click="paymentsStatusFilter = 'rejected'; loadPayments()"
              >
                Rejected
              </button>
            </div>

            <p v-if="paymentsError" class="text-red-400 text-xs sm:text-sm mb-3 sm:mb-4">{{ paymentsError }}</p>

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
              <p class="text-mist text-[10px] sm:text-xs mt-1">Payments submitted from the website will appear here.</p>
            </div>

            <div v-else class="space-y-3 sm:space-y-4">
              <div
                v-for="payment in paymentsList"
                :key="payment.id"
                class="border border-iron rounded-sm overflow-hidden"
              >
                <!-- Payment Header -->
                <div class="flex items-center justify-between gap-3 p-3 sm:p-4 bg-graphite/50">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
                      <span class="text-gold font-display text-sm sm:text-base">{{ payment.fullName.charAt(0) }}</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-cream font-medium text-sm sm:text-base truncate">{{ payment.fullName }}</p>
                      <p class="text-mist text-[10px] sm:text-xs">{{ payment.phone }} · {{ payment.email }}</p>
                    </div>
                  </div>
                  <span
                    class="text-[9px] sm:text-[10px] uppercase tracking-wider px-2 sm:px-2.5 py-0.5 sm:py-1 shrink-0 font-medium"
                    :class="payment.status === 'approved' ? 'text-green-400 bg-green-400/10 border border-green-400/30' : payment.status === 'rejected' ? 'text-red-400 bg-red-400/10 border border-red-400/30' : 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/30'"
                  >
                    {{ payment.status }}
                  </span>
                </div>

                <!-- Payment Body -->
                <div class="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-[10px] sm:text-xs">
                    <div>
                      <span class="text-mist block">Plan</span>
                      <span class="text-cream font-medium uppercase">{{ payment.plan }}</span>
                    </div>
                    <div>
                      <span class="text-mist block">Amount</span>
                      <span class="text-gold font-display text-base sm:text-lg">₱{{ payment.amount.toLocaleString() }}</span>
                    </div>
                    <div>
                      <span class="text-mist block">Coach</span>
                      <span class="text-cream font-medium">{{ payment.coach ?? 'No preference' }}</span>
                    </div>
                    <div>
                      <span class="text-mist block">Payment</span>
                      <span class="text-cream font-medium uppercase">{{ payment.paymentMethod }}</span>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-2 sm:gap-3 text-[10px] sm:text-xs">
                    <div>
                      <span class="text-mist block">Reference No.</span>
                      <span class="text-cream font-medium">{{ payment.referenceNo ?? '—' }}</span>
                    </div>
                    <div>
                      <span class="text-mist block">Expiry</span>
                      <span class="text-cream font-medium">{{ payment.expiryDate ?? '—' }}</span>
                    </div>
                  </div>

                  <div class="text-[9px] sm:text-[10px] text-mist pt-1 border-t border-iron/50">
                    Submitted: {{ new Date(payment.createdAt).toLocaleString() }}
                  </div>

                  <!-- Actions -->
                  <div class="flex gap-2 pt-1">
                    <button
                      v-if="payment.receiptUrl"
                      type="button"
                      class="btn-outline flex-1 text-[10px] sm:text-xs py-1.5 sm:py-2"
                      @click="openReceiptModal(payment.receiptUrl, payment.fullName)"
                    >
                      View Receipt
                    </button>
                    <template v-if="payment.status === 'pending'">
                      <button
                        type="button"
                        class="btn-primary flex-1 text-[10px] sm:text-xs py-1.5 sm:py-2"
                        :disabled="paymentActionLoading === payment.id"
                        @click="updatePaymentStatus(payment.id, 'approved')"
                      >
                        {{ paymentActionLoading === payment.id ? 'Processing…' : 'Approve' }}
                      </button>
                      <button
                        type="button"
                        class="btn-outline flex-1 text-[10px] sm:text-xs py-1.5 sm:py-2 text-red-400 border-red-400/30 hover:border-red-400/50"
                        :disabled="paymentActionLoading === payment.id"
                        @click="updatePaymentStatus(payment.id, 'rejected')"
                    >
                      Reject
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
                <img v-else-if="receiptModalUrl" :src="receiptModalUrl" alt="Payment receipt" class="w-full rounded-sm" />
              </div>
            </div>
          </div>
        </template>

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
            <p v-if="reminderMessage" class="text-green-400 text-xs sm:text-sm mt-3">{{ reminderMessage }}</p>
            <p v-if="reminderError" class="text-red-400 text-xs sm:text-sm mt-3">{{ reminderError }}</p>
          </section>

          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Reports & Analytics</h2>

            <div class="flex gap-1.5 sm:gap-2 mb-4 sm:mb-6 flex-wrap">
              <button
                type="button"
                class="px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                :class="reportPeriod === 'day' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:border-gold/50'"
                @click="reportPeriod = 'day'; loadReports()"
              >
                Today
              </button>
              <button
                type="button"
                class="px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                :class="reportPeriod === 'week' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:border-gold/50'"
                @click="reportPeriod = 'week'; loadReports()"
              >
                This Week
              </button>
              <button
                type="button"
                class="px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                :class="reportPeriod === 'month' ? 'border-gold text-gold bg-gold/5' : 'border-iron text-mist hover:border-gold/50'"
                @click="reportPeriod = 'month'; loadReports()"
              >
                This Month
              </button>
              <button v-if="reportData" type="button" class="btn-outline px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs ml-auto" @click="exportReport">
                Export CSV
              </button>
            </div>

            <p v-if="reportError" class="text-red-400 text-xs sm:text-sm mb-3 sm:mb-4">{{ reportError }}</p>

            <div v-if="reportLoading" class="text-center py-10">
              <p class="text-mist text-xs sm:text-sm">Loading report…</p>
            </div>

            <template v-else-if="reportData">
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
                  <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Total Visits</p>
                  <p class="font-display text-2xl sm:text-3xl text-gold">{{ reportData.summary.totalVisits }}</p>
                </div>
                <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
                  <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Checked Out</p>
                  <p class="font-display text-2xl sm:text-3xl text-green-400">{{ reportData.summary.checkedOut }}</p>
                </div>
                <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
                  <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Revenue</p>
                  <p class="font-display text-2xl sm:text-3xl text-gold">₱{{ reportData.summary.totalRevenue.toLocaleString() }}</p>
                </div>
                <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
                  <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Unique Members</p>
                  <p class="font-display text-2xl sm:text-3xl text-gold">{{ reportData.summary.uniqueMembers }}</p>
                </div>
              </div>

              <p class="text-mist text-[10px] sm:text-xs mb-3 sm:mb-4">
                {{ reportPeriod === 'day' ? 'Today' : reportPeriod === 'week' ? 'This Week' : 'This Month' }}: <span class="text-cream font-medium">{{ reportData.summary.dateFrom }}</span> — <span class="text-cream font-medium">{{ reportData.summary.dateTo }}</span>
              </p>

              <div v-if="reportData.chartData.length > 0 && reportData.chartData.some(p => p.visits > 0)" class="mb-4 sm:mb-6">
                <h3 class="font-display text-base sm:text-lg text-cream tracking-wide mb-3 sm:mb-4">
                  {{ reportPeriod === 'day' ? 'Today' : reportPeriod === 'week' ? 'This Week' : 'This Month' }} — Revenue
                </h3>
                <div class="overflow-x-auto">
                  <div class="flex items-end gap-1 sm:gap-1.5 min-h-[160px] sm:min-h-[200px] px-2 pb-8">
                    <div
                      v-for="point in reportData.chartData"
                      :key="point.date"
                      class="flex-1 flex flex-col items-center gap-1 min-w-[28px] sm:min-w-[36px]"
                    >
                      <span v-if="point.revenue > 0" class="text-[8px] sm:text-[10px] text-gold font-semibold">₱{{ point.revenue }}</span>
                      <div
                        class="w-full rounded-t transition-all"
                        :class="point.revenue > 0 ? 'bg-gold' : 'bg-iron/30'"
                        :style="{ height: point.revenue > 0 ? `${Math.max((point.revenue / maxRevenue) * 100, 12)}%` : '4px' }"
                      />
                      <span class="text-[8px] sm:text-[10px] text-mist font-medium">{{ point.label }}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 mt-1 justify-center">
                    <div class="w-3 h-3 bg-gold rounded-sm" />
                    <span class="text-[9px] sm:text-[10px] text-mist">Revenue (₱65/check-out)</span>
                  </div>
                </div>
              </div>

              <div v-if="reportData.visits.length > 0">
                <h3 class="font-display text-base sm:text-lg text-cream tracking-wide mb-3 sm:mb-4">
                  Visit Log <span class="text-mist text-xs sm:text-sm font-body">({{ reportData.visits.length }} total)</span>
                </h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-[10px] sm:text-xs min-w-[450px]">
                    <thead>
                      <tr class="border-b border-iron">
                        <th class="text-left p-2 sm:p-3 text-gold font-display tracking-wide">Date</th>
                        <th class="text-left p-2 sm:p-3 text-gold font-display tracking-wide">Name</th>
                        <th class="text-left p-2 sm:p-3 text-gold font-display tracking-wide">Pass Code</th>
                        <th class="text-right p-2 sm:p-3 text-gold font-display tracking-wide">Amount</th>
                        <th class="text-left p-2 sm:p-3 text-gold font-display tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="v in reportData.visits.slice(0, visitLogLimit)" :key="v.id" class="border-b border-iron/50 last:border-0">
                        <td class="p-2 sm:p-3 text-cream whitespace-nowrap">{{ v.visitDate }}</td>
                        <td class="p-2 sm:p-3 text-cream">{{ v.fullName }}</td>
                        <td class="p-2 sm:p-3 text-gold font-display tracking-wider">{{ v.passCode }}</td>
                        <td class="p-2 sm:p-3 text-cream text-right">{{ v.paymentAmount ? `₱${v.paymentAmount}` : '—' }}</td>
                        <td class="p-2 sm:p-3">
                          <span :class="statusClass(v.status)">{{ statusLabel(v.status) }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-if="reportData.visits.length > visitLogLimit" class="text-center mt-3">
                  <button type="button" class="text-gold text-[11px] sm:text-xs uppercase tracking-wider hover:underline" @click="visitLogLimit += 5">
                    Show More ({{ reportData.visits.length - visitLogLimit }} remaining)
                  </button>
                </div>
                <div v-if="visitLogLimit > 5 && reportData.visits.length > 5" class="text-center mt-2">
                  <button type="button" class="text-mist text-[10px] sm:text-[11px] uppercase tracking-wider hover:text-cream" @click="visitLogLimit = 5">
                    Show Less
                  </button>
                </div>
              </div>

              <div v-else class="text-center py-6">
                <p class="text-mist text-xs sm:text-sm">No visits found for this period.</p>
              </div>
            </template>

            <div v-else class="text-center py-10">
              <p class="text-mist text-xs sm:text-sm">Select a period above to view the report.</p>
            </div>
          </section>
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
                <label for="coach-photo" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Photo URL</label>
                <input id="coach-photo" v-model="coachForm.photoUrl" type="url" class="input-field" placeholder="https://example.com/photo.jpg" />
              </div>

              <p v-if="coachError" class="text-red-400 text-xs sm:text-sm">{{ coachError }}</p>
              <p v-if="coachSuccess" class="text-green-400 text-xs sm:text-sm">{{ coachSuccess }}</p>

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
                      class="text-red-400 hover:text-red-300 text-[10px] sm:text-xs uppercase tracking-wider transition-colors"
                      @click="deleteCoach(coach.id, coach.fullName)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </section>
        </template>

        <!-- MANAGEMENT TAB -->
        <template v-if="activeTab === 'management'">
          <!-- Summary Cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Total Clients</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">{{ clientsList.length }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Active</p>
              <p class="font-display text-2xl sm:text-3xl text-green-400">{{ clientsList.filter(c => c.status === 'active').length }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Completed</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">{{ clientsList.filter(c => c.status === 'completed').length }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Coaches</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">{{ coachesList.length }}</p>
            </div>
          </div>

          <!-- Add Client Form -->
          <section class="card p-4 sm:p-6 mb-4 sm:mb-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Add New Client</h2>
            <form class="space-y-3 sm:space-y-4" @submit.prevent="addClient">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label for="ci-name" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Client Name *</label>
                  <input id="ci-name" v-model="clientForm.clientName" type="text" class="input-field" maxlength="100" placeholder="Full name" />
                </div>
                <div>
                  <label for="ci-phone" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Phone *</label>
                  <input id="ci-phone" v-model="clientForm.clientPhone" type="tel" class="input-field" maxlength="11" placeholder="09XXXXXXXXX" />
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label for="ci-email" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Email *</label>
                  <input id="ci-email" v-model="clientForm.clientEmail" type="email" class="input-field" placeholder="client@email.com" />
                </div>
                <div>
                  <label for="ci-coach" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Assigned Coach</label>
                  <select id="ci-coach" v-model="clientForm.coachName" class="input-field">
                    <option value="">No coach</option>
                    <option v-for="c in coachesList" :key="c.id" :value="c.fullName">{{ c.fullName }}</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="block text-[11px] sm:text-sm text-mist mb-1.5 sm:mb-2">Plan *</label>
                <div class="flex gap-3 sm:gap-4">
                  <label class="flex items-center gap-2 cursor-pointer p-2.5 sm:p-3 border border-iron hover:border-gold/50 transition-colors flex-1 text-center" :class="clientForm.plan === 'weekly' ? 'border-gold bg-gold/5' : ''">
                    <input type="radio" v-model="clientForm.plan" value="weekly" class="accent-gold" />
                    <div>
                      <span class="text-cream text-[11px] sm:text-sm font-medium block">Weekly</span>
                      <span class="text-mist text-[9px] sm:text-[10px]">4 sessions</span>
                    </div>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer p-2.5 sm:p-3 border border-iron hover:border-gold/50 transition-colors flex-1 text-center" :class="clientForm.plan === 'monthly' ? 'border-gold bg-gold/5' : ''">
                    <input type="radio" v-model="clientForm.plan" value="monthly" class="accent-gold" />
                    <div>
                      <span class="text-cream text-[11px] sm:text-sm font-medium block">Monthly</span>
                      <span class="text-mist text-[9px] sm:text-[10px]">13 sessions</span>
                    </div>
                  </label>
                </div>
              </div>

              <p v-if="clientError" class="text-red-400 text-xs sm:text-sm">{{ clientError }}</p>
              <p v-if="clientSuccess" class="text-green-400 text-xs sm:text-sm">{{ clientSuccess }}</p>

              <button type="submit" class="btn-primary w-full" :disabled="clientLoading">
                {{ clientLoading ? 'Adding…' : 'Add Client' }}
              </button>
            </form>
          </section>

          <!-- Client Cards with Coach Filter -->
          <section class="card p-4 sm:p-6">
            <div class="flex flex-col gap-3 mb-4 sm:mb-6">
              <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide">
                Client List
              </h2>
              <div class="flex gap-1.5 sm:gap-2 flex-wrap">
                <button
                  type="button"
                  class="px-2.5 sm:px-3 py-1.5 text-[9px] sm:text-[10px] uppercase tracking-wider border transition-colors"
                  :class="clientCoachFilter === '' ? 'border-gold text-gold bg-gold/10' : 'border-iron text-mist hover:border-gold/50'"
                  @click="clientCoachFilter = ''"
                >
                  All ({{ clientsList.length }})
                </button>
                <button
                  v-for="coach in coachesList"
                  :key="coach.id"
                  type="button"
                  class="px-2.5 sm:px-3 py-1.5 text-[9px] sm:text-[10px] uppercase tracking-wider border transition-colors"
                  :class="clientCoachFilter === coach.fullName ? 'border-gold text-gold bg-gold/10' : 'border-iron text-mist hover:border-gold/50'"
                  @click="clientCoachFilter = coach.fullName"
                >
                  {{ coach.fullName }} ({{ clientsList.filter(c => c.coach_name === coach.fullName).length }})
                </button>
              </div>
            </div>

            <div v-if="clientsList.length === 0" class="text-center py-8">
              <p class="text-mist text-xs sm:text-sm">No clients yet. Add your first client above.</p>
            </div>

            <div v-else-if="filteredClients.length === 0" class="text-center py-8">
              <p class="text-mist text-xs sm:text-sm">No clients found for this coach.</p>
            </div>

            <div v-else class="space-y-3 sm:space-y-4">
              <div
                v-for="client in filteredClients"
                :key="client.id"
                class="border border-iron rounded-sm overflow-hidden transition-colors hover:border-gold/30"
              >
                <!-- Client Header -->
                <div class="flex items-center justify-between gap-3 p-3 sm:p-4 bg-graphite/50">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
                      <span class="text-gold font-display text-sm sm:text-base">{{ client.client_name.charAt(0) }}</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-cream font-medium text-sm sm:text-base truncate">{{ client.client_name }}</p>
                      <p class="text-mist text-[10px] sm:text-xs">{{ client.client_phone }} · {{ client.client_email }}</p>
                    </div>
                  </div>
                  <span
                    class="text-[9px] sm:text-[10px] uppercase tracking-wider px-2 sm:px-2.5 py-0.5 sm:py-1 shrink-0 font-medium"
                    :class="client.status === 'active' ? 'text-gold bg-gold/10 border border-gold/30' : client.status === 'completed' ? 'text-green-400 bg-green-400/10 border border-green-400/30' : 'text-red-400 bg-red-400/10 border border-red-400/30'"
                  >
                    {{ client.status }}
                  </span>
                </div>

                <!-- Client Body -->
                <div class="p-3 sm:p-4 space-y-3">
                  <!-- Plan + Coach Info -->
                  <div class="flex items-center gap-3 text-[10px] sm:text-xs">
                    <span class="px-1.5 sm:px-2 py-0.5 bg-gold/10 text-gold border border-gold/20 uppercase font-medium">{{ client.plan }}</span>
                    <span v-if="client.coach_name" class="text-mist">Coach: <span class="text-cream">{{ client.coach_name }}</span></span>
                    <span v-else class="text-mist italic">No coach assigned</span>
                  </div>

                  <!-- Session Progress -->
                  <div>
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="text-mist text-[10px] sm:text-xs">Session Progress</span>
                      <span class="text-cream text-[10px] sm:text-xs font-medium">{{ client.sessions_used }} / {{ client.total_sessions }}</span>
                    </div>
                    <div class="w-full bg-iron/50 h-2 sm:h-2.5 rounded-full overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all duration-500"
                        :class="client.sessions_used >= client.total_sessions ? 'bg-green-400' : client.sessions_used > 0 ? 'bg-gold' : 'bg-iron'"
                        :style="{ width: `${Math.max((client.sessions_used / client.total_sessions) * 100, 2)}%` }"
                      />
                    </div>
                  </div>

                  <!-- Session Dots -->
                  <div class="flex flex-wrap gap-1.5">
                    <div
                      v-for="s in client.total_sessions"
                      :key="s"
                      class="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-[9px] sm:text-[10px] font-semibold border transition-colors"
                      :class="s <= client.sessions_used ? 'bg-gold text-onyx border-gold' : 'bg-graphite text-mist border-iron'"
                    >
                      {{ s }}
                    </div>
                  </div>

                  <!-- Date Range -->
                  <div class="flex items-center justify-between text-[9px] sm:text-[10px] text-mist pt-1 border-t border-iron/50">
                    <span>Start: <span class="text-cream">{{ client.start_date }}</span></span>
                    <span>End: <span class="text-cream">{{ client.end_date }}</span></span>
                  </div>

                  <!-- Actions -->
                  <div class="flex gap-2 pt-1">
                    <button
                      v-if="client.status === 'active' && client.sessions_used < client.total_sessions"
                      type="button"
                      class="btn-primary flex-1 text-[10px] sm:text-xs py-1.5 sm:py-2"
                      @click="toggleSession(client.id, 'add_session')"
                    >
                      + Complete Session
                    </button>
                    <button
                      v-if="client.sessions_used > 0"
                      type="button"
                      class="btn-outline flex-1 text-[10px] sm:text-xs py-1.5 sm:py-2"
                      @click="toggleSession(client.id, 'remove_session')"
                    >
                      − Undo Session
                    </button>
                    <button
                      type="button"
                      class="text-red-400 hover:text-red-300 text-[10px] sm:text-xs uppercase tracking-wider px-2 sm:px-3 py-1.5 border border-red-400/30 hover:border-red-400/50 transition-colors"
                      @click="deleteClient(client.id, client.client_name)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>

        <!-- LEADERBOARD TAB -->
        <template v-if="activeTab === 'leaderboard'">
          <!-- Stats Cards -->
          <div v-if="leaderboardStats && !leaderboardLoading" class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Top Guest</p>
              <p class="font-display text-lg sm:text-xl text-gold truncate">{{ leaderboardStats.topGuestName ?? '—' }}</p>
              <p v-if="leaderboardStats.topGuestPoints > 0" class="text-cream text-[10px] sm:text-xs mt-0.5">{{ leaderboardStats.topGuestPoints }} pts</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Ranked Guests</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">{{ leaderboardStats.totalGuests }}</p>
            </div>
            <div class="bg-graphite border border-iron p-3 sm:p-4 text-center col-span-2 sm:col-span-1">
              <p class="text-mist text-[10px] sm:text-xs uppercase tracking-wider mb-1">Total Points Given</p>
              <p class="font-display text-2xl sm:text-3xl text-gold">{{ leaderboardStats.totalPointsAwarded }}</p>
            </div>
          </div>

          <section class="card p-4 sm:p-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
              <div>
                <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide">Leaderboard</h2>
                <p class="text-mist text-[10px] sm:text-xs mt-0.5">Walk-in guests ranked by total points (2.5 pts per check-out)</p>
              </div>
              <div class="flex gap-2 items-center">
                <input
                  v-model="leaderboardSearch"
                  type="text"
                  class="input-field text-[10px] sm:text-xs px-3 py-1.5 w-36 sm:w-44"
                  placeholder="Search name or code…"
                />
                <button
                  type="button"
                  class="btn-outline text-[10px] sm:text-xs px-3 py-1.5 shrink-0"
                  :disabled="leaderboardLoading"
                  @click="loadLeaderboard()"
                >
                  {{ leaderboardLoading ? 'Loading…' : 'Refresh' }}
                </button>
              </div>
            </div>

            <p v-if="leaderboardError" class="text-red-400 text-xs sm:text-sm mb-3 sm:mb-4">{{ leaderboardError }}</p>

            <div v-if="leaderboardLoading" class="text-center py-12">
              <div class="inline-flex items-center gap-2 text-mist text-xs sm:text-sm">
                <svg class="animate-spin h-4 w-4 text-gold" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading leaderboard…
              </div>
            </div>

            <div v-else-if="filteredLeaderboard.length === 0" class="text-center py-12">
              <div class="text-4xl sm:text-5xl mb-3">🏆</div>
              <p class="text-cream text-sm sm:text-base font-medium">{{ leaderboardSearch ? 'No matching guests found.' : 'No guests with points yet.' }}</p>
              <p class="text-mist text-[10px] sm:text-xs mt-1">{{ leaderboardSearch ? 'Try a different search term.' : 'Points are awarded when staff check out a walk-in guest.' }}</p>
            </div>

            <div v-else class="space-y-3 sm:space-y-4">
              <!-- Top 3 Podium -->
              <div v-if="!leaderboardSearch && filteredLeaderboard.length >= 1" class="flex items-end justify-center gap-2 sm:gap-4 mb-4 sm:mb-8 px-2">
                <!-- 2nd Place -->
                <div v-if="filteredLeaderboard.length >= 2" class="flex-1 max-w-[120px] text-center">
                  <div class="relative mx-auto mb-2">
                    <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full bg-graphite border-2 border-mist/40 flex items-center justify-center">
                      <span class="text-2xl sm:text-3xl">🥈</span>
                    </div>
                  </div>
                  <div class="bg-graphite border border-iron p-2 sm:p-3 rounded-t-lg">
                    <p class="text-cream text-[11px] sm:text-sm font-medium truncate">{{ filteredLeaderboard[1].fullName }}</p>
                    <p class="text-mist text-[9px] sm:text-[10px]">{{ filteredLeaderboard[1].totalVisits }} visits</p>
                    <p class="text-gold font-display text-base sm:text-lg mt-0.5">{{ filteredLeaderboard[1].points }} pts</p>
                  </div>
                  <div class="bg-mist/20 h-6 sm:h-8 rounded-b-lg flex items-center justify-center">
                    <span class="text-mist font-display text-sm sm:text-base">2</span>
                  </div>
                </div>

                <!-- 1st Place -->
                <div class="flex-1 max-w-[140px] text-center">
                  <div class="relative mx-auto mb-2">
                    <div class="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full bg-gold/10 border-2 border-gold flex items-center justify-center shadow-lg shadow-gold/20">
                      <span class="text-3xl sm:text-4xl">🥇</span>
                    </div>
                  </div>
                  <div class="bg-graphite border-2 border-gold p-3 sm:p-4 rounded-t-lg">
                    <p class="text-cream text-xs sm:text-sm font-semibold truncate">{{ filteredLeaderboard[0].fullName }}</p>
                    <p class="text-mist text-[9px] sm:text-[10px]">{{ filteredLeaderboard[0].totalVisits }} visits</p>
                    <p class="text-gold font-display text-xl sm:text-2xl mt-0.5">{{ filteredLeaderboard[0].points }} pts</p>
                  </div>
                  <div class="bg-gold/20 h-8 sm:h-10 rounded-b-lg flex items-center justify-center">
                    <span class="text-gold font-display text-base sm:text-lg font-semibold">1</span>
                  </div>
                </div>

                <!-- 3rd Place -->
                <div v-if="filteredLeaderboard.length >= 3" class="flex-1 max-w-[120px] text-center">
                  <div class="relative mx-auto mb-2">
                    <div class="w-14 h-14 sm:w-18 sm:h-18 mx-auto rounded-full bg-graphite border-2 border-amber-700/40 flex items-center justify-center">
                      <span class="text-xl sm:text-2xl">🥉</span>
                    </div>
                  </div>
                  <div class="bg-graphite border border-iron p-2 sm:p-3 rounded-t-lg">
                    <p class="text-cream text-[11px] sm:text-sm font-medium truncate">{{ filteredLeaderboard[2].fullName }}</p>
                    <p class="text-mist text-[9px] sm:text-[10px]">{{ filteredLeaderboard[2].totalVisits }} visits</p>
                    <p class="text-gold font-display text-base sm:text-lg mt-0.5">{{ filteredLeaderboard[2].points }} pts</p>
                  </div>
                  <div class="bg-amber-900/20 h-5 sm:h-6 rounded-b-lg flex items-center justify-center">
                    <span class="text-amber-600 font-display text-sm sm:text-base">3</span>
                  </div>
                </div>
              </div>

              <!-- Remaining List -->
              <div v-if="filteredLeaderboard.length > 3 || leaderboardSearch" class="space-y-1.5 sm:space-y-2">
                <div
                  v-for="entry in leaderboardSearch ? filteredLeaderboard : filteredLeaderboard.slice(3)"
                  :key="entry.id"
                  class="flex items-center gap-3 sm:gap-4 bg-graphite border border-iron p-3 sm:p-4 hover:border-gold/30 transition-colors"
                >
                  <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-iron/50 flex items-center justify-center shrink-0">
                    <span class="text-mist text-xs sm:text-sm font-display">{{ rankBadge(entry.rank) }}</span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-cream text-sm sm:text-base font-medium truncate">{{ entry.fullName }}</p>
                    <p class="text-mist text-[9px] sm:text-[10px]">{{ entry.totalVisits }} visits · {{ entry.passCode }}</p>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="text-gold font-display text-lg sm:text-xl">{{ entry.points }}</p>
                    <p class="text-mist text-[8px] sm:text-[10px] uppercase tracking-wider">pts</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </main>
  </div>
</template>

<style>
#qr-reader video {
  border-radius: 2px;
  width: 100%;
  max-width: 100%;
}
#qr-reader__scan_region {
  min-height: 200px;
}
#qr-reader {
  width: 100%;
  overflow: hidden;
}
@media (max-width: 380px) {
  .font-display {
    letter-spacing: 0.05em;
  }
}
</style>
