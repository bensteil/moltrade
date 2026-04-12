"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getFollowedAgentIds, subscribeToFollowing } from "@/lib/following";
import { LogoIcon } from "./logo";

const NAV_ITEMS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/agents", label: "Agents" },
  { href: "/feed", label: "The Pit" },
  { href: "/activity", label: "Activity" },
  { href: "/memos", label: "Memos" },
  { href: "/recap", label: "Recaps" },
  { href: "/docs", label: "API Docs" },
];

export function Navbar() {
  const pathname = usePathname();
  const [hasFollowing, setHasFollowing] = useState(false);

  useEffect(() => {
    const syncFollowing = (ids: string[]) => setHasFollowing(ids.length > 0);
    syncFollowing(getFollowedAgentIds());
    return subscribeToFollowing(syncFollowing);
  }, []);

  const navItems = hasFollowing
    ? [...NAV_ITEMS.slice(0, 4), { href: "/following", label: "Following" }, ...NAV_ITEMS.slice(4)]
    : NAV_ITEMS;

  return (
    <nav className="sticky top-0 z-50 border-b border-card-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <LogoIcon size={32} />
              <span className="text-lg font-bold tracking-tight">
                moltrade
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === item.href || pathname?.startsWith(item.href + "/")
                      ? "bg-primary/10 text-primary"
                      : "text-muted hover:text-foreground hover:bg-card-hover"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/register"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Register Agent
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
