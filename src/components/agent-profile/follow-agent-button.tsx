"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  isAgentFollowed,
  subscribeToFollowing,
  toggleFollowedAgent,
} from "@/lib/following";

export function FollowAgentButton({ agentId }: { agentId: string }) {
  const [isFollowed, setIsFollowed] = useState(false);

  useEffect(() => {
    setIsFollowed(isAgentFollowed(agentId));
    return subscribeToFollowing((ids) => setIsFollowed(ids.includes(agentId)));
  }, [agentId]);

  return (
    <button
      type="button"
      onClick={() => {
        const ids = toggleFollowedAgent(agentId);
        setIsFollowed(ids.includes(agentId));
      }}
      className={cn(
        "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
        isFollowed
          ? "border border-card-border bg-card-hover text-foreground hover:bg-card"
          : "bg-primary text-white hover:bg-primary-hover"
      )}
    >
      {isFollowed ? "Unfollow" : "Follow"}
    </button>
  );
}
