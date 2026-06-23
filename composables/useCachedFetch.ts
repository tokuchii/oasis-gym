import { useOfflineDb } from './useOfflineDb'
import { useOnlineStatus } from './useOnlineStatus'
import { useWriteQueue } from './useWriteQueue'

interface CacheConfig {
  store: string
  label: string
  staleWhileRevalidate?: boolean
}

export function useCachedFetch() {
  const { isOnline } = useOnlineStatus()
  const { put, get, clear } = useOfflineDb()
  const { enqueue } = useWriteQueue()

  async function cachedGet<T>(url: string, opts: { params?: Record<string, string>; cache?: CacheConfig }): Promise<T> {
    if (isOnline.value) {
      try {
        const data = await $fetch<T>(url, { params: opts.params })
        if (opts.cache) {
          const key = opts.params ? JSON.stringify(opts.params) : 'all'
          await put(opts.cache.store, { id: key, data, fetchedAt: Date.now() })
        }
        return data
      } catch {
        // Network error — fall through to cache
      }
    }

    if (opts.cache) {
      const key = opts.params ? JSON.stringify(opts.params) : 'all'
      const cached = await get<{ data: T }>(opts.cache.store, key)
      if (cached) return cached.data
    }

    throw new Error('Offline and no cached data available.')
  }

  async function cachedPost<T>(url: string, body: unknown, opts: { label: string; cacheInvalidates?: string[] }): Promise<T> {
    if (isOnline.value) {
      try {
        const data = await $fetch<T>(url, { method: 'POST', body })
        if (opts.cacheInvalidates) {
          for (const store of opts.cacheInvalidates) {
            await clear(store)
          }
        }
        return data
      } catch (err) {
        await enqueue({ url, method: 'POST', body, label: opts.label })
        throw err
      }
    }

    await enqueue({ url, method: 'POST', body, label: opts.label })
    throw new Error('Queued for sync')
  }

  return { cachedGet, cachedPost }
}
