import { useOfflineDb } from './useOfflineDb'
import { useOnlineStatus } from './useOnlineStatus'
import { useToast } from './useToast'
import { getApiBase } from './useApiBase'

interface QueuedWrite {
  id?: number
  url: string
  method: string
  body: unknown
  createdAt: string
  label: string
  retryCount?: number
}

const syncing = ref(false)
const queueLength = ref(0)
const MAX_RETRIES = 3

let autoSyncInitialized = false

async function refreshQueueLength() {
  const { getAll } = useOfflineDb()
  const queue = await getAll<QueuedWrite>('writeQueue')
  queueLength.value = queue.length
}

export function useWriteQueue() {
  const { getAll, remove, put, clear } = useOfflineDb()
  const { isOnline } = useOnlineStatus()
  const toast = useToast()

  if (!autoSyncInitialized && import.meta.client) {
    watch(isOnline, (online) => {
      if (online) {
        nextTick(() => sync())
      }
    })
    autoSyncInitialized = true
    nextTick(() => sync())
  }

  async function enqueue(entry: Omit<QueuedWrite, 'id' | 'createdAt' | 'retryCount'>) {
    const { put: dbPut } = useOfflineDb()
    await dbPut('writeQueue', { ...entry, createdAt: new Date().toISOString(), retryCount: 0 })
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
      if ((item.retryCount ?? 0) >= MAX_RETRIES) {
        if (item.id) await remove('writeQueue', item.id)
        failed++
        continue
      }
      try {
        const base = getApiBase()
        const fullUrl = base ? `${base}${item.url}` : item.url
        const api = useApi()
        await api(fullUrl, { method: item.method as 'POST' | 'GET' | 'PUT' | 'DELETE', body: item.body })
        if (item.id) await remove('writeQueue', item.id)
        succeeded++
      } catch {
        if (item.id) {
          await put('writeQueue', { ...item, retryCount: (item.retryCount ?? 0) + 1 })
        }
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
