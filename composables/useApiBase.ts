export function getApiBase(): string {
  if (import.meta.client && typeof window !== 'undefined') {
    const isCapacitor = !!(window as Record<string, unknown>).Capacitor
    if (isCapacitor) {
      return 'https://oasis-gym.vercel.app'
    }
  }
  return ''
}
