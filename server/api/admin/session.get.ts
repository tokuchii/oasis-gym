import { isStaffAuthenticated } from '~/server/utils/auth'

export default defineEventHandler((event) => {
  return { authenticated: isStaffAuthenticated(event) }
})
