import { Select } from "@platform/ui";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { MAX_DOWNRANK_BONUS, MAX_TALENT_PCT } from "@/games/wow-forever/data/downrank/downrankConfig";
import { DOWNRANK_AMOUNT_WORD, DOWNRANK_BONUS_LABEL } from "@/games/wow-forever/data/downrank/downrankLabels";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";
import type { DownrankSettings } from "@/games/wow-forever/types/downrank/downrankSettings";

interface DownrankInputsProps {
  families: readonly DownrankFamily[];
  family: DownrankFamily;
  settings: DownrankSettings;
  onChange: (patch: Partial<DownrankSettings>) => void;
}

const SELECT_CLASS = "min-h-[44px] bg-card text-base sm:text-sm";

function clamp(value: number | null, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value ?? 0)));
}

/** Class, spell, level and bonus, plus the optional talent percentages. */
export default function DownrankInputs({ families, family, settings, onChange }: DownrankInputsProps) {
  const classes = WOW_CLASSES.filter((c) => families.some((f) => f.classId === c.id));
  const spells = families.filter((f) => f.classId === family.classId);
  const word = DOWNRANK_AMOUNT_WORD[family.kind];
  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-3" aria-label="Your character">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="downrank-class" className="text-xs font-medium text-muted-foreground">Class</label>
          <Select
            id="downrank-class"
            value={family.classId}
            onChange={(e) => {
              const first = families.find((f) => f.classId === e.target.value);
              if (first) onChange({ familyId: first.id });
            }}
            className={SELECT_CLASS}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="downrank-spell" className="text-xs font-medium text-muted-foreground">Spell</label>
          <Select id="downrank-spell" value={family.id} onChange={(e) => onChange({ familyId: e.target.value })} className={SELECT_CLASS}>
            {spells.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </div>
        <NumberField
          label="Your level"
          value={settings.level}
          min={1}
          max={levelCap()}
          onChange={(v) => {
            const level = playerLevel(v);
            if (level !== null) onChange({ level });
          }}
        />
        <NumberField
          label={DOWNRANK_BONUS_LABEL[family.kind]}
          value={settings.bonus}
          min={0}
          max={MAX_DOWNRANK_BONUS}
          onChange={(v) => onChange({ bonus: clamp(v, MAX_DOWNRANK_BONUS) })}
        />
      </div>
      <details className="rounded-lg border px-3 py-2" open={settings.talentPct > 0 || settings.manaPct > 0}>
        <summary className="cursor-pointer min-h-[44px] flex items-center text-sm font-medium">Talents (optional)</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <NumberField
            label={`% more ${word} from talents`}
            value={settings.talentPct}
            min={0}
            max={MAX_TALENT_PCT}
            onChange={(v) => onChange({ talentPct: clamp(v, MAX_TALENT_PCT) })}
          />
          <NumberField
            label="% less mana from talents"
            value={settings.manaPct}
            min={0}
            max={MAX_TALENT_PCT}
            onChange={(v) => onChange({ manaPct: clamp(v, MAX_TALENT_PCT) })}
          />
        </div>
        <p className="pt-2 text-xs text-muted-foreground">
          Add up your talents yourself (for example 10% more healing and 10% less mana). The % more applies to
          the whole amount, bonus included. Talents that shorten a cast aren&apos;t counted.
        </p>
      </details>
    </section>
  );
}
