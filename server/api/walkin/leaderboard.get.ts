import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

const POINTS_PER_VISIT = 2.5

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('walkin_passes')
    .select('id, pass_code, full_name, email, phone, points')
    .gt('points', 0)
    .order('points', { ascending: false })
    .limit(50)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const leaderboard = (data ?? []).map((row, i) => ({
    rank: i + 1,
    id: row.id,
    passCode: row.pass_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    points: row.points,
    totalVisits: Math.round(row.points / POINTS_PER_VISIT),
  }))

  const totalPoints = leaderboard.reduce((sum, e) => sum + e.points, 0)
  const totalGuests = leaderboard.length
  const topGuest = leaderboard.length > 0 ? leaderboard[0] : null

  return {
    leaderboard,
    stats: {
      totalGuests,
      totalPointsAwarded: totalPoints,
      topGuestName: topGuest?.fullName ?? null,
      topGuestPoints: topGuest?.points ?? 0,
    },
  }
})
