const isOnline = ref(true)
const wasOffline = ref(false)

let initialized = false

export function useOnlineStatus() {
  if (!initialized && import.meta.client) {
    isOnline.value = navigator.onLine
    const goOnline = () => {
      isOnline.value = true
      wasOffline.value = true
      setTimeout(() => { wasOffline.value = false }, 3000)
    }
    const goOffline = () => { isOnline.value = false }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    initialized = true
  }
  return { isOnline, wasOffline }
}
