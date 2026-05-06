import type { ReactNode } from "react";

interface ActiveSessionLayoutProps {
  /** Page-level header (compact form when shown above the split). */
  header: ReactNode;
  /** Resume preview — left column on desktop. The document being edited. */
  draft: ReactNode;
  /** Suggestion + completion + side controls — right column on desktop. */
  controls: ReactNode;
}

/**
 * Two-column viewport-height split for an in-progress refinement session.
 *
 * Editor-and-preview pattern: the resume (subject of editing) takes the
 * left column; the suggestion / action controls take the right. Both
 * columns are independently scrollable inside a fixed-height container
 * so the resume stays visible while the user works through suggestions.
 *
 * Heights:
 *   - Outer container is bounded by `h-[calc(100dvh-7rem)]` so it sits
 *     under the AppShell header (~3.5rem) and the page padding without
 *     producing body-level scroll. ``dvh`` follows mobile chrome
 *     correctly.
 *   - Both columns are `min-h-0 overflow-y-auto` — the canonical
 *     "scrollable child of a flex column" recipe. Without `min-h-0`
 *     flex children grow to content height and the inner scroll
 *     gets bypassed.
 *
 * Below `lg`, the split collapses to a normal vertical stack — phones
 * and narrow tablets see header → draft → controls in document flow.
 */
export default function ActiveSessionLayout({
  header,
  draft,
  controls,
}: ActiveSessionLayoutProps) {
  return (
    <main className="p-4 sm:p-6 flex flex-col gap-4 lg:h-[calc(100dvh-7rem)] max-w-screen-2xl mx-auto">
      <div className="shrink-0">{header}</div>
      <div className="flex-1 min-h-0 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-h-0 flex flex-col">{draft}</div>
        <div className="min-h-0 flex flex-col">{controls}</div>
      </div>
    </main>
  );
}
