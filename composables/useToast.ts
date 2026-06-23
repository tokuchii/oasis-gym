import { ref } from 'vue'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  timeout: ReturnType<typeof setTimeout>
}

const toasts = ref<Toast[]>([])
let nextId = 0

export function useToast() {
  function show(type: Toast['type'], message: string, duration = 4000) {
    const id = nextId++
    const timeout = setTimeout(() => remove(id), duration)
    toasts.value.push({ id, type, message, timeout })
  }

  function remove(id: number) {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx !== -1) {
      clearTimeout(toasts.value[idx].timeout)
      toasts.value.splice(idx, 1)
    }
  }

  function success(message: string, duration?: number) { show('success', message, duration) }
  function error(message: string, duration?: number) { show('error', message, duration ?? 5000) }
  function warning(message: string, duration?: number) { show('warning', message, duration) }
  function info(message: string, duration?: number) { show('info', message, duration) }

  return { toasts, show, remove, success, error, warning, info }
}
