interface CacheEntry<T> {
  data?: T
  timestamp?: number
}

const DEFAULT_TTL_MS = 60_000

function isFresh<T>(entry: CacheEntry<T> | undefined, ttlMs: number): entry is CacheEntry<T> & { data: T; timestamp: number } {
  return Boolean(entry?.data !== undefined && entry.timestamp !== undefined && Date.now() - entry.timestamp < ttlMs)
}

export function createRequestCache<T>(ttlMs = DEFAULT_TTL_MS) {
  const entries = new Map<string, CacheEntry<T>>()

  return {
    get(key: string): T | null {
      const entry = entries.get(key)
      return isFresh(entry, ttlMs) ? entry.data : null
    },

    async load(key: string, signal: AbortSignal, loader: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const existing = entries.get(key)
      if (isFresh(existing, ttlMs)) return existing.data
      if (signal.aborted) throw new DOMException('Request aborted', 'AbortError')

      const data = await loader(signal)
      if (signal.aborted) throw new DOMException('Request aborted', 'AbortError')
      entries.set(key, { data, timestamp: Date.now() })
      return data
    },

    invalidate(key: string): void {
      entries.delete(key)
    },
  }
}
