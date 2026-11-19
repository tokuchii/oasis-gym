export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'oasis-theme'
const DARK_COLOR = '#121212'
const LIGHT_COLOR = '#FFFFFF'

const theme = ref<Theme>('dark')
const followsSystem = ref(true)
let initialized = false
let transitionTimer: ReturnType<typeof setTimeout> | null = null

interface ViewTransitionLike {
  ready: Promise<void>
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransitionLike
}

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function storedTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function updateThemeColor(next: Theme) {
  if (!import.meta.client) return
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = next === 'light' ? LIGHT_COLOR : DARK_COLOR
}

function applyTheme(next: Theme) {
  if (!import.meta.client) return
  document.documentElement.setAttribute('data-theme', next)
  updateThemeColor(next)
}

function animateThemeColors() {
  if (!import.meta.client) return
  const root = document.documentElement
  root.classList.add('theme-transitioning')
  if (transitionTimer) window.clearTimeout(transitionTimer)
  transitionTimer = window.setTimeout(() => {
    root.classList.remove('theme-transitioning')
    transitionTimer = null
  }, 360)
}

export function useTheme() {
  if (!initialized && import.meta.client) {
    const current = document.documentElement.getAttribute('data-theme')
    theme.value = current === 'light' || current === 'dark' ? current : (storedTheme() ?? systemTheme())
    followsSystem.value = storedTheme() === null
    applyTheme(theme.value)

    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if (!followsSystem.value) return
      animateThemeColors()
      theme.value = systemTheme()
      applyTheme(theme.value)
    }
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange)
    else media.addListener(onChange)

    initialized = true
  }

  const isLight = computed(() => theme.value === 'light')

  function setTheme(next: Theme, persist = true) {
    theme.value = next
    applyTheme(next)
    if (persist) {
      followsSystem.value = false
      try {
        window.localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Storage may be unavailable (private mode); the in-memory theme still applies.
      }
    }
  }

  function toggle(event?: MouseEvent) {
    const next: Theme = theme.value === 'light' ? 'dark' : 'light'

    if (!import.meta.client) {
      theme.value = next
      return
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const doc = document as ViewTransitionDocument

    if (prefersReducedMotion) {
      setTheme(next)
      return
    }

    if (!doc.startViewTransition) {
      animateThemeColors()
      setTheme(next)
      return
    }

    const target = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
    const rect = target?.getBoundingClientRect()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    )

    try {
      const transition = doc.startViewTransition(async () => {
        setTheme(next)
        await nextTick()
      })
      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${radius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 480,
              easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
              pseudoElement: '::view-transition-new(root)',
            } as KeyframeAnimationOptions,
          )
        })
        .catch(() => {
          // If the transition is interrupted, the theme has still been applied.
        })
    } catch {
      animateThemeColors()
      setTheme(next)
    }
  }

  return { theme, isLight, setTheme, toggle }
}
