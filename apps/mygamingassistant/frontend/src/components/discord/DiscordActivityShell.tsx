import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ThemeToggle } from "@platform/ui";
import OpenInBrowserButton from "@/components/discord/OpenInBrowserButton";

interface DiscordActivityShellProps {
  children: ReactNode;
}

// Discord sets --discord-safe-area-inset-* on mobile (notches, home bar); env()
// covers iOS and local testing outside Discord.
const SAFE_AREA_PADDING: CSSProperties = {
  paddingTop: "var(--discord-safe-area-inset-top, env(safe-area-inset-top, 0px))",
  paddingRight: "var(--discord-safe-area-inset-right, env(safe-area-inset-right, 0px))",
  paddingBottom: "var(--discord-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))",
  paddingLeft: "var(--discord-safe-area-inset-left, env(safe-area-inset-left, 0px))",
};

/**
 * The app's frame inside the Discord Activity, in place of the website's
 * sidebar shell. Activities run in small frames — a voice channel's activity
 * panel, a phone, a picture-in-picture tile — so navigation is one slim bar:
 * "Games" back to the game picker, the theme toggle, and "Open in browser" for
 * what only the website does (signing in, adding lineups, reading screenshots).
 * Pages keep their own back links. The bar hides when the frame is too short to
 * spare it (picture-in-picture), leaving the page the whole tile.
 */
export default function DiscordActivityShell({ children }: DiscordActivityShellProps) {
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);

  // Pages scroll inside this frame rather than the window, which the router's
  // ScrollRestoration doesn't reach: open each new page at its top instead of
  // wherever the previous page was scrolled to.
  useLayoutEffect(() => {
    if (contentRef.current !== null) contentRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground" style={SAFE_AREA_PADDING}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 [@media(max-height:300px)]:hidden">
        <nav aria-label="Main navigation" className="min-w-0">
          <NavLink
            to="/"
            end
            className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-md px-2 text-sm font-semibold transition-opacity hover:opacity-80"
          >
            <span aria-hidden="true" className="text-base leading-none">
              🎮
            </span>
            <span className="truncate">Games</span>
          </NavLink>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <OpenInBrowserButton />
        </div>
      </header>
      <div ref={contentRef} data-testid="activity-content" className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
