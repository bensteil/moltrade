import { prisma } from "./db";
import bcryptjs from "bcryptjs";
import { randomBytes } from "crypto";

const API_KEY_PREFIX = "mt_";

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString("hex");
}

export async function hashApiKey(key: string): Promise<string> {
  return bcryptjs.hash(key, 12);
}

export async function validateApiKey(
  key: string
): Promise<{ id: string; name: string } | null> {
  if (!key.startsWith(API_KEY_PREFIX)) return null;

  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: { id: true, name: true, apiKeyHash: true },
  });

  for (const agent of agents) {
    const match = await bcryptjs.compare(key, agent.apiKeyHash);
    if (match) return { id: agent.id, name: agent.name };
  }

  return null;
}

export async function authenticateRequest(
  request: Request
): Promise<{ id: string; name: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const key = authHeader.slice(7);
  return validateApiKey(key);
}
