import { useId, useState } from "react";
import CrateBundleListItem from "@/games/wow-forever/components/crates/CrateBundleListItem";
import ExpandToggle from "@/games/wow-forever/components/shared/ExpandToggle";
import type { CrateBundleRow } from "@/games/wow-forever/types/crates/crateBundleRow";

interface CrateBundlesDisclosureProps {
  bundles: readonly CrateBundleRow[];
  loading: boolean;
}

/** "All N bundles": a 44px toggle that folds out every way to fill the crate, collapsed to start with. */
export default function CrateBundlesDisclosure({ bundles, loading }: CrateBundlesDisclosureProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  return (
    <div className="space-y-2">
      <ExpandToggle
        expanded={expanded}
        controlsId={listId}
        collapsedLabel={`All ${bundles.length} bundles`}
        expandedLabel="Hide bundles"
        onToggle={() => setExpanded((open) => !open)}
      />
      {expanded ? (
        <ul id={listId} className="space-y-1" data-testid="crate-bundles">
          {bundles.map((row) => (
            <CrateBundleListItem key={row.bundle.item.id} row={row} loading={loading} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
