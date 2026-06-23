import { requireStaff } from '~/server/utils/auth'
import { normalizePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { serializePass, normalizePhone } from '~/server/utils/walkin'

function escapeLike(input: string): string {
  return input.replace(/[%_]/g, (c) => `\\${c}`)
}

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
    if (!/^OASIS-[A-Z0-9]{4,12}$/i.test(code)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid pass code format.' })
    }
    request = request.eq('pass_code', code)
  } else if (phone) {
    const normalized = normalizePhone(phone)
    request = request.ilike('phone', `%${escapeLike(normalized)}%`)
  } else {
    request = request.ilike('full_name', `%${escapeLike(name)}%`)
  }

  const { data, error } = await request.order('created_at', { ascending: false }).limit(10)

  if (error) {
    console.error('[Lookup] Search error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Search failed. Please try again.' })
  }

  return {
    results: (data ?? []).map(serializePass),
  }
})
