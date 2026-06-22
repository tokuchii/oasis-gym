<script setup lang="ts">
import { Html5QrcodeScanner } from 'html5-qrcode'

useHead({ title: 'Staff Check-in — OASIS FITNESS GYM' })

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

const authenticated = ref(false)
const checkingSession = ref(true)
const loginPassword = ref('')
const loginError = ref('')
const loginSubmitting = ref(false)

const searchMode = ref<'code' | 'phone' | 'name'>('code')
const searchQuery = ref('')
const searchResults = ref<PassResult[]>([])
const searchLoading = ref(false)
const searchError = ref('')

const selectedPass = ref<PassResult | null>(null)
const checkinLoading = ref(false)
const checkinMessage = ref('')
const checkinError = ref('')

const scannerRef = ref<HTMLElement | null>(null)
let scanner: Html5QrcodeScanner | null = null

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
    await nextTick()
    initScanner()
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
  searchResults.value = []
  selectedPass.value = null
  searchQuery.value = ''
  searchError.value = ''
  checkinMessage.value = ''
  checkinError.value = ''
}

function destroyScanner() {
  if (scanner) {
    scanner.clear().catch(() => {})
    scanner = null
  }
}

function initScanner() {
  if (!scannerRef.value || scanner) return

  scanner = new Html5QrcodeScanner(
    'qr-reader',
    { fps: 10, qrbox: { width: 250, height: 250 } },
    false,
  )

  scanner.render(
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
      searchError.value = 'No passes found for today.'
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
}

async function checkIn(passCode: string) {
  checkinLoading.value = true
  checkinMessage.value = ''
  checkinError.value = ''

  try {
    const data = await $fetch<{ pass: PassResult; message: string }>('/api/walkin/checkin', {
      method: 'POST',
      body: { passCode },
    })
    checkinMessage.value = data.message
    selectedPass.value = data.pass
    await runSearch()
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    checkinError.value = fetchErr.data?.statusMessage ?? 'Check-in failed.'
  } finally {
    checkinLoading.value = false
  }
}

function statusLabel(status: PassResult['status']) {
  if (status === 'registered') return 'Registered'
  if (status === 'checked_in') return 'Checked in'
  return 'Expired'
}

function statusClass(status: PassResult['status']) {
  if (status === 'registered') return 'text-gold'
  if (status === 'checked_in') return 'text-green-400'
  return 'text-red-400'
}

onMounted(async () => {
  await checkSession()
  if (authenticated.value) {
    await nextTick()
    initScanner()
  }
})

onUnmounted(() => {
  destroyScanner()
})
</script>

<template>
  <div class="min-h-screen bg-onyx text-cream font-body">
    <header class="border-b border-iron bg-obsidian/80 backdrop-blur-md sticky top-0 z-10">
      <div class="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <p class="font-display text-2xl text-gold tracking-widest">OASIS<span class="text-cream">FIT</span></p>
          <p class="text-mist text-xs uppercase tracking-wider">Staff Check-in</p>
        </div>
        <button
          v-if="authenticated"
          type="button"
          class="text-sm text-mist hover:text-gold transition-colors"
          @click="logout"
        >
          Log out
        </button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-8">
      <div v-if="checkingSession" class="text-center text-mist py-20">Loading…</div>

      <!-- Login -->
      <div v-else-if="!authenticated" class="card p-8 max-w-md mx-auto">
        <h1 class="font-display text-3xl text-cream tracking-wide mb-2">Staff Login</h1>
        <p class="text-mist text-sm mb-6">Enter the staff password to access check-in.</p>
        <form class="space-y-4" @submit.prevent="login">
          <div>
            <label for="staff-password" class="block text-sm text-mist mb-1">Password</label>
            <input
              id="staff-password"
              v-model="loginPassword"
              type="password"
              class="input-field"
              autocomplete="current-password"
            />
          </div>
          <p v-if="loginError" class="text-red-400 text-sm">{{ loginError }}</p>
          <button type="submit" class="btn-primary w-full" :disabled="loginSubmitting">
            {{ loginSubmitting ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>
      </div>

      <!-- Dashboard -->
      <div v-else class="space-y-8">
        <!-- QR Scanner -->
        <section class="card p-6">
          <h2 class="font-display text-xl text-cream tracking-wide mb-4">Scan QR Code</h2>
          <div ref="scannerRef">
            <div id="qr-reader" class="overflow-hidden rounded-sm" />
          </div>
        </section>

        <!-- Search -->
        <section class="card p-6">
          <h2 class="font-display text-xl text-cream tracking-wide mb-4">Search Pass</h2>
          <div class="flex gap-2 mb-4">
            <button
              type="button"
              class="px-3 py-1 text-xs uppercase tracking-wider border transition-colors"
              :class="searchMode === 'code' ? 'border-gold text-gold' : 'border-iron text-mist'"
              @click="searchMode = 'code'"
            >
              Code
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs uppercase tracking-wider border transition-colors"
              :class="searchMode === 'phone' ? 'border-gold text-gold' : 'border-iron text-mist'"
              @click="searchMode = 'phone'"
            >
              Phone
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs uppercase tracking-wider border transition-colors"
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
              class="input-field flex-1"
              :placeholder="searchMode === 'code' ? 'OASIS-XXXXXX' : searchMode === 'phone' ? 'Phone number' : 'Guest name'"
            />
            <button type="submit" class="btn-primary shrink-0" :disabled="searchLoading">
              {{ searchLoading ? '…' : 'Search' }}
            </button>
          </form>
          <p v-if="searchError" class="text-red-400 text-sm mt-3">{{ searchError }}</p>

          <ul v-if="searchResults.length" class="mt-4 space-y-2">
            <li
              v-for="pass in searchResults"
              :key="pass.id"
              class="border border-iron p-4 cursor-pointer hover:border-gold/50 transition-colors"
              :class="selectedPass?.id === pass.id ? 'border-gold' : ''"
              @click="selectPass(pass)"
            >
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-cream font-medium">{{ pass.fullName }}</p>
                  <p class="text-mist text-sm">{{ pass.passCode }} · {{ pass.phone }}</p>
                </div>
                <span class="text-xs uppercase tracking-wider" :class="statusClass(pass.status)">
                  {{ statusLabel(pass.status) }}
                </span>
              </div>
            </li>
          </ul>
        </section>

        <!-- Check-in panel -->
        <section v-if="selectedPass" class="card p-6">
          <h2 class="font-display text-xl text-cream tracking-wide mb-4">Pass Details</h2>
          <dl class="space-y-2 text-sm mb-6">
            <div class="flex justify-between gap-4">
              <dt class="text-mist">Name</dt>
              <dd class="text-cream text-right">{{ selectedPass.fullName }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-mist">Pass code</dt>
              <dd class="text-gold font-display text-lg tracking-wider">{{ selectedPass.passCode }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-mist">Phone</dt>
              <dd class="text-cream text-right">{{ selectedPass.phone }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-mist">Email</dt>
              <dd class="text-cream text-right">{{ selectedPass.email }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-mist">Emergency</dt>
              <dd class="text-cream text-right">{{ selectedPass.emergencyContact }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-mist">Visit date</dt>
              <dd class="text-cream text-right">{{ selectedPass.visitDate }}</dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-mist">Status</dt>
              <dd :class="statusClass(selectedPass.status)">{{ statusLabel(selectedPass.status) }}</dd>
            </div>
          </dl>

          <button
            v-if="selectedPass.status === 'registered'"
            type="button"
            class="btn-primary w-full"
            :disabled="checkinLoading"
            @click="checkIn(selectedPass.passCode)"
          >
            {{ checkinLoading ? 'Checking in…' : 'Check In Guest' }}
          </button>
          <p v-else-if="selectedPass.status === 'checked_in'" class="text-green-400 text-sm text-center">
            Already checked in{{ selectedPass.checkedInAt ? ` at ${new Date(selectedPass.checkedInAt).toLocaleTimeString()}` : '' }}.
          </p>
          <p v-else class="text-red-400 text-sm text-center">This pass has expired.</p>

          <p v-if="checkinMessage" class="text-green-400 text-sm text-center mt-4">{{ checkinMessage }}</p>
          <p v-if="checkinError" class="text-red-400 text-sm text-center mt-4">{{ checkinError }}</p>
        </section>
      </div>
    </main>
  </div>
</template>

<style>
#qr-reader img[alt='Info icon'] {
  display: none;
}
#qr-reader__dashboard_section_csr button {
  background-color: #c9a84c !important;
  color: #0a0a0a !important;
  border: none !important;
  font-family: Outfit, sans-serif !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
  font-size: 0.75rem !important;
}
</style>
