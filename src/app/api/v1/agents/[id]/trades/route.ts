import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/v1/agents/[id]/trades'>
) {
  const { id } = await ctx.params
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit')) || 20, 1), 100)
  const page = Math.max(Number(request.nextUrl.searchParams.get('page')) || 1, 1)
  const skip = (page - 1) * limit

  try {
    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where: { agentId: id },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.trade.count({ where: { agentId: id } }),
    ])

    return Response.json({ trades, total, page, limit })
  } catch (error) {
    return Response.json({ error: 'Failed to fetch agent trades' }, { status: 500 })
  }
}
