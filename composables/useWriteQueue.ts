import { useOfflineDb } from './useOfflineDb'
import { useOnlineStatus } from './useOnlineStatus'
import { useToast } from './useToast'

interface QueuedWrite {
  id?: number
  url: string
  method: string
  body: unknown
  createdAt: string
  label: string
}

const syncing = ref(false)
const queueLength = ref(0)

async function refreshQueueLength() {
  const { getAll } = useOfflineDb()
  const queue = await getAll<QueuedWrite>('writeQueue')
  queueLength.value = queue.length
}

export function useWriteQueue() {
  const { getAll, remove, clear } = useOfflineDb()
  const { isOnline } = useOnlineStatus()
  const toast = useToast()

  async function enqueue(entry: Omit<QueuedWrite, 'id' | 'createdAt'>) {
    const { put } = useOfflineDb()
    await put('writeQueue', { ...entry, createdAt: new Date().toISOString() })
    await refreshQueueLength()
    toast.warning(`Saved offline: ${entry.label}`)
  }

  async function sync() {
    if (syncing.value || !isOnline.value) return
    const queue = await getAll<QueuedWrite>('writeQueue')
    if (queue.length === 0) return

    syncing.value = true
    let succeeded = 0
    let failed = 0

    for (const item of queue) {
      try {
        await $fetch(item.url, { method: item.method as 'POST' | 'GET' | 'PUT' | 'DELETE', body: item.body })
        if (item.id) await remove('writeQueue', item.id)
        succeeded++
      } catch {
        failed++
      }
    }

    syncing.value = false
    await refreshQueueLength()

    if (succeeded > 0) toast.success(`Synced ${succeeded} offline operation(s).`)
    if (failed > 0) toast.error(`${failed} operation(s) failed to sync.`)
  }

  async function clearQueue() {
    await clear('writeQueue')
    await refreshQueueLength()
  }

  return { enqueue, sync, syncing, queueLength, clearQueue, refreshQueueLength }
}
