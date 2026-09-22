import BreakdownCell from "@/games/wow-forever/components/compare/BreakdownCell";
import type { BreakdownLine, RankedItem } from "@/games/wow-forever/scoring/scoreTypes";

interface ScoreBreakdownTableProps {
  ranked: RankedItem[];
  breakdown: BreakdownLine[];
}

/** Side-by-side stat breakdown. Stats your spec doesn't value are listed as "not scored", never hidden. */
export default function ScoreBreakdownTable({ ranked, breakdown }: ScoreBreakdownTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <caption className="sr-only">Score breakdown by stat</caption>
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className="p-2 font-medium">Stat</th>
            {ranked.map(({ item }) => (
              <th key={item.id} scope="col" className="p-2 font-medium min-w-32">
                {item.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {breakdown.map((line) => (
            <tr key={line.key} className="border-b last:border-0 align-top">
              <th scope="row" className="p-2 text-left font-normal">
                {line.label}
              </th>
              {line.cells.map((cell, i) => (
                <BreakdownCell key={ranked[i].item.id} row={cell} />
              ))}
            </tr>
          ))}
          <tr className="font-semibold">
            <th scope="row" className="p-2 text-left">Total</th>
            {ranked.map(({ item, score }) => (
              <td key={item.id} className="p-2">
                {score.total.toFixed(1)} pts
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
