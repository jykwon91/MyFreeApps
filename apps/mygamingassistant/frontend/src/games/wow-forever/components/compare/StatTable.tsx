import { Plus, Trash2 } from "lucide-react";
import { Button, Select } from "@platform/ui";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { isStatKey, STAT_KEYS, STAT_LABELS, type StatKey, type StatValues } from "@/games/wow-forever/data/statKeys";

interface StatTableProps {
  itemName: string;
  stats: StatValues;
  onChange: (stats: StatValues) => void;
}

function withoutKey(stats: StatValues, key: StatKey): StatValues {
  const next = { ...stats };
  delete next[key];
  return next;
}

/** Editable list of an item's stats — fix anything the reader got wrong. */
export default function StatTable({ itemName, stats, onChange }: StatTableProps) {
  const keys = STAT_KEYS.filter((k) => stats[k] !== undefined);
  const firstUnused = STAT_KEYS.find((k) => stats[k] === undefined);

  function rename(from: StatKey, to: string) {
    if (!isStatKey(to) || to === from) return;
    onChange({ ...withoutKey(stats, from), [to]: stats[from] ?? 0 });
  }

  return (
    <div className="space-y-2">
      {keys.length === 0 ? <p className="text-sm text-muted-foreground">No stats yet.</p> : null}
      <ul className="space-y-2">
        {keys.map((key) => (
          <li key={key} className="flex items-end gap-2">
            <label className="flex-1 min-w-0">
              <span className="sr-only">Stat</span>
              <Select value={key} onChange={(e) => rename(key, e.target.value)} className="w-full min-h-[44px] bg-card">
                {STAT_KEYS.filter((k) => k === key || stats[k] === undefined).map((k) => (
                  <option key={k} value={k}>
                    {STAT_LABELS[k]}
                  </option>
                ))}
              </Select>
            </label>
            <NumberField
              label={`${STAT_LABELS[key]} amount`}
              hideLabel
              step={0.1}
              value={stats[key] ?? null}
              onChange={(v) => onChange({ ...stats, [key]: v ?? 0 })}
              className="w-24 shrink-0"
            />
            <button
              type="button"
              onClick={() => onChange(withoutKey(stats, key))}
              aria-label={`Remove ${STAT_LABELS[key]} from ${itemName}`}
              className="p-2 rounded-md hover:bg-muted/40 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      {firstUnused ? (
        <Button variant="secondary" size="sm" onClick={() => onChange({ ...stats, [firstUnused]: 0 })}>
          <Plus className="h-4 w-4 mr-1 inline" aria-hidden />
          Add stat
        </Button>
      ) : null}
    </div>
  );
}
