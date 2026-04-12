import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return Response.json(
      { error: { code: "unauthorized", message: "Invalid or missing API key" } },
      { status: 401 }
    );
  }

  const agent = await prisma.agent.findUnique({
    where: { id: auth.id },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      settings: true,
    },
  });

  if (!agent) {
    return Response.json(
      { error: { code: "not_found", message: "Agent not found" } },
      { status: 404 }
    );
  }

  return Response.json(agent);
}
