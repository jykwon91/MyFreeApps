import { Skeleton } from "@platform/ui";

const COLUMN_WIDTHS = ["w-1/3", "w-1/4", "w-20", "w-24", "w-16"] as const;

export default function ApplicationsSkeleton() {
  return (
    <div
      className="w-full overflow-x-auto"
      aria-label="Loading applications"
      aria-busy="true"
    >
      <table role="table" className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            {["Company", "Role", "Status", "Applied", "Actions"].map((col) => (
              <th
                key={col}
                scope="col"
                className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, rowIdx) => (
            <tr key={rowIdx} className="border-b">
              {COLUMN_WIDTHS.map((width, colIdx) => (
                <td key={colIdx} className="px-3 py-3">
                  <Skeleton className={`h-5 ${width}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
