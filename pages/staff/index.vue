<script setup lang="ts">
import { Html5Qrcode } from 'html5-qrcode'
import { WALKIN_DEFAULT_FEE } from '~/types/walkin'

useHead({ title: 'Staff Dashboard — OASIS FITNESS GYM' })

interface PassResult {
  id: string
  passCode: string
  fullName: string
  email: string
  phone: string
  emergencyContact: string
  visitDate: string
  status: 'registered' | 'checked_in' | 'expired'
  createdAt: string
  checkedInAt: string | null
  checkedInBy: string | null
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
  visits: number
  checkedOut: number
  revenue: number
}

const authenticated = ref(false)
const checkingSession = ref(true)
const loginPassword = ref('')
const loginError = ref('')
const loginSubmitting = ref(false)

const activeTab = ref<'checkout' | 'walkin' | 'reports' | 'coaches'>('checkout')

const walkinForm = reactive({
  fullName: '',
  email: '',
  phone: '',
  emergencyContact: '',
})
const walkinSubmitting = ref(false)
const walkinMessage = ref('')
const walkinError = ref('')

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
const reportStartDate = ref('')
const reportEndDate = ref('')
const reportLoading = ref(false)
const reportError = ref('')
const reportData = ref<{ visits: ReportVisit[]; summary: ReportSummary; chartData: ChartPoint[] } | null>(null)

const coachesList = ref<CoachItem[]>([])
const coachLoading = ref(false)
const coachError = ref('')
const coachSuccess = ref('')
const coachForm = reactive({
  fullName: '',
  specialty: '',
  bio: '',
  photoUrl: '',
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

  if (!walkinForm.fullName.trim()) { walkinError.value = 'Full name is required.'; return }
  if (!walkinForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(walkinForm.email)) { walkinError.value = 'Valid email is required.'; return }
  if (!walkinForm.phone.trim()) { walkinError.value = 'Phone number is required.'; return }
  if (!/^(09|\+639)\d{9}$/.test(walkinForm.phone.trim())) { walkinError.value = 'Phone must be a valid Philippine mobile number (09XXXXXXXXX).' ; return }
  if (!walkinForm.emergencyContact.trim()) { walkinError.value = 'Emergency contact is required.'; return }

  walkinSubmitting.value = true
  try {
    const data = await $fetch<{ passCode: string; message: string }>('/api/walkin/register', {
      method: 'POST',
      body: {
        fullName: walkinForm.fullName,
        email: walkinForm.email,
        phone: walkinForm.phone,
        emergencyContact: walkinForm.emergencyContact,
      },
    })
    walkinMessage.value = `${data.message} Pass code: ${data.passCode}`
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

async function loadReports() {
  reportError.value = ''
  reportLoading.value = true
  reportData.value = null

  try {
    const params: Record<string, string> = { period: reportPeriod.value }
    if (reportStartDate.value) params.startDate = reportStartDate.value
    if (reportEndDate.value) params.endDate = reportEndDate.value

    const data = await $fetch<{ visits: ReportVisit[]; summary: ReportSummary; chartData: ChartPoint[] }>('/api/staff/reports', { params })
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
        specialty: coachForm.specialty,
        bio: coachForm.bio,
        photoUrl: coachForm.photoUrl,
      },
    })
    coachSuccess.value = data.message
    coachForm.fullName = ''
    coachForm.specialty = ''
    coachForm.bio = ''
    coachForm.photoUrl = ''
    await loadCoaches()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    coachError.value = fetchErr.data?.statusMessage ?? 'Failed to add coach.'
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

function statusLabel(status: string) {
  if (status === 'registered') return 'Registered'
  if (status === 'checked_in') return 'Checked out'
  return 'Expired'
}

function statusClass(status: string) {
  if (status === 'registered') return 'text-gold'
  if (status === 'checked_in') return 'text-green-400'
  return 'text-red-400'
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
            <p v-else-if="selectedPass.status === 'checked_in'" class="text-green-400 text-xs sm:text-sm text-center">
              Already checked out{{ selectedPass.checkedInAt ? ` at ${new Date(selectedPass.checkedInAt).toLocaleTimeString()}` : '' }}.
            </p>
            <p v-else class="text-red-400 text-xs sm:text-sm text-center">This pass has expired.</p>

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
                  <input id="wi-phone" v-model="walkinForm.phone" type="tel" class="input-field" maxlength="13" placeholder="09XXXXXXXXX" />
                </div>
              </div>
              <div>
                <label for="wi-emergency" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Emergency Contact *</label>
                <input id="wi-emergency" v-model="walkinForm.emergencyContact" type="text" class="input-field" maxlength="100" placeholder="Name & phone number" />
              </div>

              <p v-if="walkinError" class="text-red-400 text-xs sm:text-sm">{{ walkinError }}</p>
              <p v-if="walkinMessage" class="text-green-400 text-xs sm:text-sm">{{ walkinMessage }}</p>

              <button type="submit" class="btn-primary w-full" :disabled="walkinSubmitting">
                {{ walkinSubmitting ? 'Registering…' : 'Register Walk-in' }}
              </button>
            </form>
          </section>
        </template>

        <!-- REPORTS TAB -->
        <template v-if="activeTab === 'reports'">
          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Reports & Analytics</h2>

            <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div class="flex gap-1.5 sm:gap-2">
                <button
                  type="button"
                  class="px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                  :class="reportPeriod === 'day' ? 'border-gold text-gold' : 'border-iron text-mist'"
                  @click="reportPeriod = 'day'"
                >
                  Today
                </button>
                <button
                  type="button"
                  class="px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                  :class="reportPeriod === 'week' ? 'border-gold text-gold' : 'border-iron text-mist'"
                  @click="reportPeriod = 'week'"
                >
                  This Week
                </button>
                <button
                  type="button"
                  class="px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs uppercase tracking-wider border transition-colors"
                  :class="reportPeriod === 'month' ? 'border-gold text-gold' : 'border-iron text-mist'"
                  @click="reportPeriod = 'month'"
                >
                  This Month
                </button>
              </div>
              <div class="flex gap-2">
                <input v-model="reportStartDate" type="date" class="input-field text-[11px] sm:text-sm" />
                <input v-model="reportEndDate" type="date" class="input-field text-[11px] sm:text-sm" />
              </div>
              <button type="button" class="btn-primary shrink-0" :disabled="reportLoading" @click="loadReports">
                {{ reportLoading ? 'Loading…' : 'Load Report' }}
              </button>
            </div>

            <p v-if="reportError" class="text-red-400 text-xs sm:text-sm mb-3 sm:mb-4">{{ reportError }}</p>

            <template v-if="reportData">
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

              <div v-if="reportData.chartData.length > 0" class="mb-4 sm:mb-6">
                <h3 class="font-display text-base sm:text-lg text-cream tracking-wide mb-3 sm:mb-4">Daily Breakdown</h3>
                <div class="overflow-x-auto">
                  <div class="relative min-h-[180px] sm:min-h-[220px] pb-6">
                    <!-- Revenue line chart -->
                    <svg class="w-full h-full" viewBox="0 0 700 200" preserveAspectRatio="none">
                      <!-- Grid lines -->
                      <line v-for="i in 4" :key="'grid-'+i" :x1="0" :y1="i * 45" :x2="700" :y2="i * 45" stroke="#2E2E2E" stroke-width="1" />

                      <!-- Revenue line -->
                      <polyline
                        v-if="maxRevenue > 0"
                        :points="reportData.chartData.map((p, i) => `${(i / Math.max(reportData.chartData.length - 1, 1)) * 680 + 10},${180 - (p.revenue / maxRevenue) * 160}`).join(' ')"
                        fill="none"
                        stroke="#C9A84C"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />

                      <!-- Revenue dots -->
                      <circle
                        v-for="(point, i) in reportData.chartData"
                        :key="'dot-'+i"
                        :cx="(i / Math.max(reportData.chartData.length - 1, 1)) * 680 + 10"
                        :cy="180 - (point.revenue / maxRevenue) * 160"
                        r="4"
                        fill="#C9A84C"
                        :title="`${point.date}: ₱${point.revenue}`"
                      />

                      <!-- Visits bars -->
                      <rect
                        v-for="(point, i) in reportData.chartData"
                        :key="'bar-'+i"
                        :x="(i / Math.max(reportData.chartData.length - 1, 1)) * 680"
                        :y="180 - (point.visits / maxVisits) * 160"
                        :width="Math.max(680 / reportData.chartData.length - 4, 8)"
                        :height="(point.visits / maxVisits) * 160"
                        fill="#C9A84C33"
                        rx="2"
                        :title="`${point.date}: ${point.visits} visits`"
                      />
                    </svg>

                    <!-- X-axis labels -->
                    <div class="flex justify-between px-1 mt-1">
                      <span
                        v-for="point in reportData.chartData"
                        :key="'label-'+point.date"
                        class="text-[7px] sm:text-[9px] text-mist text-center"
                        style="flex: 1;"
                      >
                        {{ point.date.slice(5) }}
                      </span>
                    </div>

                    <!-- Legend -->
                    <div class="flex items-center gap-4 mt-2 justify-center">
                      <div class="flex items-center gap-1.5">
                        <div class="w-3 h-3 bg-gold/30 rounded-sm" />
                        <span class="text-[9px] sm:text-[10px] text-mist">Visits</span>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <div class="w-3 h-0.5 bg-gold rounded" />
                        <span class="text-[9px] sm:text-[10px] text-mist">Revenue</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="reportData.visits.length > 0">
                <h3 class="font-display text-base sm:text-lg text-cream tracking-wide mb-3 sm:mb-4">Visit Log</h3>
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
                      <tr v-for="v in reportData.visits" :key="v.id" class="border-b border-iron/50 last:border-0">
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
              </div>

              <p v-else class="text-mist text-xs sm:text-sm text-center py-6">No visits found for the selected period.</p>
            </template>
          </section>
        </template>

        <!-- COACHES TAB -->
        <template v-if="activeTab === 'coaches'">
          <!-- Add Coach Form -->
          <section class="card p-4 sm:p-6">
            <h2 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-3 sm:mb-4">Add Coach</h2>
            <form class="space-y-3 sm:space-y-4" @submit.prevent="addCoach">
              <div>
                <label for="coach-name" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Full Name *</label>
                <input id="coach-name" v-model="coachForm.fullName" type="text" class="input-field" maxlength="100" placeholder="Coach name" />
              </div>
              <div>
                <label for="coach-specialty" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Specialty</label>
                <input id="coach-specialty" v-model="coachForm.specialty" type="text" class="input-field" maxlength="100" placeholder="e.g. Strength Training, Cardio, Weight Loss" />
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

              <button type="submit" class="btn-primary w-full" :disabled="coachLoading">
                {{ coachLoading ? 'Adding…' : 'Add Coach' }}
              </button>
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
                class="border border-iron p-3 sm:p-4 flex items-center justify-between gap-3"
              >
                <div class="min-w-0">
                  <p class="text-cream font-medium text-sm sm:text-base">{{ coach.fullName }}</p>
                  <p v-if="coach.specialty" class="text-gold text-[11px] sm:text-xs">{{ coach.specialty }}</p>
                  <p v-if="coach.bio" class="text-mist text-[10px] sm:text-xs truncate mt-0.5">{{ coach.bio }}</p>
                </div>
                <button
                  type="button"
                  class="text-red-400 hover:text-red-300 text-[10px] sm:text-xs uppercase tracking-wider shrink-0 transition-colors"
                  @click="deleteCoach(coach.id, coach.fullName)"
                >
                  Remove
                </button>
              </li>
            </ul>
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
}
#qr-reader__scan_region {
  min-height: 200px;
}
</style>
