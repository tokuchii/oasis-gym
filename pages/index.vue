<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { MEMBERSHIP_PLANS, MEMBERSHIP_PLANS_DISPLAY } from '~/types/walkin'
import { extractRefFromReceipt } from '~/composables/useReceiptOcr'
import { useToast } from '~/composables/useToast'
import { getApiBase } from '~/composables/useApiBase'
import { useCachedFetch } from '~/composables/useCachedFetch'
import { generateWalkinQrDataUrl } from '~/composables/useWalkinPass'

const toast = useToast()
const { cachedPost } = useCachedFetch()

function apiUrl(path: string): string {
  const base = getApiBase()
  return base ? `${base}${path}` : path
}

useHead({
  title: 'OASIS FITNESS GYM — Calauan, Laguna',
})

const navLinks = [
  { label: 'About', href: '#about' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Membership', href: '#membership' },
  { label: 'Coaches', href: '#coaches' },
  { label: 'Register', href: '#register' },
  { label: 'Location', href: '#location' },
]

const socials = [
  { name: 'Facebook', href: 'https://facebook.com/XXX', icon: 'facebook' },
  { name: 'Instagram', href: 'https://instagram.com/XXX', icon: 'instagram' },
  { name: 'TikTok', href: 'https://tiktok.com/@XXX', icon: 'tiktok' },
]

const tickerItems = [
  'STRENGTH TRAINING',
  'CARDIO ZONE',
  'FREE WEIGHTS',
  'GROUP CLASSES',
  'PERSONAL COACHING',
  'LOCKER ROOMS',
  'WALK-IN AVAILABLE',
  'OPEN 7 DAYS',
]

const features = [
  { title: 'Premium Equipment', desc: 'Commercial-grade machines and free weights from top brands.' },
  { title: 'Expert Coaches', desc: 'Certified trainers ready to guide your fitness journey.' },
  { title: 'Flexible Plans', desc: 'Daily walk-in, weekly, and monthly options to fit your schedule.' },
  { title: 'Clean & Safe', desc: 'Sanitized daily with spacious training zones.' },
]

const galleryZones = [
  { name: 'Main Floor', desc: 'Strength & functional training' },
  { name: 'Cardio Zone', desc: 'Treadmills, bikes & rowers' },
  { name: 'Free Weights', desc: 'Dumbbells, barbells & racks' },
  { name: 'Group Studio', desc: 'HIIT, yoga & spin classes' },
  { name: 'Locker Room', desc: 'Showers & secure storage' },
  { name: 'Reception', desc: 'Front desk & lounge area' },
]

const membershipPlans = MEMBERSHIP_PLANS
const membershipPlansDisplay = MEMBERSHIP_PLANS_DISPLAY

const operatingHours = [
  { day: 'Monday – Friday', hours: '5:00 AM – 11:00 PM' },
  { day: 'Saturday', hours: '6:00 AM – 10:00 PM' },
  { day: 'Sunday & Holidays', hours: '7:00 AM – 9:00 PM' },
]

const mobileMenuOpen = ref(false)
const showScrollTop = ref(false)
const activeSection = ref('')
const showPromo = ref(false)

onMounted(() => {
  const dismissed = sessionStorage.getItem('promo_dismissed')
  if (!dismissed) {
    setTimeout(() => {
      showPromo.value = true
    }, 1500)
  }
})

function dismissPromo() {
  showPromo.value = false
  sessionStorage.setItem('promo_dismissed', '1')
}

const paymentForm = reactive({
  fullName: '',
  email: '',
  phone: '',
  plan: '',
  coach: '',
  paymentMethod: 'gcash',
  referenceNo: '',
  amount: '',
  notes: '',
})
const paymentFormHoneypot = ref('')
const paymentFormLoadedAt = Date.now()

watch(() => paymentForm.plan, (newPlan) => {
  const found = MEMBERSHIP_PLANS.find((p) => p.name === newPlan)
  if (found) {
    paymentForm.amount = found.price.replace(/,/g, '')
  }
})

const paymentReceipt = ref<File | null>(null)
const receiptPreviewUrl = ref('')
const ocrLoading = ref(false)
const ocrMessage = ref('')
const paymentErrors = reactive<Record<string, string>>({})
const showPaymentConfirm = ref(false)
const showWalkinConfirm = ref(false)
const paymentSubmitting = ref(false)
const walkinSubmitting = ref(false)

const walkinForm = reactive({
  fullName: '',
  email: '',
  phone: '',
  emergencyContact: '',
  waiverAccepted: false,
})
const walkinFormHoneypot = ref('')
const walkinFormLoadedAt = Date.now()
const walkinErrors = reactive<Record<string, string>>({})
const walkinSuccess = ref(false)
const walkinPassCode = ref('')
const walkinQrDataUrl = ref('')
const walkinSubmitError = ref('')

const coachesList = ref<{ id: string; fullName: string; specialty: string | null; bio: string | null; photoUrl: string | null }[]>([])

const heroRef = ref<HTMLElement | null>(null)
const parallaxRef = ref<HTMLElement | null>(null)
const pageRef = ref<HTMLElement | null>(null)
let gsapCleanup: (() => void) | null = null

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

function closeMobileMenu() {
  mobileMenuOpen.value = false
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function handleScroll() {
  showScrollTop.value = window.scrollY > 400
}

function validatePaymentForm(): boolean {
  Object.keys(paymentErrors).forEach((k) => delete paymentErrors[k])
  let valid = true

  if (paymentFormHoneypot.value) return true
  if (Date.now() - paymentFormLoadedAt < 3000) {
    paymentErrors.submit = 'Form submitted too fast. Please try again.'
    return false
  }

  const name = paymentForm.fullName.trim()
  if (!name) {
    paymentErrors.fullName = 'Full name is required'
    valid = false
  } else if (name.length < 2) {
    paymentErrors.fullName = 'Full name must be at least 2 characters'
    valid = false
  } else if (name.length > 100) {
    paymentErrors.fullName = 'Full name is too long (max 100 characters)'
    valid = false
  }

  const email = paymentForm.email.trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    paymentErrors.email = 'Valid email is required'
    valid = false
  } else if (email.length > 254) {
    paymentErrors.email = 'Email is too long'
    valid = false
  }

  const phone = paymentForm.phone.trim()
  if (!phone) {
    paymentErrors.phone = 'Phone number is required'
    valid = false
  } else if (!/^(\+639|09)\d{9}$/.test(phone)) {
    paymentErrors.phone = 'Enter a valid Philippine mobile number (+639XXXXXXXXX)'
    valid = false
  }

  if (!paymentForm.plan) {
    paymentErrors.plan = 'Please select a plan'
    valid = false
  }

  const ref = paymentForm.referenceNo.trim()
  if (!ref) {
    paymentErrors.referenceNo = 'Reference number is required — type it or upload receipt to auto-fill'
    valid = false
  } else if (ref.length > 40) {
    paymentErrors.referenceNo = 'Reference number is too long (max 40 characters)'
    valid = false
  }

  if (!paymentForm.amount.trim()) {
    paymentErrors.amount = 'Amount is required'
    valid = false
  } else if (!/^\d{1,6}(\.\d{1,2})?$/.test(paymentForm.amount.trim())) {
    paymentErrors.amount = 'Enter a valid amount (e.g. 1499 or 1499.50)'
    valid = false
  } else {
    const amt = parseFloat(paymentForm.amount.trim())
    if (amt <= 0 || amt > 100000) {
      paymentErrors.amount = 'Amount must be between ₱1 and ₱100,000'
      valid = false
    }
  }

  if (!paymentReceipt.value) {
    paymentErrors.receipt = 'Payment receipt is required'
    valid = false
  }

  return valid
}

function validateWalkinForm(): boolean {
  Object.keys(walkinErrors).forEach((k) => delete walkinErrors[k])
  let valid = true

  if (walkinFormHoneypot.value) return true
  if (Date.now() - walkinFormLoadedAt < 3000) {
    walkinErrors.submit = 'Form submitted too fast. Please try again.'
    return false
  }

  const name = walkinForm.fullName.trim()
  if (!name) {
    walkinErrors.fullName = 'Full name is required'
    valid = false
  } else if (name.length < 2) {
    walkinErrors.fullName = 'Full name must be at least 2 characters'
    valid = false
  } else if (name.length > 100) {
    walkinErrors.fullName = 'Full name is too long (max 100 characters)'
    valid = false
  }

  const email = walkinForm.email.trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    walkinErrors.email = 'Valid email is required'
    valid = false
  } else if (email.length > 254) {
    walkinErrors.email = 'Email is too long'
    valid = false
  }

  const phone = walkinForm.phone.trim()
  if (!phone) {
    walkinErrors.phone = 'Phone number is required'
    valid = false
  } else if (!/^(\+639|09)\d{9}$/.test(phone)) {
    walkinErrors.phone = 'Enter a valid Philippine mobile number (+639XXXXXXXXX)'
    valid = false
  }

  const emergency = walkinForm.emergencyContact.trim()
  if (!emergency) {
    walkinErrors.emergencyContact = 'Emergency contact is required'
    valid = false
  } else if (emergency.length < 2) {
    walkinErrors.emergencyContact = 'Emergency contact must be at least 2 characters'
    valid = false
  } else if (emergency.length > 100) {
    walkinErrors.emergencyContact = 'Emergency contact is too long (max 100 characters)'
    valid = false
  }

  if (!walkinForm.waiverAccepted) {
    walkinErrors.waiver = 'You must accept the waiver to continue'
    valid = false
  }

  return valid
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '')
  if (!cleaned) return ''
  if (cleaned.startsWith('+639') && cleaned.length === 13) return cleaned
  if (cleaned.startsWith('639') && cleaned.length === 12) return '+' + cleaned
  if (cleaned.startsWith('09') && cleaned.length === 11) return '+63' + cleaned.slice(1)
  if (/^\d{10}$/.test(cleaned)) return '+63' + cleaned
  return cleaned
}

function handleReceiptChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) {
    paymentReceipt.value = null
    receiptPreviewUrl.value = ''
    return
  }
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    paymentErrors.receipt = 'File must be under 5MB'
    input.value = ''
    return
  }
  const allowed = ['image/jpeg', 'image/jpg']
  if (!allowed.includes(file.type)) {
    paymentErrors.receipt = 'Only JPEG images are accepted'
    input.value = ''
    return
  }
  delete paymentErrors.receipt
  paymentReceipt.value = file
  if (file.type.startsWith('image/')) {
    receiptPreviewUrl.value = URL.createObjectURL(file)
  } else {
    receiptPreviewUrl.value = ''
  }

  ocrLoading.value = true
  ocrMessage.value = 'Scanning receipt for reference number...'
  extractRefFromReceipt(file).then((ref) => {
    if (ref) {
      paymentForm.referenceNo = ref
      ocrMessage.value = `Reference number detected: ${ref}`
      toast.success(`Reference number detected: ${ref}`)
    } else {
      ocrMessage.value = 'Could not detect reference number. Please enter it manually.'
      toast.warning('Could not detect reference number. Please type it manually.')
    }
  }).catch(() => {
    ocrMessage.value = 'Could not scan receipt. Please enter reference number manually.'
    toast.error('Could not scan receipt. Please enter reference number manually.')
  }).finally(() => {
    ocrLoading.value = false
  })
}

function onPaymentSubmit() {
  if (validatePaymentForm()) showPaymentConfirm.value = true
}

function onWalkinSubmit() {
  if (validateWalkinForm()) showWalkinConfirm.value = true
}

async function submitPaymentForm() {
  if (!validatePaymentForm()) return

  paymentSubmitting.value = true
  try {
    const formData = new FormData()
    formData.append('fullName', paymentForm.fullName)
    formData.append('email', paymentForm.email)
    formData.append('phone', paymentForm.phone)
    formData.append('plan', paymentForm.plan)
    formData.append('coach', paymentForm.coach)
    formData.append('paymentMethod', paymentForm.paymentMethod)
    formData.append('referenceNo', paymentForm.referenceNo)
    formData.append('amount', paymentForm.amount)
    if (paymentReceipt.value) {
      formData.append('receipt', paymentReceipt.value)
    }

    const api = useApi()
    await api(apiUrl('/api/membership/submit'), {
      method: 'POST',
      body: formData,
    })
    toast.success('Payment submitted! A certification email has been sent to your email.')

    Object.assign(paymentForm, {
      fullName: '',
      email: '',
      phone: '',
      plan: '',
      coach: '',
      paymentMethod: 'gcash',
      referenceNo: '',
      amount: '',
      notes: '',
    })
    paymentReceipt.value = null
    receiptPreviewUrl.value = ''
  } catch (err: unknown) {
    const fetchErr = err as { data?: { statusMessage?: string } }
    toast.error(fetchErr.data?.statusMessage ?? 'Submission failed. Please try again.')
  } finally {
    paymentSubmitting.value = false
  }
}

async function submitWalkinForm() {
  walkinSuccess.value = false
  walkinSubmitError.value = ''
  walkinPassCode.value = ''
  walkinQrDataUrl.value = ''
  if (!validateWalkinForm()) return

  walkinSubmitting.value = true
  try {
    const data = await cachedPost<{
      passCode: string
      qrPayload: string
      fullName: string
      visitDate: string
      duplicate?: boolean
    }>('/api/walkin/register', {
      fullName: walkinForm.fullName,
      email: walkinForm.email,
      phone: walkinForm.phone,
      emergencyContact: walkinForm.emergencyContact,
    }, {
      label: `Register ${walkinForm.fullName}`,
      cacheInvalidates: ['passes'],
    })

    walkinPassCode.value = data.passCode
    try {
      walkinQrDataUrl.value = await generateWalkinQrDataUrl(data.qrPayload)
    } catch {
      walkinQrDataUrl.value = ''
    }
    walkinSuccess.value = true

    if (data.duplicate) {
      toast.warning('This phone is already registered. Showing your existing pass.')
    }

    Object.assign(walkinForm, {
      fullName: '',
      email: '',
      phone: '',
      emergencyContact: '',
      waiverAccepted: false,
    })
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? ''
    if (msg === 'Queued for sync') {
      toast.success('Registration saved offline. It will sync when you reconnect.')
      Object.assign(walkinForm, {
        fullName: '',
        email: '',
        phone: '',
        emergencyContact: '',
        waiverAccepted: false,
      })
    } else {
      const fetchErr = err as { data?: { statusMessage?: string } }
      toast.error(fetchErr.data?.statusMessage ?? 'Registration failed. Please try again.')
    }
  } finally {
    walkinSubmitting.value = false
  }
}

function resetWalkinSuccess() {
  walkinSuccess.value = false
  walkinPassCode.value = ''
  walkinQrDataUrl.value = ''
  walkinSubmitError.value = ''
}

onMounted(async () => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()

  try {
    const api = useApi()
    const data = await api<{ coaches: typeof coachesList.value }>(apiUrl('/api/coaches/list'))
    coachesList.value = data.coaches
  } catch {
    coachesList.value = []
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion) return

  const { gsap } = await import('gsap')
  const { ScrollTrigger } = await import('gsap/ScrollTrigger')
  gsap.registerPlugin(ScrollTrigger)

  const ctx = gsap.context(() => {
    gsap.from('.hero-label', { opacity: 0, y: 30, duration: 0.8, delay: 0.2 })
    gsap.from('.hero-title', { opacity: 0, y: 50, duration: 1, delay: 0.4 })
    gsap.from('.hero-subtitle', { opacity: 0, y: 30, duration: 0.8, delay: 0.7 })
    gsap.from('.hero-cta', { opacity: 0, y: 20, duration: 0.6, delay: 1, stagger: 0.15 })

    if (parallaxRef.value) {
      gsap.to(parallaxRef.value, {
        yPercent: 20,
        ease: 'none',
        scrollTrigger: {
          trigger: heroRef.value,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      })
    }

    gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        y: 40,
        duration: 0.8,
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      })
    })
  }, pageRef.value)

  gsapCleanup = () => ctx.revert()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  gsapCleanup?.()
})
</script>

<template>
  <div ref="pageRef" class="min-h-screen bg-onyx">
    <!-- Navigation -->
    <header class="fixed top-0 left-0 right-0 z-50 bg-onyx/90 backdrop-blur-md border-b border-iron/50">
      <nav class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between h-14 sm:h-16 lg:h-20">
        <a href="#" class="font-display text-xl sm:text-2xl lg:text-3xl text-gold tracking-widest" @click.prevent="scrollToTop">
          OASIS<span class="text-cream">FIT</span>
        </a>

        <ul class="hidden lg:flex items-center gap-8">
          <li v-for="link in navLinks" :key="link.href">
            <a
              :href="link.href"
              class="text-sm uppercase tracking-wider text-mist hover:text-gold transition-colors"
            >
              {{ link.label }}
            </a>
          </li>
        </ul>

        <a href="#register" class="hidden lg:inline-flex btn-primary text-xs">Join Now</a>

        <button
          type="button"
          class="lg:hidden p-2 text-cream"
          aria-label="Toggle menu"
          @click="toggleMobileMenu"
        >
          <svg v-if="!mobileMenuOpen" class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <svg v-else class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </nav>

      <div
        v-show="mobileMenuOpen"
        class="lg:hidden bg-obsidian border-t border-iron/50 px-3 sm:px-4 py-4 sm:py-6 space-y-2 sm:space-y-4"
      >
        <a
          v-for="link in navLinks"
          :key="link.href"
          :href="link.href"
          class="block text-cream text-sm uppercase tracking-wider py-2 hover:text-gold transition-colors"
          @click="closeMobileMenu"
        >
          {{ link.label }}
        </a>
        <a href="#register" class="btn-primary w-full text-xs mt-2" @click="closeMobileMenu">Join Now</a>
      </div>
    </header>

    <!-- Hero -->
    <section ref="heroRef" class="relative min-h-[80vh] sm:min-h-screen flex items-center justify-center overflow-hidden pt-14 sm:pt-16">
      <div
        ref="parallaxRef"
        class="absolute inset-0 bg-gradient-to-br from-obsidian via-onyx to-graphite"
        aria-hidden="true"
      />
      <div
        class="absolute inset-0 opacity-20"
        style="background-image: radial-gradient(circle at 20% 50%, #C9A84C 0%, transparent 50%), radial-gradient(circle at 80% 20%, #C9A84C 0%, transparent 40%)"
        aria-hidden="true"
      />

      <div class="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p class="hero-label section-label mb-2 sm:mb-4">Calauan, Laguna</p>
        <h1 class="hero-title font-display text-[2.75rem] sm:text-7xl md:text-8xl lg:text-9xl text-cream leading-none tracking-wide mb-3 sm:mb-6">
          OASIS<br /><span class="text-gold">FITNESS</span>
        </h1>
        <p class="hero-subtitle text-mist text-sm sm:text-lg md:text-xl max-w-2xl mx-auto mb-6 sm:mb-10 text-balance">
          Your sanctuary for strength, endurance, and transformation. Premium equipment. Expert coaching. Real results.
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
          <a href="#membership" class="hero-cta btn-primary w-full sm:w-auto">View Plans</a>
          <a href="#location" class="hero-cta btn-outline w-full sm:w-auto">Find Us</a>
        </div>
      </div>

      <div class="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 animate-bounce" aria-hidden="true">
        <svg class="w-5 h-5 sm:w-6 sm:h-6 text-gold/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>

    <!-- Ticker -->
    <div class="border-y border-iron bg-obsidian overflow-hidden py-2 sm:py-3" aria-hidden="true">
      <div class="flex animate-marquee whitespace-nowrap">
        <span
          v-for="(item, i) in [...tickerItems, ...tickerItems]"
          :key="i"
          class="mx-4 sm:mx-8 font-display text-gold text-sm sm:text-lg tracking-[0.2em] flex items-center gap-4 sm:gap-8"
        >
          {{ item }}
          <span class="text-iron hidden sm:inline">◆</span>
        </span>
      </div>
    </div>

    <!-- About -->
    <section id="about" class="py-10 sm:py-20 lg:py-32">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div class="grid lg:grid-cols-2 gap-6 sm:gap-12 lg:gap-20 items-center">
          <div class="reveal">
            <p class="section-label mb-2 sm:mb-3">About Us</p>
            <h2 class="section-title mb-3 sm:mb-6">WHERE STRENGTH<br />MEETS SANCTUARY</h2>
            <p class="text-mist text-[13px] sm:text-sm md:text-base leading-relaxed mb-3 sm:mb-6">
              OASIS FITNESS GYM is Calauan's premier training destination — built for beginners and athletes alike.
              We combine state-of-the-art equipment with a welcoming community atmosphere so every rep counts.
            </p>
            <p class="text-mist text-[13px] sm:text-sm md:text-base leading-relaxed">
              Whether you're chasing your first pull-up or prepping for competition, our coaches and members
              have your back every step of the way.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 reveal">
            <div
              v-for="feature in features"
              :key="feature.title"
              class="card p-3.5 sm:p-6 hover:border-gold/40 transition-colors"
            >
              <div class="w-7 h-7 sm:w-10 sm:h-10 border border-gold/30 flex items-center justify-center mb-2.5 sm:mb-4">
                <span class="text-gold font-display text-sm sm:text-lg">✦</span>
              </div>
              <h3 class="font-display text-base sm:text-xl text-cream tracking-wide mb-1 sm:mb-2">{{ feature.title }}</h3>
              <p class="text-mist text-[11px] sm:text-sm leading-relaxed">{{ feature.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Gallery -->
    <section id="gallery" class="py-10 sm:py-20 lg:py-32 bg-obsidian/50">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div class="text-center mb-6 sm:mb-12 reveal">
          <p class="section-label mb-2 sm:mb-3">Our Space</p>
          <h2 class="section-title">TRAINING ZONES</h2>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
          <div
            v-for="zone in galleryZones"
            :key="zone.name"
            class="reveal group relative aspect-[4/3] overflow-hidden border border-iron"
          >
            <div class="w-full h-full bg-graphite flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-500">
              <svg class="w-10 h-10 sm:w-16 sm:h-16 text-iron mb-2 sm:mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span class="font-display text-cream text-base sm:text-xl tracking-wide">{{ zone.name }}</span>
            </div>
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-onyx/90 to-transparent p-2.5 sm:p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
              <p class="text-mist text-[11px] sm:text-sm">{{ zone.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Coaches -->
    <section id="coaches" class="py-10 sm:py-20 lg:py-32">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div class="text-center mb-6 sm:mb-12 reveal">
          <p class="section-label mb-2 sm:mb-3">Meet the Team</p>
          <h2 class="section-title mb-2 sm:mb-4">OUR COACHES</h2>
          <p class="text-mist text-[13px] sm:text-sm md:text-base max-w-xl mx-auto">Certified professionals dedicated to helping you reach your goals.</p>
        </div>

        <div v-if="coachesList.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          <div
            v-for="coach in coachesList"
            :key="coach.id"
            class="reveal card p-4 sm:p-6 flex flex-col items-center text-center"
          >
            <div class="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-gold/30 mb-3 sm:mb-4 bg-graphite flex items-center justify-center">
              <img v-if="coach.photoUrl" :src="coach.photoUrl" :alt="coach.fullName" class="w-full h-full object-cover" loading="lazy" decoding="async" width="112" height="112" />
              <span v-else class="text-gold font-display text-2xl sm:text-3xl">{{ coach.fullName.charAt(0) }}</span>
            </div>
            <h3 class="font-display text-lg sm:text-xl text-cream tracking-wide mb-1">{{ coach.fullName }}</h3>
            <p v-if="coach.specialty" class="text-gold text-[11px] sm:text-sm uppercase tracking-wider mb-2 sm:mb-3">{{ coach.specialty }}</p>
            <p v-if="coach.bio" class="text-mist text-[11px] sm:text-sm leading-relaxed">{{ coach.bio }}</p>
          </div>
        </div>

        <div v-else class="text-center py-10">
          <p class="text-mist text-[13px] sm:text-sm">Our coaches will be featured here soon.</p>
        </div>
      </div>
    </section>

    <!-- Membership -->
    <section id="membership" class="py-10 sm:py-20 lg:py-32">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div class="text-center mb-6 sm:mb-12 reveal">
          <p class="section-label mb-2 sm:mb-3">Pricing</p>
          <h2 class="section-title mb-2 sm:mb-4">MEMBERSHIP PLANS</h2>
          <p class="text-mist text-[13px] sm:text-sm md:text-base max-w-xl mx-auto">Flexible options for every fitness goal. No hidden fees.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 max-w-4xl mx-auto">
          <div
            v-for="plan in membershipPlansDisplay"
            :key="plan.name"
            class="reveal card p-4 sm:p-6 flex flex-col relative"
            :class="plan.featured ? 'border-gold ring-1 ring-gold/30' : ''"
          >
            <span
              v-if="plan.featured"
              class="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-onyx text-[9px] sm:text-xs font-semibold uppercase tracking-wider px-2 sm:px-3 py-0.5 sm:py-1"
            >
              Popular
            </span>
            <h3 class="font-display text-lg sm:text-2xl text-cream tracking-wide mb-1 sm:mb-2">{{ plan.name }}</h3>
            <div class="mb-3 sm:mb-6">
              <span class="font-display text-[1.75rem] sm:text-4xl text-gold">₱{{ plan.price }}</span>
              <span class="text-mist text-[11px] sm:text-sm">{{ plan.period }}</span>
            </div>
            <ul class="space-y-1.5 sm:space-y-3 mb-4 sm:mb-8 flex-1">
              <li v-for="feat in plan.features" :key="feat" class="flex items-start gap-1.5 sm:gap-2 text-[11px] sm:text-sm text-mist">
                <span class="text-gold mt-0.5 shrink-0">✓</span>
                {{ feat }}
              </li>
            </ul>
            <a href="#register" class="btn-outline w-full text-center text-[11px] sm:text-xs">Choose Plan</a>
          </div>
        </div>
      </div>
    </section>

    <!-- Register / Forms -->
    <section id="register" class="py-10 sm:py-20 lg:py-32 bg-obsidian/50">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div class="text-center mb-6 sm:mb-12 reveal">
          <p class="section-label mb-2 sm:mb-3">Sign Up</p>
          <h2 class="section-title mb-2 sm:mb-4">GET STARTED</h2>
          <p class="text-mist text-[13px] sm:text-sm md:text-base max-w-xl mx-auto">Register for a permanent walk-in pass or subscribe to a membership plan.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 lg:gap-12">
          <!-- Payment Form -->
          <div class="reveal card p-4 sm:p-6 lg:p-8">
            <h3 class="font-display text-lg sm:text-2xl text-cream tracking-wide mb-1 sm:mb-2">Membership Payment</h3>
            <p class="text-mist text-[11px] sm:text-sm mb-3 sm:mb-5">
              Choose a plan, pay via GCash or bank transfer, then upload your receipt.
            </p>

            <!-- Payment Info -->
            <div class="bg-graphite/50 border border-iron rounded-sm p-2.5 sm:p-4 mb-3 sm:mb-5 text-[11px] sm:text-sm space-y-0.5">
              <p><span class="text-mist">GCash:</span> <span class="text-cream font-medium">09XX XXX XXXX</span></p>
              <p><span class="text-mist">Bank:</span> <span class="text-cream font-medium">Account # XXX-XXX-XXX</span></p>
            </div>

            <form class="space-y-3 sm:space-y-5" @submit.prevent="onPaymentSubmit">
              <!-- Plan Selection as Cards -->
              <div>
                <label class="block text-[11px] sm:text-sm text-mist mb-1.5 sm:mb-2">1. Select Plan *</label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <label
                    v-for="plan in membershipPlans"
                    :key="plan.name"
                    class="relative flex flex-col items-center text-center cursor-pointer p-3 sm:p-4 border-2 transition-all rounded-sm"
                    :class="paymentForm.plan === plan.name
                      ? 'border-gold bg-gold/5 shadow-lg shadow-gold/10'
                      : 'border-iron hover:border-gold/40 bg-graphite/30'"
                  >
                    <input
                      v-model="paymentForm.plan"
                      type="radio"
                      :value="plan.name"
                      class="sr-only"
                    />
                    <span v-if="plan.featured" class="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gold text-onyx text-[8px] sm:text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm">Popular</span>
                    <span class="font-display text-xl sm:text-2xl text-cream tracking-wide">{{ plan.name }}</span>
                    <span class="text-gold font-display text-base sm:text-lg mt-0.5">₱{{ plan.price }}<span class="text-mist text-[10px] sm:text-xs font-body">{{ plan.period }}</span></span>
                  </label>
                </div>
                <p v-if="paymentErrors.plan" class="text-red-400 text-[10px] sm:text-xs mt-1">{{ paymentErrors.plan }}</p>
              </div>

              <!-- Personal Info -->
              <div>
                <label class="block text-[11px] sm:text-sm text-mist mb-1.5 sm:mb-2">2. Your Details</label>
                <div class="space-y-2.5 sm:space-y-3">
                  <div>
                    <label for="pay-name" class="block text-[10px] sm:text-xs text-mist/70 mb-0.5">Full Name *</label>
                    <input id="pay-name" v-model="paymentForm.fullName" type="text" class="input-field" maxlength="100" placeholder="Juan Dela Cruz" />
                    <p v-if="paymentErrors.fullName" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ paymentErrors.fullName }}</p>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                    <div>
                      <label for="pay-email" class="block text-[10px] sm:text-xs text-mist/70 mb-0.5">Email *</label>
                      <input id="pay-email" v-model="paymentForm.email" type="email" class="input-field" placeholder="you@email.com" />
                      <p v-if="paymentErrors.email" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ paymentErrors.email }}</p>
                    </div>
                    <div>
                      <label for="pay-phone" class="block text-[10px] sm:text-xs text-mist/70 mb-0.5">Phone *</label>
                      <input id="pay-phone" v-model="paymentForm.phone" type="tel" class="input-field" maxlength="13" placeholder="+639XXXXXXXXX" @blur="paymentForm.phone = formatPhone(paymentForm.phone)" />
                      <p v-if="paymentErrors.phone" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ paymentErrors.phone }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Coach -->
              <div>
                <label for="pay-coach" class="block text-[11px] sm:text-sm text-mist mb-1.5 sm:mb-2">3. Preferred Coach (optional)</label>
                <select id="pay-coach" v-model="paymentForm.coach" class="input-field">
                  <option value="">No preference</option>
                  <option v-for="coach in coachesList" :key="coach.id" :value="coach.fullName">
                    {{ coach.fullName }}{{ coach.specialty ? ` — ${coach.specialty}` : '' }}
                  </option>
                </select>
                <p v-if="coachesList.length === 0" class="text-mist text-[10px] sm:text-xs mt-0.5 italic">No coaches available yet.</p>
              </div>

              <!-- Payment Method -->
              <div>
                <label class="block text-[11px] sm:text-sm text-mist mb-1.5 sm:mb-2">4. Payment Method *</label>
                <div class="flex gap-3 sm:gap-4">
                  <label class="flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                    <input v-model="paymentForm.paymentMethod" type="radio" value="gcash" class="accent-gold" />
                    <span class="text-[11px] sm:text-sm text-cream">GCash</span>
                  </label>
                  <label class="flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                    <input v-model="paymentForm.paymentMethod" type="radio" value="bank" class="accent-gold" />
                    <span class="text-[11px] sm:text-sm text-cream">Bank Transfer</span>
                  </label>
                </div>
              </div>

              <!-- Reference + Amount -->
              <div>
                <label class="block text-[11px] sm:text-sm text-mist mb-1.5 sm:mb-2">5. Payment Details</label>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  <div>
                    <label for="pay-ref" class="block text-[10px] sm:text-xs text-mist/70 mb-0.5">Reference No. *</label>
                    <input id="pay-ref" v-model="paymentForm.referenceNo" type="text" class="input-field" :class="paymentReceipt && (ocrLoading || paymentForm.referenceNo) ? 'bg-graphite/50 cursor-not-allowed opacity-60' : ''" :readonly="!!paymentReceipt && (ocrLoading || !!paymentForm.referenceNo)" :disabled="!!paymentReceipt && (ocrLoading || !!paymentForm.referenceNo)" :placeholder="paymentReceipt ? (paymentForm.referenceNo ? 'Scanned from receipt...' : 'Type reference number...') : 'Upload receipt to auto-fill'" />
                    <p v-if="paymentReceipt && ocrLoading" class="text-gold text-[9px] sm:text-[10px] mt-0.5">Scanning receipt...</p>
                    <p v-else-if="paymentReceipt && paymentForm.referenceNo" class="text-green-400 text-[9px] sm:text-[10px] mt-0.5">Auto-filled from receipt</p>
                    <p v-else-if="paymentReceipt && !paymentForm.referenceNo" class="text-yellow-400 text-[9px] sm:text-[10px] mt-0.5">Could not detect ref. no — type it manually below</p>
                    <p v-else class="text-mist/50 text-[9px] sm:text-[10px] mt-0.5">Upload receipt below to auto-fill</p>
                    <p v-if="paymentErrors.referenceNo" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ paymentErrors.referenceNo }}</p>
                  </div>
                  <div>
                    <label for="pay-amount" class="block text-[10px] sm:text-xs text-mist/70 mb-0.5">Amount Paid *</label>
                    <div class="relative">
                      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gold text-sm font-display">₱</span>
                      <input id="pay-amount" v-model="paymentForm.amount" type="text" class="input-field pl-7 bg-graphite/50 cursor-not-allowed opacity-60" placeholder="Select a plan" readonly disabled />
                    </div>
                    <p v-if="paymentErrors.amount" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ paymentErrors.amount }}</p>
                  </div>
                </div>
              </div>

              <!-- Receipt Upload with Preview -->
              <div>
                <label class="block text-[11px] sm:text-sm text-mist mb-1.5 sm:mb-2">6. Upload Receipt *</label>
                <label
                  for="pay-receipt"
                  class="flex flex-col items-center justify-center cursor-pointer border-2 border-dashed transition-all rounded-sm p-4 sm:p-6"
                  :class="paymentReceipt
                    ? 'border-gold bg-gold/5'
                    : 'border-iron hover:border-gold/40 bg-graphite/30'"
                >
                  <template v-if="paymentReceipt">
                    <div class="relative w-full">
                        <img
                        v-if="paymentReceipt.type.startsWith('image/')"
                        :src="receiptPreviewUrl"
                        alt="Receipt preview"
                        class="max-h-40 sm:max-h-48 mx-auto rounded-sm object-contain"
                        decoding="async"
                      />
                      <div v-else class="flex items-center gap-2 justify-center py-4">
                        <span class="text-2xl">📄</span>
                        <span class="text-cream text-xs sm:text-sm">{{ paymentReceipt.name }}</span>
                      </div>
                      <button
                        type="button"
                        class="absolute top-1 right-1 bg-onyx/80 text-mist hover:text-cream w-6 h-6 flex items-center justify-center rounded-full text-xs"
                        @click.prevent="paymentReceipt = null; receiptPreviewUrl = ''; paymentForm.referenceNo = ''; ocrMessage = ''"
                      >
                        ✕
                      </button>
                    </div>
                    <p class="text-gold text-[10px] sm:text-xs mt-2">Change file</p>
                  </template>
                  <template v-else>
                    <svg class="w-8 h-8 sm:w-10 sm:h-10 text-mist/50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <p class="text-cream text-[11px] sm:text-sm font-medium">Tap to upload your GCash/bank receipt</p>
                    <p class="text-mist text-[9px] sm:text-[10px] mt-0.5">JPEG only — max 5MB</p>
                  </template>
                </label>
                <input
                  id="pay-receipt"
                  type="file"
                  accept="image/jpeg,image/jpg"
                  class="sr-only"
                  @change="handleReceiptChange"
                />
                <p v-if="paymentErrors.receipt" class="text-red-400 text-[10px] sm:text-xs mt-1">{{ paymentErrors.receipt }}</p>
              </div>

              <!-- Notes -->
              <div>
                <label for="pay-notes" class="block text-[10px] sm:text-xs text-mist/70 mb-0.5">Notes (optional)</label>
                <textarea id="pay-notes" v-model="paymentForm.notes" rows="2" class="input-field resize-none" placeholder="Any additional info..." />
              </div>

              <div class="absolute left-[-9999px]" aria-hidden="true">
                <label for="pay-website">Website</label>
                <input id="pay-website" v-model="paymentFormHoneypot" type="text" tabindex="-1" autocomplete="off" />
              </div>

              <button type="submit" class="btn-primary w-full py-3" :disabled="paymentSubmitting">
                <span v-if="paymentSubmitting" class="inline-flex items-center gap-2">
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting…
                </span>
                <span v-else>Submit Payment</span>
              </button>
            </form>
          </div>

          <!-- Walk-in Form -->
          <div class="reveal card p-4 sm:p-6 lg:p-8">
            <h3 class="font-display text-lg sm:text-2xl text-cream tracking-wide mb-1 sm:mb-2">Walk-in Registration</h3>
            <p class="text-mist text-[11px] sm:text-sm mb-3 sm:mb-6">
              Register once to get a permanent QR code. Show it at the gym every visit — no need to register again.
            </p>

            <form v-if="!walkinSuccess" class="space-y-2.5 sm:space-y-4" @submit.prevent="onWalkinSubmit">
              <div>
                <label for="walk-name" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Full Name *</label>
                <input id="walk-name" v-model="walkinForm.fullName" type="text" class="input-field" maxlength="100" />
                <p v-if="walkinErrors.fullName" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ walkinErrors.fullName }}</p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                <div>
                  <label for="walk-email" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Email *</label>
                  <input id="walk-email" v-model="walkinForm.email" type="email" class="input-field" />
                  <p v-if="walkinErrors.email" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ walkinErrors.email }}</p>
                </div>
                <div>
                  <label for="walk-phone" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Phone *</label>
                  <input id="walk-phone" v-model="walkinForm.phone" type="tel" class="input-field" maxlength="13" placeholder="+639XXXXXXXXX" @blur="walkinForm.phone = formatPhone(walkinForm.phone)" />
                  <p v-if="walkinErrors.phone" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ walkinErrors.phone }}</p>
                </div>
              </div>

              <div>
                <label for="walk-emergency" class="block text-[11px] sm:text-sm text-mist mb-0.5 sm:mb-1">Emergency Contact *</label>
                <input id="walk-emergency" v-model="walkinForm.emergencyContact" type="text" class="input-field" maxlength="100" placeholder="Name & phone number" />
                <p v-if="walkinErrors.emergencyContact" class="text-red-400 text-[10px] sm:text-xs mt-0.5">{{ walkinErrors.emergencyContact }}</p>
              </div>

              <div class="bg-graphite/50 border border-iron rounded-sm p-2.5 sm:p-4 text-[10px] sm:text-xs text-mist leading-relaxed max-h-24 sm:max-h-32 overflow-y-auto">
                <p class="font-semibold text-cream mb-1.5 sm:mb-2">Waiver & Release of Liability</p>
                <p>
                  I acknowledge that participation in physical exercise involves inherent risks including injury or death.
                  I voluntarily assume all such risks and release OASIS FITNESS GYM, its owners, employees, and agents
                  from any liability arising from my use of the facilities. I confirm I am physically fit to participate
                  or have consulted a physician. I agree to follow all gym rules and safety guidelines.
                </p>
              </div>

              <label class="flex items-start gap-2 sm:gap-3 cursor-pointer">
                <input v-model="walkinForm.waiverAccepted" type="checkbox" class="mt-0.5 sm:mt-1 accent-gold" />
                <span class="text-[11px] sm:text-sm text-mist">I have read and agree to the waiver above *</span>
              </label>
              <p v-if="walkinErrors.waiver" class="text-red-400 text-[10px] sm:text-xs">{{ walkinErrors.waiver }}</p>

              <div class="absolute left-[-9999px]" aria-hidden="true">
                <label for="walk-website">Website</label>
                <input id="walk-website" v-model="walkinFormHoneypot" type="text" tabindex="-1" autocomplete="off" />
              </div>

              <button type="submit" class="btn-primary w-full" :disabled="walkinSubmitting">
                <span v-if="walkinSubmitting" class="inline-flex items-center gap-2">
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Registering…
                </span>
                <span v-else>Register Walk-in</span>
              </button>
            </form>

            <div v-else class="text-center space-y-3 sm:space-y-6 py-3 sm:py-4">
              <div class="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 border border-gold/30 rounded-full">
                <span class="text-gold text-lg sm:text-2xl">✓</span>
              </div>
              <div>
                <h4 class="font-display text-lg sm:text-2xl text-cream tracking-wide mb-1 sm:mb-2">Walk-in Account Created</h4>
                <p class="text-mist text-[11px] sm:text-sm">
                  Your QR code is permanent. Show it at the gym every visit — no need to register again.
                </p>
              </div>
              <div v-if="walkinQrDataUrl" class="inline-block p-2.5 sm:p-4 bg-cream rounded-sm">
                <img :src="walkinQrDataUrl" alt="Permanent walk-in QR code" class="w-44 h-44 sm:w-60 sm:h-60" width="240" height="240" decoding="async" />
              </div>
              <div>
                <p class="text-mist text-[9px] sm:text-xs uppercase tracking-wider mb-0.5 sm:mb-1">Permanent Pass Code</p>
                <p class="font-display text-xl sm:text-3xl text-gold tracking-widest">{{ walkinPassCode }}</p>
              </div>
              <p class="text-mist text-[9px] sm:text-xs">Save this QR code and pass code. You'll need them for every visit.</p>
              <button type="button" class="btn-outline w-full" @click="resetWalkinSuccess">
                Register Another
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Payment Confirmation Modal -->
    <div v-if="showPaymentConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-onyx/90 backdrop-blur-sm" @click.self="showPaymentConfirm = false">
      <div class="bg-graphite border border-iron rounded-sm max-w-sm w-full p-5 sm:p-6 space-y-4">
        <div class="text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold/10 border border-gold/30 mb-3">
            <span class="text-gold text-xl">💳</span>
          </div>
          <h4 class="font-display text-lg sm:text-xl text-cream tracking-wide">Confirm Payment</h4>
          <p class="text-mist text-[11px] sm:text-sm mt-1">Please review your details before submitting.</p>
        </div>
        <div class="space-y-1.5 text-[11px] sm:text-sm">
          <div class="flex justify-between"><span class="text-mist">Plan</span><span class="text-cream font-medium">{{ paymentForm.plan }}</span></div>
          <div class="flex justify-between"><span class="text-mist">Amount</span><span class="text-gold font-display text-base">₱{{ paymentForm.amount }}</span></div>
          <div class="flex justify-between"><span class="text-mist">Name</span><span class="text-cream font-medium text-right">{{ paymentForm.fullName }}</span></div>
          <div class="flex justify-between"><span class="text-mist">Phone</span><span class="text-cream font-medium">{{ paymentForm.phone }}</span></div>
          <div v-if="paymentForm.coach" class="flex justify-between"><span class="text-mist">Coach</span><span class="text-cream font-medium">{{ paymentForm.coach }}</span></div>
          <div class="flex justify-between"><span class="text-mist">Method</span><span class="text-cream font-medium uppercase">{{ paymentForm.paymentMethod }}</span></div>
          <div class="flex justify-between"><span class="text-mist">Ref No.</span><span class="text-cream font-medium">{{ paymentForm.referenceNo }}</span></div>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-outline flex-1" @click="showPaymentConfirm = false">Cancel</button>
          <button type="button" class="btn-primary flex-1" :disabled="paymentSubmitting" @click="showPaymentConfirm = false; submitPaymentForm()">
            <span v-if="paymentSubmitting" class="inline-flex items-center gap-2">
              <svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting…
            </span>
            <span v-else>Confirm & Submit</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Walk-in Confirmation Modal -->
    <div v-if="showWalkinConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-onyx/90 backdrop-blur-sm" @click.self="showWalkinConfirm = false">
      <div class="bg-graphite border border-iron rounded-sm max-w-sm w-full p-5 sm:p-6 space-y-4">
        <div class="text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold/10 border border-gold/30 mb-3">
            <span class="text-gold text-xl">📋</span>
          </div>
          <h4 class="font-display text-lg sm:text-xl text-cream tracking-wide">Confirm Registration</h4>
          <p class="text-mist text-[11px] sm:text-sm mt-1">Is your information correct?</p>
        </div>
        <div class="space-y-1.5 text-[11px] sm:text-sm">
          <div class="flex justify-between"><span class="text-mist">Name</span><span class="text-cream font-medium text-right">{{ walkinForm.fullName }}</span></div>
          <div class="flex justify-between"><span class="text-mist">Email</span><span class="text-cream font-medium text-right">{{ walkinForm.email }}</span></div>
          <div class="flex justify-between"><span class="text-mist">Phone</span><span class="text-cream font-medium">{{ walkinForm.phone }}</span></div>
          <div class="flex justify-between"><span class="text-mist">Emergency</span><span class="text-cream font-medium text-right">{{ walkinForm.emergencyContact }}</span></div>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn-outline flex-1" @click="showWalkinConfirm = false">Cancel</button>
          <button type="button" class="btn-primary flex-1" :disabled="walkinSubmitting" @click="showWalkinConfirm = false; submitWalkinForm()">
            <span v-if="walkinSubmitting" class="inline-flex items-center gap-2">
              <svg class="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Registering…
            </span>
            <span v-else>Confirm & Register</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Hours + Location -->
    <section id="location" class="py-10 sm:py-20 lg:py-32">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12 lg:gap-20">
          <div class="reveal">
            <p class="section-label mb-2 sm:mb-3">Visit Us</p>
            <h2 class="section-title mb-4 sm:mb-8">LOCATION & HOURS</h2>

            <div class="space-y-3 sm:space-y-6 mb-4 sm:mb-8">
              <div class="flex items-start gap-2.5 sm:gap-4">
                <span class="text-gold text-base sm:text-xl shrink-0">📍</span>
                <div>
                  <p class="text-cream font-medium text-[13px] sm:text-base">Address</p>
                  <p class="text-mist text-[11px] sm:text-sm">XXX Street, Barangay XXX, Calauan, Laguna 4012</p>
                </div>
              </div>
              <div class="flex items-start gap-2.5 sm:gap-4">
                <span class="text-gold text-base sm:text-xl shrink-0">📞</span>
                <div>
                  <p class="text-cream font-medium text-[13px] sm:text-base">Contact</p>
                  <p class="text-mist text-[11px] sm:text-sm">+63 9XX XXX XXXX</p>
                  <p class="text-mist text-[11px] sm:text-sm">info@oasisfitnessgym.ph</p>
                </div>
              </div>
            </div>

            <div class="card overflow-hidden overflow-x-auto">
              <table class="w-full text-[11px] sm:text-sm min-w-[280px]">
                <thead>
                  <tr class="border-b border-iron">
                    <th class="text-left p-2.5 sm:p-4 text-gold font-display tracking-wide">Day</th>
                    <th class="text-left p-2.5 sm:p-4 text-gold font-display tracking-wide">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in operatingHours" :key="row.day" class="border-b border-iron/50 last:border-0">
                    <td class="p-2.5 sm:p-4 text-cream whitespace-nowrap">{{ row.day }}</td>
                    <td class="p-2.5 sm:p-4 text-mist whitespace-nowrap">{{ row.hours }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="reveal">
            <div class="aspect-[4/3] lg:aspect-auto lg:h-full min-h-[220px] sm:min-h-[300px] border border-iron overflow-hidden relative">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3858.5!2d121.3138474!3d14.1459457!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33bd5d00173de8f1%3A0xfff2ab31087057b5!2sOASIS+FITNESS+GYM+-+CALAUAN!5e0!3m2!1sen!2sph!4v1719000000000"
                class="w-full h-full min-h-[220px] sm:min-h-[300px] grayscale contrast-125 opacity-80"
                style="border:0; filter: invert(90%) hue-rotate(180deg);"
                allowfullscreen
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
                title="OASIS FITNESS GYM location on Google Maps"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Banner -->
    <section class="py-10 sm:py-16 lg:py-24 border-y border-iron bg-gradient-to-r from-obsidian via-graphite to-obsidian">
      <div class="max-w-4xl mx-auto px-3 sm:px-6 text-center reveal">
        <h2 class="font-display text-2xl sm:text-4xl md:text-5xl lg:text-6xl text-cream tracking-wide mb-2 sm:mb-4">
          START YOUR<br /><span class="text-gold">TRANSFORMATION</span>
        </h2>
        <p class="text-mist text-[13px] sm:text-sm md:text-base mb-5 sm:mb-8 max-w-lg mx-auto">
          Your first step is the hardest. We'll make every step after that count.
        </p>
        <a href="#register" class="btn-primary">Join OASIS Today</a>
      </div>
    </section>

    <!-- Footer -->
    <footer class="py-8 sm:py-16 border-t border-iron">
      <div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-10 mb-8 sm:mb-12">
          <div>
            <p class="font-display text-lg sm:text-2xl text-gold tracking-widest mb-2 sm:mb-4">OASIS<span class="text-cream">FIT</span></p>
            <p class="text-mist text-[11px] sm:text-sm leading-relaxed">
              Premium fitness in the heart of Calauan, Laguna. Train smarter. Live stronger.
            </p>
          </div>

          <div>
            <h4 class="font-display text-cream tracking-wide mb-2 sm:mb-4 text-[13px] sm:text-base">Quick Links</h4>
            <ul class="space-y-1 sm:space-y-2">
              <li v-for="link in navLinks" :key="link.href">
                <a :href="link.href" class="text-mist text-[11px] sm:text-sm hover:text-gold transition-colors">{{ link.label }}</a>
              </li>
            </ul>
          </div>

          <div>
            <h4 class="font-display text-cream tracking-wide mb-2 sm:mb-4 text-[13px] sm:text-base">Contact</h4>
            <ul class="space-y-1 sm:space-y-2 text-mist text-[11px] sm:text-sm">
              <li>+63 9XX XXX XXXX</li>
              <li>info@oasisfitnessgym.ph</li>
              <li>Calauan, Laguna 4012</li>
            </ul>
          </div>

          <div>
            <h4 class="font-display text-cream tracking-wide mb-2 sm:mb-4 text-[13px] sm:text-base">Follow Us</h4>
            <div class="flex gap-2.5 sm:gap-4">
              <a
                v-for="social in socials"
                :key="social.name"
                :href="social.href"
                target="_blank"
                rel="noopener noreferrer"
                class="w-8 h-8 sm:w-10 sm:h-10 border border-iron flex items-center justify-center text-mist hover:border-gold hover:text-gold transition-colors"
                :aria-label="social.name"
              >
                <span class="text-[9px] sm:text-xs font-semibold uppercase">{{ social.icon.slice(0, 2) }}</span>
              </a>
            </div>
          </div>
        </div>

        <div class="border-t border-iron pt-5 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 text-mist text-[9px] sm:text-xs">
          <p>&copy; {{ new Date().getFullYear() }} OASIS FITNESS GYM. All rights reserved.</p>
          <div class="flex items-center gap-3 sm:gap-4">
            <p>Calauan, Laguna, Philippines</p>
            <span class="text-iron">|</span>
            <NuxtLink to="/staff" class="text-mist hover:text-gold transition-colors">Are you a staff/admin?</NuxtLink>
          </div>
        </div>
      </div>
    </footer>

    <!-- Promo Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPromo" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" @click.self="dismissPromo">
          <div class="relative bg-graphite border border-iron max-w-md w-full p-6 sm:p-8 text-center">
            <button
              type="button"
              class="absolute top-3 right-3 text-mist hover:text-cream text-xl leading-none"
              @click="dismissPromo"
            >
              &times;
            </button>
            <p class="text-gold text-[10px] sm:text-xs uppercase tracking-[4px] mb-3">Limited Offer</p>
            <h2 class="font-display text-2xl sm:text-3xl text-cream tracking-wide mb-2">Join OASIS Fitness Gym</h2>
            <p class="text-mist text-sm sm:text-base mb-4">Get your permanent QR pass and start your fitness journey today. Walk-in daily or subscribe to a membership plan.</p>
            <div class="flex flex-col gap-2 mb-4">
              <div class="flex justify-between text-xs sm:text-sm">
                <span class="text-mist">Daily Walk-in</span>
                <span class="text-gold font-display">₱65 /visit</span>
              </div>
              <div class="flex justify-between text-xs sm:text-sm">
                <span class="text-mist">Weekly Plan</span>
                <span class="text-gold font-display">₱599 /week</span>
              </div>
              <div class="flex justify-between text-xs sm:text-sm">
                <span class="text-mist">Monthly Plan</span>
                <span class="text-gold font-display">₱1,499 /month</span>
              </div>
            </div>
            <a
              href="#register"
              class="btn-primary inline-block w-full text-center text-sm sm:text-base py-3"
              @click="dismissPromo"
            >
              Register Now
            </a>
            <p class="text-mist text-[9px] sm:text-[10px] mt-3">Open 7 days a week — Calauan, Laguna</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Scroll to Top -->
    <button
      v-show="showScrollTop"
      type="button"
      class="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-40 w-9 h-9 sm:w-12 sm:h-12 bg-gold text-onyx flex items-center justify-center shadow-lg hover:bg-gold-light transition-colors"
      aria-label="Scroll to top"
      @click="scrollToTop"
    >
      <svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
      </svg>
    </button>
  </div>
</template>
