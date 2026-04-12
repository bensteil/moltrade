import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10)
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10)
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
