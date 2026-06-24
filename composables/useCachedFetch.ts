import { useOfflineDb } from './useOfflineDb'
import { useOnlineStatus } from './useOnlineStatus'
import { useWriteQueue } from './useWriteQueue'
import { getApiBase } from './useApiBase'

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err && typeof err === 'object') {
    const msg = String((err as { message?: string }).message ?? '').toLowerCase()
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed') || msg.includes('load failed')) return true
    if ('status' in err) return false
  }
  return false
}

interface CacheConfig {
  store: string
  label: string
}

export function useCachedFetch() {
  const { isOnline } = useOnlineStatus()
  const { put, get, clear } = useOfflineDb()
  const { enqueue } = useWriteQueue()

  function fullUrl(url: string): string {
    const base = getApiBase()
    return base ? `${base}${url}` : url
  }

  async function cachedGet<T>(url: string, opts: { params?: Record<string, string>; cache?: CacheConfig }): Promise<T> {
    if (isOnline.value) {
      try {
        const data = await $fetch<T>(fullUrl(url), { params: opts.params })
        if (opts.cache) {
          const key = opts.params ? JSON.stringify(opts.params) : 'all'
          await put(opts.cache.store, { id: key, data, fetchedAt: Date.now() })
        }
        return data
      } catch (err) {
        if (!isNetworkError(err)) throw err
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
        const data = await $fetch<T>(fullUrl(url), { method: 'POST', body })
        if (opts.cacheInvalidates) {
          for (const store of opts.cacheInvalidates) {
            await clear(store)
          }
        }
        return data
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ url, method: 'POST', body, label: opts.label })
        }
        throw err
      }
    }

    await enqueue({ url, method: 'POST', body, label: opts.label })
    throw new Error('Queued for sync')
  }

  return { cachedGet, cachedPost }
}
