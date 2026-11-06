import { StatusBadge } from "@platform/ui";
import { HEALTH_LABELS, HEALTH_TONES } from "@/features/financials/health";
import TipEditor from "@/features/financials/TipEditor";
import { formatMoney } from "@/lib/formatMoney";
import type { SummaryCardProps } from "@/types/financials/SummaryCardProps";

export default function SummaryCard({ data, readOnly }: SummaryCardProps) {
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{data.drop.name}</h2>
          <p className="text-xs text-muted-foreground">{data.drop.date} · {data.drop.status}</p>
        </div>
        <StatusBadge
          tone={HEALTH_TONES[data.health]}
          label={HEALTH_LABELS[data.health]}
        />
      </div>

      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Pizza count</dt>
        <dd className="text-right tabular-nums">{data.pizza_count}</dd>

        <dt className="text-muted-foreground">Revenue</dt>
        <dd className="text-right tabular-nums">${formatMoney(data.revenue)}</dd>

        <dt className="text-muted-foreground">Tip</dt>
        <dd className="text-right tabular-nums">
          <TipEditor
            key={data.tip_total}
            dropId={data.drop.id}
            current={data.tip_total}
            readOnly={readOnly}
          />
        </dd>

        <dt className="text-muted-foreground">Expenses</dt>
        <dd className="text-right tabular-nums">-${formatMoney(data.expense_total)}</dd>

        <dt className="text-base font-semibold pt-2 border-t mt-1">Profit</dt>
        <dd className="text-right text-base font-semibold tabular-nums pt-2 border-t mt-1">
          ${formatMoney(data.profit)}
        </dd>
      </dl>
    </section>
  );
}
