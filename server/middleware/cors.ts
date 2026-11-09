const DEFAULT_ALLOWED_ORIGINS = [
  'https://oasis-gym.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://localhost',
  'capacitor://localhost',
]

function getAllowedOrigins(): Set<string> {
  const extra = (useRuntimeConfig().corsOrigins || '')
    .split(',')
    .map((o: string) => o.trim())
    .filter(Boolean)
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra])
}

export default defineEventHandler((event) => {
  if (!getRequestURL(event).pathname.startsWith('/api')) return

  const requestOrigin = getRequestHeader(event, 'origin')
  const allowed = requestOrigin ? getAllowedOrigins().has(requestOrigin) : false

  if (getMethod(event) === 'OPTIONS') {
    setResponseStatus(event, 204)
    setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization')
    setResponseHeader(event, 'Access-Control-Max-Age', '86400')
    if (allowed) {
      setResponseHeader(event, 'Access-Control-Allow-Origin', requestOrigin)
      setResponseHeader(event, 'Access-Control-Allow-Credentials', 'true')
      setResponseHeader(event, 'Vary', 'Origin')
    }
    return ''
  }

  if (allowed) {
    setResponseHeader(event, 'Access-Control-Allow-Origin', requestOrigin)
    setResponseHeader(event, 'Access-Control-Allow-Credentials', 'true')
    setResponseHeader(event, 'Vary', 'Origin')
  }
})
