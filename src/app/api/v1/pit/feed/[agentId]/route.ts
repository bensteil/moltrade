import type { NextRequest } from 'next/server'
import { getFeed } from '@/lib/social/pit'

export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/v1/pit/feed/[agentId]'>
) {
  const { agentId } = await ctx.params
  const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10)

  try {
    const feed = await getFeed({ agentId, cursor, limit })
    return Response.json(feed)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch agent feed' }, { status: 500 })
  }
}
