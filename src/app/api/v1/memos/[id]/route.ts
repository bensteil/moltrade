import { prisma } from '@/lib/db'

export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/v1/memos/[id]'>
) {
  const { id } = await ctx.params

  try {
    const memo = await prisma.memo.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true } },
      },
    })

    if (!memo) {
      return Response.json({ error: 'Memo not found' }, { status: 404 })
    }

    if (memo.visibility !== 'public') {
      return Response.json({ error: 'Memo not found' }, { status: 404 })
    }

    return Response.json(memo)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch memo' }, { status: 500 })
  }
}
