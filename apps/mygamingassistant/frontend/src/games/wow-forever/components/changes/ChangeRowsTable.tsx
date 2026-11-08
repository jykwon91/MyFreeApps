import type { ChangeRow } from "@/games/wow-forever/types/changes/changeRow";

const NOT_THERE = "—";

/** Classic and Forever side by side: a table from `sm`, each line stacked (label, Classic, Forever) on a phone. */
export default function ChangeRowsTable({ rows }: { rows: readonly ChangeRow[] }) {
  return (
    <table className="w-full text-sm" data-testid="change-rows">
      <thead className="sr-only sm:not-sr-only">
        <tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1 pr-3 font-medium sm:w-32">
            What
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Classic
          </th>
          <th scope="col" className="py-1 font-medium">
            Forever
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, classic, forever], i) => (
          <tr key={`${label}-${i}`} className="block border-t py-2 sm:table-row sm:py-0">
            <th scope="row" className="block pr-3 text-left font-medium sm:table-cell sm:py-1.5 sm:align-top">
              {label}
            </th>
            <td className="block pr-3 sm:table-cell sm:py-1.5 sm:align-top">
              <span className="text-xs text-muted-foreground sm:hidden">Classic: </span>
              <span className="text-muted-foreground">{classic ?? NOT_THERE}</span>
            </td>
            <td className="block sm:table-cell sm:py-1.5 sm:align-top">
              <span className="text-xs text-muted-foreground sm:hidden">Forever: </span>
              {forever ?? NOT_THERE}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
