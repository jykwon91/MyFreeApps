import type { StandaloneMainProps } from "../../types/standalone-main-props";

/**
 * The one `<main>` landmark of a screen shown with no shell around it: a
 * signed-out page (login, register, the support page, 404) or a screen an
 * app shows in place of its shell (a guard's error or setup step, a crash
 * fallback). The shells (AppShell, GuestShell) own the `<main>` everywhere
 * else, so never render this inside one.
 *
 * It scrolls its content itself, as the shells' `<main>` does: most apps lock
 * the body to the viewport (`overflow: hidden`, `#root` 100% tall), so a page
 * taller than the screen would otherwise be cut off. In an app that doesn't
 * (MBK), `h-full` has no height to fill, so the main grows with its page and
 * the window scrolls instead. Needs no router, so an error boundary above the
 * router can use it; for routes, use StandaloneLayout, which also brings both
 * back to the top on a new path.
 */
export default function StandaloneMain({ children, ref }: StandaloneMainProps) {
  return (
    <main ref={ref} className="h-full overflow-y-auto">
      {children}
    </main>
  );
}
