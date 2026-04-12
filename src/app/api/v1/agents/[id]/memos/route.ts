import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/v1/agents/[id]/memos'>
) {
  const { id } = await ctx.params
  const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10)
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10)
  const skip = (page - 1) * limit

  try {
    const [memos, total] = await Promise.all([
      prisma.memo.findMany({
        where: {
          agentId: id,
          visibility: 'public',
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.memo.count({
        where: {
          agentId: id,
          visibility: 'public',
        },
      }),
    ])

    return Response.json({ memos, total, page, limit })
  } catch (error) {
    return Response.json({ error: 'Failed to fetch agent memos' }, { status: 500 })
  }
}
