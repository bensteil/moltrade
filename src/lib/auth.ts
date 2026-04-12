import { prisma } from "./db";
import { createHash, randomBytes } from "crypto";

const API_KEY_PREFIX = "mt_";

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString("hex");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function validateApiKey(
  key: string
): Promise<{ id: string; name: string } | null> {
  if (!key.startsWith(API_KEY_PREFIX)) return null;

  const keyHash = hashApiKey(key);

  const agent = await prisma.agent.findFirst({
    where: { isActive: true, apiKeyHash: keyHash },
    select: { id: true, name: true },
  });

  return agent || null;
}

export async function authenticateRequest(
  request: Request
): Promise<{ id: string; name: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const key = authHeader.slice(7);
  return validateApiKey(key);
}
