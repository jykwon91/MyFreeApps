import { useState } from "react";
import { useGetCostThresholdsQuery, useUpdateCostThresholdsMutation } from "@/shared/store/costsApi";
import type { CostThresholds } from "@/shared/types/admin/cost";
import { useToast } from "@/shared/hooks/useToast";
import Card from "@/shared/components/ui/Card";
import LoadingButton from "@/shared/components/ui/LoadingButton";

type ThresholdKey = keyof CostThresholds;

interface ThresholdField {
  key: ThresholdKey;
  label: string;
  prefix?: string;
  suffix?: string;
  max: number;
  step: number;
}

const FIELDS: ThresholdField[] = [
  { key: "daily_budget", label: "Daily Budget", prefix: "$", max: 500, step: 5 },
  { key: "monthly_budget", label: "Monthly Budget", prefix: "$", max: 10000, step: 50 },
  { key: "per_user_daily_alert", label: "Per-User Daily Alert", prefix: "$", max: 100, step: 1 },
  { key: "input_rate_per_million", label: "Input Rate", prefix: "$", suffix: "/ 1M tokens", max: 50, step: 0.5 },
  { key: "output_rate_per_million", label: "Output Rate", prefix: "$", suffix: "/ 1M tokens", max: 100, step: 0.5 },
];

export default function ThresholdSettings({ onSaved }: { onSaved?: () => void } = {}) {
  const { data: thresholds } = useGetCostThresholdsQuery();
  const [updateThresholds, { isLoading }] = useUpdateCostThresholdsMutation();
  const { showSuccess, showError } = useToast();
  // Track user edits as partial overrides; fall back to server values for unedited fields.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const dirty = Object.keys(overrides).length > 0;

  // Merge server data with user overrides to get the current displayed values.
  function getValue(key: ThresholdKey): string {
    if (key in overrides) return overrides[key];
    if (!thresholds) return "";
    return String(thresholds[key]);
  }

  function handleChange(key: ThresholdKey, val: string) {
    setOverrides((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    const updates: Partial<CostThresholds> = {};
    for (const field of FIELDS) {
      const val = parseFloat(getValue(field.key));
      if (!isNaN(val) && val >= 0) {
        updates[field.key] = val;
      }
    }
    try {
      await updateThresholds(updates).unwrap();
      showSuccess("Thresholds updated");
      setOverrides({});
      onSaved?.();
    } catch {
      showError("Couldn't update thresholds");
    }
  }

  if (!thresholds) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FIELDS.map((field) => (
          <Card key={field.key}>
            <label className="text-sm text-muted-foreground" htmlFor={`threshold-${field.key}`}>
              {field.label}
            </label>
            <div className="flex items-center gap-2 mt-2">
              {field.prefix && <span className="text-sm text-muted-foreground">{field.prefix}</span>}
              <input
                id={`threshold-${field.key}`}
                type="number"
                min="0"
                max={field.max}
                step={field.step}
                value={getValue(field.key)}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-24 border rounded-md px-2 py-1.5 text-sm bg-background"
              />
              {field.suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{field.suffix}</span>}
            </div>
            <input
              type="range"
              min="0"
              max={field.max}
              step={field.step}
              value={parseFloat(getValue(field.key)) || 0}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className="w-full mt-2 accent-primary"
              aria-label={`${field.label} slider`}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{field.prefix}0</span>
              <span>{field.prefix}{field.max}</span>
            </div>
          </Card>
        ))}
      </div>
      {dirty && (
        <div className="flex justify-end">
          <LoadingButton
            size="sm"
            isLoading={isLoading}
            loadingText="Saving..."
            onClick={handleSave}
          >
            Save Changes
          </LoadingButton>
        </div>
      )}
    </div>
  );
}
