import { requireStaff } from '~/server/utils/auth'
import { isValidPassCodeFormat, normalizePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, serializePass } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const query = getQuery(event)
  const code = query.code ? normalizePassCode(String(query.code)) : ''
  const phone = String(query.phone ?? '').trim()
  const name = String(query.name ?? '').trim()

  if (!code && !phone && !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provide a pass code, phone number, or name to search.',
    })
  }

  const supabase = useSupabaseAdmin()
  let request = supabase.from('walkin_passes').select('*')

  if (code) {
    if (!isValidPassCodeFormat(code)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid pass code format.' })
    }
    request = request.eq('pass_code', code)
  } else if (phone) {
    request = request.ilike('phone', `%${phone}%`).eq('visit_date', getVisitDateManila())
  } else {
    request = request.ilike('full_name', `%${name}%`).eq('visit_date', getVisitDateManila())
  }

  const { data, error } = await request.order('created_at', { ascending: false }).limit(10)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    results: (data ?? []).map(serializePass),
  }
})
