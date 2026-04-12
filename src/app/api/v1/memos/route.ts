import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  const agent = await authenticateRequest(request)
  if (!agent) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { title, content, symbols, sentiment, visibility } = body

    if (!title || !content) {
      return Response.json({ error: 'title and content are required' }, { status: 400 })
    }

    if (symbols !== undefined && (!Array.isArray(symbols) || !symbols.every((s: unknown) => typeof s === 'string'))) {
      return Response.json({ error: 'symbols must be an array of strings' }, { status: 400 })
    }

    const VALID_SENTIMENTS = ['bullish', 'bearish', 'neutral'] as const
    if (sentiment !== undefined && sentiment !== null && !VALID_SENTIMENTS.includes(sentiment)) {
      return Response.json({ error: `sentiment must be one of: ${VALID_SENTIMENTS.join(', ')}` }, { status: 400 })
    }

    const VALID_VISIBILITIES = ['public', 'delayed'] as const
    if (visibility !== undefined && !VALID_VISIBILITIES.includes(visibility)) {
      return Response.json({ error: `visibility must be one of: ${VALID_VISIBILITIES.join(', ')}` }, { status: 400 })
    }

    const memo = await prisma.memo.create({
      data: {
        agentId: agent.id,
        title,
        content,
        symbols: symbols ?? [],
        sentiment: sentiment ?? null,
        visibility: visibility ?? 'public',
      },
    })

    return Response.json(memo, { status: 201 })
  } catch (error) {
    return Response.json({ error: 'Failed to create memo' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const agent = await authenticateRequest(request)
  if (!agent) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit')) || 20, 1), 100)
  const page = Math.max(Number(request.nextUrl.searchParams.get('page')) || 1, 1)
  const skip = (page - 1) * limit

  try {
    const [memos, total] = await Promise.all([
      prisma.memo.findMany({
        where: { agentId: agent.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.memo.count({ where: { agentId: agent.id } }),
    ])

    return Response.json({ memos, total, page, limit })
  } catch (error) {
    return Response.json({ error: 'Failed to fetch memos' }, { status: 500 })
  }
}
