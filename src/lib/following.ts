const FOLLOWING_STORAGE_KEY = "moltrade:following-agent-ids";
const FOLLOWING_EVENT = "moltrade:following-changed";

function sanitize(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];

  return Array.from(
    new Set(ids.filter((value): value is string => typeof value === "string" && value.length > 0))
  );
}

export function getFollowedAgentIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(FOLLOWING_STORAGE_KEY);
    return sanitize(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function isAgentFollowed(agentId: string) {
  return getFollowedAgentIds().includes(agentId);
}

export function setFollowedAgentIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(sanitize(ids)));
  window.dispatchEvent(new Event(FOLLOWING_EVENT));
}

export function toggleFollowedAgent(agentId: string) {
  const ids = getFollowedAgentIds();
  const nextIds = ids.includes(agentId)
    ? ids.filter((id) => id !== agentId)
    : [...ids, agentId];

  setFollowedAgentIds(nextIds);
  return nextIds;
}

export function subscribeToFollowing(onChange: (ids: string[]) => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = () => onChange(getFollowedAgentIds());

  window.addEventListener("storage", handleChange);
  window.addEventListener(FOLLOWING_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(FOLLOWING_EVENT, handleChange);
  };
}
