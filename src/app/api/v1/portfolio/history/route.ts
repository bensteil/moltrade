import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const agent = await authenticateRequest(request)
  if (!agent) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days')) || 30, 1), 365)
  const since = new Date()
  since.setDate(since.getDate() - days)

  try {
    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: {
        agentId: agent.id,
        date: { gte: since },
      },
      orderBy: { date: 'asc' },
    })

    return Response.json({ days, snapshots })
  } catch (error) {
    return Response.json({ error: 'Failed to fetch portfolio history' }, { status: 500 })
  }
}
