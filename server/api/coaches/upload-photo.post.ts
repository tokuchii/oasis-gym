import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  const file = formData.find((f) => f.name === 'photo')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'No photo provided' })
  }

  const maxSize = 5 * 1024 * 1024
  if (file.data.length > maxSize) {
    throw createError({ statusCode: 400, statusMessage: 'Photo must be under 5MB' })
  }

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type ?? '')) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG, PNG, or WebP images are accepted' })
  }

  const ext = file.filename?.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filePath = `coach-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const supabase = useSupabaseAdmin()

  const { error: uploadError } = await supabase.storage
    .from('oasis-gym')
    .upload(filePath, file.data, {
      contentType: file.type ?? 'image/jpeg',
    })

  if (uploadError) {
    throw createError({ statusCode: 500, statusMessage: `Failed to upload photo: ${uploadError.message}` })
  }

  return { photoUrl: filePath }
})
