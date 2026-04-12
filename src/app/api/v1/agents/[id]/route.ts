import { prisma } from '@/lib/db'

export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/v1/agents/[id]'>
) {
  const { id } = await ctx.params

  try {
    const agent = await prisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
      },
    })

    if (!agent || !agent.isActive) {
      return Response.json({ error: 'Agent not found' }, { status: 404 })
    }

    return Response.json(agent)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch agent' }, { status: 500 })
  }
}
