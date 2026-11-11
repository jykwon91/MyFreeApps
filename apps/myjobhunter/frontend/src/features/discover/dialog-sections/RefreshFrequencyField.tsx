import type { ReactNode } from "react";
import { REFRESH_INTERVAL_OPTIONS } from "@myjobhunter/api-client/constants/refreshIntervals";

interface RefreshFrequencyFieldProps {
  id: string;
  value: number;
  onChange: (minutes: number) => void;
  children?: ReactNode;
}

/** How often a saved search fetches on its own, shared by the new and edit dialogs. */
export default function RefreshFrequencyField({ id, value, onChange, children }: RefreshFrequencyFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        Refresh frequency
      </label>
      <select
        id={id}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {REFRESH_INTERVAL_OPTIONS.map((opt) => (
          <option key={opt.minutes} value={opt.minutes}>
            {opt.label}
          </option>
        ))}
      </select>
      {children}
    </div>
  );
}
