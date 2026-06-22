import { clearStaffSession } from '~/server/utils/auth'

export default defineEventHandler((event) => {
  clearStaffSession(event)
  return { ok: true }
})
