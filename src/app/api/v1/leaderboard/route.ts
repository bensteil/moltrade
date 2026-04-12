import type { NextRequest } from 'next/server'
import { getLeaderboard } from '@/lib/leaderboard/metrics'

export async function GET(request: NextRequest) {
  const sortBy = request.nextUrl.searchParams.get('sortBy') ?? 'totalReturn'
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10)

  try {
    const leaderboard = await getLeaderboard(sortBy, limit)
    return Response.json(leaderboard)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
