import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const receiptUrl = String(body?.url ?? '').trim()

  if (!receiptUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Receipt URL is required.' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .storage
    .from('oasis-gym')
    .createSignedUrl(receiptUrl, 3600)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: `Failed to generate signed URL: ${error.message}` })
  }

  return { signedUrl: data.signedUrl }
})
