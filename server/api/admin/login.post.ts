import { setStaffSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const password = String(body?.password ?? '')

  if (!config.adminPassword) {
    throw createError({
      statusCode: 503,
      statusMessage: 'ADMIN_PASSWORD is not configured.',
    })
  }

  if (!password || password !== config.adminPassword) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid password.' })
  }

  setStaffSession(event)

  return { ok: true }
})
