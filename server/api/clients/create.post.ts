import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getPlanDays, getPlanRate, getPlanSessions, type CustomerType, type MembershipPlanId } from '~/types/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)

  const clientName = String(body?.clientName ?? '').trim()
  const clientEmail = String(body?.clientEmail ?? '').trim()
  const clientPhone = String(body?.clientPhone ?? '').trim()
  const coachName = String(body?.coachName ?? '').trim() || null
  const plan = String(body?.plan ?? '') as MembershipPlanId
  const customerType = String(body?.customerType ?? 'member') as CustomerType
  const paidAmount = body?.paidAmount != null ? Number(body.paidAmount) : null
  const note = String(body?.note ?? '').trim() || null

  if (!clientName) {
    throw createError({ statusCode: 400, statusMessage: 'Client name is required.' })
  }
  if (!clientEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Client email is required.' })
  }
  if (!clientPhone) {
    throw createError({ statusCode: 400, statusMessage: 'Client phone is required.' })
  }
  if (!['daily', 'weekly', 'monthly'].includes(plan)) {
    throw createError({ statusCode: 400, statusMessage: 'Plan must be daily, weekly, or monthly.' })
  }
  if (!['member', 'non_member'].includes(customerType)) {
    throw createError({ statusCode: 400, statusMessage: 'Customer type must be member or non-member.' })
  }

  const totalSessions = getPlanSessions(plan)
  const totalAmount = getPlanRate(plan, customerType)

  const now = new Date()
  const startDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() + getPlanDays(plan))
  const endDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(endDate)

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('client_sessions')
    .insert({
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      coach_name: coachName,
      plan,
      customer_type: customerType,
      total_sessions: totalSessions,
      sessions_used: 0,
      start_date: startDate,
      end_date: endDateStr,
      status: 'active',
      paid_amount: paidAmount != null && !isNaN(paidAmount) ? paidAmount : null,
      note: note ?? (paidAmount != null && !isNaN(paidAmount) ? `Paid ₱${paidAmount} of ₱${totalAmount}` : null),
    })
    .select('*')
    .single()

  if (error) {
    console.error('[Clients] Create error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create client.' })
  }

  const isFullyPaid = paidAmount != null && paidAmount >= totalAmount

  return {
    client: data,
    message: `Client added. ${totalSessions} sessions for ${plan} plan.${isFullyPaid ? ' Fully paid.' : paidAmount != null ? ` ₱${paidAmount} of ₱${totalAmount} paid.` : ' Payment pending.'}`,
  }
})
