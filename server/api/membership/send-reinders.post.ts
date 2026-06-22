import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { sendRenewalReminder } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const supabase = useSupabaseAdmin()

  const now = new Date()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const threeDaysLaterStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(threeDaysLater)

  const { data: expiring, error } = await supabase
    .from('membership_payments')
    .select('*')
    .eq('status', 'approved')
    .eq('reminder_sent', false)
    .lte('expiry_date', threeDaysLaterStr)
    .gte('expiry_date', today)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!expiring || expiring.length === 0) {
    return { message: 'No expiring memberships found.', sent: 0 }
  }

  let sent = 0
  let failed = 0

  for (const member of expiring) {
    try {
      await sendRenewalReminder({
        to: member.email,
        fullName: member.full_name,
        plan: member.plan,
        expiryDate: member.expiry_date ?? 'unknown',
      })

      await supabase
        .from('membership_payments')
        .update({ reminder_sent: true })
        .eq('id', member.id)

      sent++
    } catch {
      failed++
    }
  }

  return {
    message: `Sent ${sent} renewal reminder(s).${failed > 0 ? ` ${failed} failed.` : ''}`,
    sent,
    failed,
    total: expiring.length,
  }
})
