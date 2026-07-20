/**
 * usePinEditor — orchestration for the accepted-lineup pin-edit surface.
 *
 * The map board (MapPage) renders every accepted lineup as a pin on the
 * minimap (see MapLineupPins). This hook lets the operator select one of
 * those pins and nudge its stand/target anchor, persisting via the same
 * PATCH endpoint the review queue uses (useUpdateLineupMutation).
 *
 * Selection lives in the URL (`?edit=<lineupId>`) so the edit surface is
 * deep-linkable and survives refresh. Local field-string state mirrors
 * MinimapPinEditor's contract: empty string = "use the effective/centroid
 * fallback"; a numeric string = an explicit operator-set anchor.
 *
 * Save semantics (constrained by LineupPatch, which cannot send null):
 *   - Only anchors with a non-empty field string are sent. An untouched
 *     centroid-fallback pin (field "") is omitted so saving never freezes a
 *     zone centroid into an explicit anchor.
 *   - A save failure does NOT revert the dragged position — the operator
 *     keeps their work and can retry.
 *
 * "Confirmed" = the lineup has an explicit stand anchor (stand_anchor_x set),
 * matching MinimapPinEditor's `isGuess` predicate. Save & Next advances to
 * the next still-unconfirmed lineup so the operator can burn down the queue.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { useUpdateLineupMutation } from "@/store/lineupsApi";
import type { Lineup, LineupPatch } from "@/types/game";

/** number|null → field string ("" when null, so MinimapPinEditor shows the fallback). */
function toFieldStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

/** A lineup is "confirmed" once it has an explicit stand anchor. */
export function isLineupConfirmed(l: Lineup): boolean {
  return l.stand_anchor_x != null;
}

interface Args {
  lineups: Lineup[];
  isSuperuser: boolean;
}

export function usePinEditor({ lineups, isSuperuser }: Args) {
  const [searchParams, setSearchParams] = useSearchParams();
  // Only superusers get an edit selection — a public viewer's ?edit= is inert.
  const selectedLineupId = isSuperuser ? searchParams.get("edit") : null;

  const selectedLineup = useMemo(
    () => lineups.find((l) => l.id === selectedLineupId) ?? null,
    [lineups, selectedLineupId],
  );

  // Field-string state (empty = fallback). Seeded from the selected lineup's
  // EXPLICIT anchors so an already-placed pin shows as placed and re-saving
  // is a no-op, while an unplaced pin (null) seeds "" → centroid fallback.
  const [standAnchorX, setStandAnchorX] = useState("");
  const [standAnchorY, setStandAnchorY] = useState("");
  const [targetAnchorX, setTargetAnchorX] = useState("");
  const [targetAnchorY, setTargetAnchorY] = useState("");

  // Re-seed the fields when — and only when — the SELECTED ID changes, using
  // the React "adjust state during render" pattern (not an effect). This
  // re-seeds on selection change without clobbering an in-progress drag when
  // the lineups list refetches (RTK cache invalidation after a save) while
  // the same lineup stays selected.
  const [seededForId, setSeededForId] = useState<string | null>(null);
  if (selectedLineupId !== seededForId) {
    setSeededForId(selectedLineupId);
    setStandAnchorX(toFieldStr(selectedLineup?.stand_anchor_x));
    setStandAnchorY(toFieldStr(selectedLineup?.stand_anchor_y));
    setTargetAnchorX(toFieldStr(selectedLineup?.target_anchor_x));
    setTargetAnchorY(toFieldStr(selectedLineup?.target_anchor_y));
  }

  const [updateLineup, { isLoading: isSaving }] = useUpdateLineupMutation();

  function setSelected(id: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("edit", id);
        else next.delete("edit");
        return next;
      },
      { replace: true },
    );
  }

  // Drag / keyboard handlers write normalized [0,1] into the field strings.
  function onStandChange(x: number, y: number) {
    setStandAnchorX(String(x));
    setStandAnchorY(String(y));
  }
  function onTargetChange(x: number, y: number) {
    setTargetAnchorX(String(x));
    setTargetAnchorY(String(y));
  }
  function onResetStand() {
    setStandAnchorX("");
    setStandAnchorY("");
  }
  function onResetTarget() {
    setTargetAnchorX("");
    setTargetAnchorY("");
  }

  // Next still-unconfirmed lineup after the current one (list order), for
  // Save & Next. Excludes the current lineup (about to become confirmed).
  const nextUnconfirmed = useMemo(() => {
    if (!selectedLineupId) return null;
    const idx = lineups.findIndex((l) => l.id === selectedLineupId);
    const ordered = idx >= 0
      ? [...lineups.slice(idx + 1), ...lineups.slice(0, idx)]
      : lineups;
    return ordered.find((l) => l.id !== selectedLineupId && !isLineupConfirmed(l)) ?? null;
  }, [lineups, selectedLineupId]);

  function buildPatch(): LineupPatch {
    const patch: LineupPatch = {};
    if (standAnchorX !== "" && standAnchorY !== "") {
      patch.stand_anchor_x = parseFloat(standAnchorX);
      patch.stand_anchor_y = parseFloat(standAnchorY);
    }
    if (targetAnchorX !== "" && targetAnchorY !== "") {
      patch.target_anchor_x = parseFloat(targetAnchorX);
      patch.target_anchor_y = parseFloat(targetAnchorY);
    }
    return patch;
  }

  async function save(advance: boolean) {
    if (!selectedLineup || isSaving) return;
    const patch = buildPatch();
    try {
      await updateLineup({ id: selectedLineup.id, patch }).unwrap();
      showSuccess("Pin position saved.");
      if (advance) {
        // Selecting the next id re-seeds the fields via the effect above.
        setSelected(nextUnconfirmed ? nextUnconfirmed.id : null);
        if (!nextUnconfirmed) showSuccess("All lineups confirmed — nice.");
      } else {
        setSelected(null);
      }
    } catch (err) {
      // Do NOT revert — keep the operator's dragged position so they can retry.
      showError(extractErrorMessage(err));
    }
  }

  const confirmedCount = useMemo(
    () => lineups.reduce((acc, l) => acc + (isLineupConfirmed(l) ? 1 : 0), 0),
    [lineups],
  );

  return {
    selectedLineupId,
    selectedLineup,
    standAnchorX,
    standAnchorY,
    targetAnchorX,
    targetAnchorY,
    onStandChange,
    onTargetChange,
    onResetStand,
    onResetTarget,
    save,
    isSaving,
    setSelected,
    hasNext: nextUnconfirmed != null,
    confirmedCount,
    totalCount: lineups.length,
  };
}

export type PinEditor = ReturnType<typeof usePinEditor>;
