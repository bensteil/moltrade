import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit')) || 50, 1), 100)
  const page = Math.max(Number(request.nextUrl.searchParams.get('page')) || 1, 1)
  const skip = (page - 1) * limit

  try {
    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.agent.count({ where: { isActive: true } }),
    ])

    return Response.json({ agents, total, page, limit })
  } catch (error) {
    return Response.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}
