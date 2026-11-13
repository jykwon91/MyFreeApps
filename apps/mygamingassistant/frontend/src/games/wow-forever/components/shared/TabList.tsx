import clsx from "clsx";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { TAB_LIST_LAYOUTS } from "@/games/wow-forever/data/shared/tabListLayouts";
import { scrollIntoRow } from "@/games/wow-forever/lib/shared/scrollIntoRow";
import { tabId, tabPanelId } from "@/games/wow-forever/lib/shared/tabIds";
import { tabAfterKey } from "@/games/wow-forever/lib/shared/tabKeyNavigation";
import type { TabListLayout } from "@/games/wow-forever/types/shared/tabListLayout";

interface TabListProps<T extends string> {
  tabs: readonly T[];
  labels: Readonly<Record<T, string>>;
  current: T;
  onSelect: (tab: T) => void;
  /** What the row of tabs is, for screen readers. */
  label: string;
  /** Shared with the panel, which takes `tabPanelId(idPrefix)` and is labelled by `tabId(idPrefix, current)`. */
  idPrefix: string;
  layout: TabListLayout;
}

/**
 * A row of ARIA tabs: arrow keys, Home and End move between them, only the
 * current one is in the Tab order. In the scroll layout the current tab is
 * kept in view, so a link straight to the last tab shows it on a phone.
 */
export default function TabList<T extends string>({ tabs, labels, current, onSelect, label, idPrefix, layout }: TabListProps<T>) {
  const list = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const styles = TAB_LIST_LAYOUTS[layout];

  useEffect(() => {
    const tab = buttons.current.get(current);
    if (layout === "scroll" && list.current && tab) scrollIntoRow(list.current, tab);
  }, [current, layout]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Alt+Arrow is the browser's Back/Forward: leave modified keys alone.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = tabAfterKey(tabs, current, event.key);
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    buttons.current.get(next)?.focus();
  }

  return (
    <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={styles.list}>
      {tabs.map((t) => (
        <button
          key={t}
          ref={(el) => {
            if (el) buttons.current.set(t, el);
            else buttons.current.delete(t);
          }}
          type="button"
          role="tab"
          id={tabId(idPrefix, t)}
          aria-selected={t === current}
          aria-controls={tabPanelId(idPrefix)}
          tabIndex={t === current ? 0 : -1}
          onClick={() => onSelect(t)}
          className={clsx(styles.tab, "text-sm font-medium", t === current ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          {labels[t]}
        </button>
      ))}
    </div>
  );
}
