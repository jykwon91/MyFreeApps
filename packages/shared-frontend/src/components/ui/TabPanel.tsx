import type { ReactNode } from "react";
import { tabDomId, tabPanelDomId } from "../../utils/tab-dom-ids";

export interface TabPanelProps {
  idPrefix: string;
  value: string;
  children: ReactNode;
  className?: string;
  testId?: string;
  /** Must match the `Tabs` it pairs with. */
  panelPerTab?: boolean;
}

export default function TabPanel({ idPrefix, value, children, className, testId, panelPerTab = false }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelDomId(idPrefix, value, panelPerTab)}
      aria-labelledby={tabDomId(idPrefix, value)}
      className={className}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
