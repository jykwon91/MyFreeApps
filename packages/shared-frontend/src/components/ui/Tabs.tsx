import { useRef, type KeyboardEvent } from "react";
import { nextTabIndex } from "../../utils/tabKeyboard";
import type { TabOption } from "../../types/tab-option";
import { tabDomId, tabPanelDomId } from "../../utils/tab-dom-ids";

export interface TabsProps<T extends string> {
  tabs: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** Namespaces the tab and tabpanel ids; pair with a ``TabPanel`` using the same prefix. */
  idPrefix: string;
  ariaLabel?: string;
  className?: string;
  tabClassName: (selected: boolean) => string;
  testId?: string;
  /** Each tab controls its own panel; pair with `TabPanel panelPerTab`. Default: one panel shared by all tabs. */
  panelPerTab?: boolean;
}

/**
 * WAI-ARIA tab list: the selected tab is the only one in the tab order,
 * Left/Right/Home/End move selection and focus, and each tab controls the
 * ``TabPanel`` with the same prefix and value.
 */
export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  idPrefix,
  ariaLabel,
  className,
  tabClassName,
  testId,
  panelPerTab = false,
}: TabsProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, tabs.findIndex((tab) => tab.value === value), tabs.length);
    if (next === null || tabs[next].disabled) return;
    event.preventDefault();
    onChange(tabs[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={className} onKeyDown={handleKeyDown} data-testid={testId}>
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={tabDomId(idPrefix, tab.value)}
            aria-selected={selected}
            aria-controls={tabPanelDomId(idPrefix, tab.value, panelPerTab)}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.value)}
            data-testid={tab.testId}
            className={tabClassName(selected)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
