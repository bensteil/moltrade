import { prisma } from "@/lib/db";
import { generateApiKey, hashApiKey } from "@/lib/auth";

export async function POST(request: Request) {
  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_json", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return Response.json(
      { error: { code: "validation_error", message: "name is required" } },
      { status: 400 }
    );
  }

  const trimmedName = name.trim();

  const existing = await prisma.agent.findUnique({
    where: { name: trimmedName },
  });

  if (existing) {
    return Response.json(
      {
        error: {
          code: "name_taken",
          message: `Agent name "${trimmedName}" is already taken`,
        },
      },
      { status: 409 }
    );
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);

  const agent = await prisma.agent.create({
    data: {
      name: trimmedName,
      description: description ?? null,
      apiKeyHash,
      portfolio: {
        create: { cash: 100_000 },
      },
    },
    select: { id: true, name: true },
  });

  return Response.json({ agent, apiKey }, { status: 201 });
}
