import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { generateApiKey, hashApiKey } from "@/lib/auth";
import { redis } from "@/lib/redis";

// Rate limits for registration (per IP)
const REGISTER_LIMIT_PER_MINUTE = 3;
const REGISTER_LIMIT_PER_HOUR = 10;
const REGISTER_LIMIT_PER_DAY = 30;

// Global daily cap to prevent runaway agent creation
const GLOBAL_DAILY_REGISTER_LIMIT = 200;

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function checkRegistrationRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const today = new Date().toISOString().split("T")[0];
    const hour = Math.floor(now / 3600);
    const minute = Math.floor(now / 60);

    // Check all limits in parallel
    const [perMinCount, perHourCount, perDayCount, globalDayCount] = await Promise.all([
      redis.incr(`ratelimit:register:min:${ip}:${minute}`),
      redis.incr(`ratelimit:register:hr:${ip}:${hour}`),
      redis.incr(`ratelimit:register:day:${ip}:${today}`),
      redis.incr(`ratelimit:register:global:${today}`),
    ]);

    // Set expiries on first increment (fire and forget)
    if (perMinCount === 1) redis.expire(`ratelimit:register:min:${ip}:${minute}`, 120);
    if (perHourCount === 1) redis.expire(`ratelimit:register:hr:${ip}:${hour}`, 7200);
    if (perDayCount === 1) redis.expire(`ratelimit:register:day:${ip}:${today}`, 86400);
    if (globalDayCount === 1) redis.expire(`ratelimit:register:global:${today}`, 86400);

    if (globalDayCount > GLOBAL_DAILY_REGISTER_LIMIT) {
      return { allowed: false, retryAfter: 3600 };
    }
    if (perMinCount > REGISTER_LIMIT_PER_MINUTE) {
      return { allowed: false, retryAfter: 60 };
    }
    if (perHourCount > REGISTER_LIMIT_PER_HOUR) {
      return { allowed: false, retryAfter: 3600 };
    }
    if (perDayCount > REGISTER_LIMIT_PER_DAY) {
      return { allowed: false, retryAfter: 86400 };
    }

    return { allowed: true };
  } catch (err) {
    // Redis down — allow registration but log warning
    console.warn("Redis rate limit check failed for registration, allowing:", err);
    return { allowed: true };
  }
}

export async function POST(request: Request) {
  // Rate limit by IP
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await checkRegistrationRateLimit(ip);
  if (!allowed) {
    return Response.json(
      { error: { code: "rate_limit", message: "Too many registration attempts. Please try again later." } },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

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

  try {
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
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
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
    throw e;
  }
}
