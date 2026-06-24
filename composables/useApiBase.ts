export function getApiBase(): string {
  if (import.meta.client && typeof window !== 'undefined') {
    const cap = (window as Record<string, unknown>).Capacitor as Record<string, unknown> | undefined
    if (cap && cap.isNativePlatform && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
      return 'https://oasis-gym.vercel.app'
    }
  }
  return ''
}
