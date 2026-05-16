/**
 * ReviewCard — single pending lineup card in the review queue.
 *
 * Shows stand + aim screenshots, editable classification fields pre-populated
 * from classifier suggestions, and Accept / Re-classify / Hide action buttons.
 * Aim anchor is interactive: click the aim screenshot to reposition it.
 */
import { useState } from "react";
import { Check, EyeOff, RefreshCw } from "lucide-react";
import {
  showError,
  showSuccess,
  extractErrorMessage,
  ConfirmDialog,
} from "@platform/ui";
import {
  useAcceptLineupMutation,
  useHideLineupMutation,
  useReclassifyLineupMutation,
} from "@/store/lineupsApi";
import {
  useGetGamesQuery,
  useGetMapsQuery,
  useGetMapDetailQuery,
} from "@/store/gamesApi";
import type { Lineup, LineupAcceptBody } from "@/types/game";
import ConfidenceBadge from "./ConfidenceBadge";
import { confidenceBorderClass } from "./confidenceUtils";
import ReviewScreenshot from "./ReviewScreenshot";
import MinimapPinEditor from "./MinimapPinEditor";

// ---------------------------------------------------------------------------
// Classification form state helpers
// ---------------------------------------------------------------------------

interface ClassificationFields {
  game_id: string;
  map_id: string;
  target_zone_id: string;
  stand_zone_id: string;
  side: string;
  utility_type_id: string;
  title: string;
  notes: string;
  aim_anchor_x: string;
  aim_anchor_y: string;
  stand_anchor_x: string;
  stand_anchor_y: string;
  target_anchor_x: string;
  target_anchor_y: string;
  setup_seconds: string;
}

function initFieldsFromLineup(lineup: Lineup): ClassificationFields {
  return {
    game_id: lineup.suggested_game_id ?? lineup.game_id ?? "",
    map_id: lineup.suggested_map_id ?? lineup.map_id ?? "",
    target_zone_id: lineup.suggested_target_zone_id ?? lineup.target_zone_id ?? "",
    stand_zone_id: lineup.suggested_stand_zone_id ?? lineup.stand_zone_id ?? "",
    side: lineup.suggested_side ?? lineup.side ?? "",
    utility_type_id: lineup.suggested_utility_type_id ?? lineup.utility_type_id ?? "",
    title: lineup.title ?? "",
    notes: lineup.notes ?? "",
    aim_anchor_x: lineup.aim_anchor_x != null ? String(lineup.aim_anchor_x) : "",
    aim_anchor_y: lineup.aim_anchor_y != null ? String(lineup.aim_anchor_y) : "",
    stand_anchor_x: lineup.stand_anchor_x != null ? String(lineup.stand_anchor_x) : "",
    stand_anchor_y: lineup.stand_anchor_y != null ? String(lineup.stand_anchor_y) : "",
    target_anchor_x: lineup.target_anchor_x != null ? String(lineup.target_anchor_x) : "",
    target_anchor_y: lineup.target_anchor_y != null ? String(lineup.target_anchor_y) : "",
    setup_seconds: lineup.setup_seconds != null ? String(lineup.setup_seconds) : "",
  };
}

function fieldsToAcceptBody(fields: ClassificationFields): LineupAcceptBody {
  const body: LineupAcceptBody = {};
  if (fields.game_id) body.game_id = fields.game_id;
  if (fields.map_id) body.map_id = fields.map_id;
  if (fields.target_zone_id) body.target_zone_id = fields.target_zone_id;
  if (fields.stand_zone_id) body.stand_zone_id = fields.stand_zone_id;
  if (fields.side && ["side_a", "side_b", "any"].includes(fields.side)) {
    body.side = fields.side as "side_a" | "side_b" | "any";
  }
  if (fields.utility_type_id) body.utility_type_id = fields.utility_type_id;
  if (fields.title) body.title = fields.title;
  if (fields.notes) body.notes = fields.notes;
  const ax = parseFloat(fields.aim_anchor_x);
  if (!isNaN(ax)) body.aim_anchor_x = ax;
  const ay = parseFloat(fields.aim_anchor_y);
  if (!isNaN(ay)) body.aim_anchor_y = ay;
  const sax = parseFloat(fields.stand_anchor_x);
  if (!isNaN(sax)) body.stand_anchor_x = sax;
  const say = parseFloat(fields.stand_anchor_y);
  if (!isNaN(say)) body.stand_anchor_y = say;
  const tax = parseFloat(fields.target_anchor_x);
  if (!isNaN(tax)) body.target_anchor_x = tax;
  const tay = parseFloat(fields.target_anchor_y);
  if (!isNaN(tay)) body.target_anchor_y = tay;
  const sec = parseInt(fields.setup_seconds, 10);
  if (!isNaN(sec)) body.setup_seconds = sec;
  return body;
}

/**
 * First-<option> label for a dependent <select>: a "pick the parent first"
 * hint when blocked, a loading note while its data is in flight, otherwise
 * the normal choose-prompt.
 */
function placeholderLabel(
  blockedMsg: string | null,
  loading: boolean,
  chooseLabel: string,
): string {
  if (blockedMsg) return blockedMsg;
  if (loading) return "Loading…";
  return chooseLabel;
}

// ---------------------------------------------------------------------------
// ReviewCard component
// ---------------------------------------------------------------------------

export interface ReviewCardProps {
  lineup: Lineup;
  checked: boolean;
  onCheckToggle: () => void;
}

export default function ReviewCard({
  lineup,
  checked,
  onCheckToggle,
}: ReviewCardProps) {
  const [fields, setFields] = useState<ClassificationFields>(() =>
    initFieldsFromLineup(lineup),
  );

  const [acceptLineup, { isLoading: isAccepting }] = useAcceptLineupMutation();
  const [hideLineup, { isLoading: isHiding }] = useHideLineupMutation();
  const [reclassify, { isLoading: isReclassifying }] =
    useReclassifyLineupMutation();
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false);

  const setField = (key: keyof ClassificationFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  // --- Classification data (cascading: game → map → zones/utility) --------
  const { data: games = [] } = useGetGamesQuery();
  const gameSlug = games.find((g) => g.id === fields.game_id)?.slug ?? "";

  const { data: maps = [], isFetching: isMapsFetching } = useGetMapsQuery(
    gameSlug,
    { skip: !gameSlug },
  );
  const selectedMap = maps.find((m) => m.id === fields.map_id) ?? null;
  const mapSlug = selectedMap?.slug ?? "";

  const { data: mapDetail, isFetching: isMapDetailFetching } =
    useGetMapDetailQuery(
      { gameSlug, mapSlug },
      { skip: !gameSlug || !mapSlug },
    );

  // Minimap is resolved reactively from the operator-selected map. A pending
  // lineup's own map_id is null until accept, so it cannot drive this — see
  // the PR description for the full P1/P2 analysis.
  const minimapUrl = selectedMap?.minimap_url ?? null;
  const zones = mapDetail?.zones ?? [];
  const utilityTypes = mapDetail?.utility_types ?? [];

  // First-<option> hints for the dependent selects.
  const mapBlockedMsg = gameSlug ? null : "— pick a game first —";
  const detailBlockedMsg = mapSlug ? null : "— pick a map first —";

  // A game change invalidates the chosen map (and its zones/utility); a map
  // change invalidates the chosen zones (zones are map-scoped).
  const handleGameChange = (gameId: string) => {
    setFields((prev) => ({
      ...prev,
      game_id: gameId,
      map_id: "",
      stand_zone_id: "",
      target_zone_id: "",
      utility_type_id: "",
    }));
  };
  const handleMapChange = (mapId: string) => {
    setFields((prev) => ({
      ...prev,
      map_id: mapId,
      stand_zone_id: "",
      target_zone_id: "",
    }));
  };

  const handleAccept = async () => {
    const body = fieldsToAcceptBody(fields);
    try {
      await acceptLineup({ id: lineup.id, body }).unwrap();
      showSuccess("Lineup accepted.");
    } catch (err: unknown) {
      showError(extractErrorMessage(err));
    }
  };

  const handleHide = async () => {
    try {
      await hideLineup(lineup.id).unwrap();
      showSuccess("Lineup hidden.");
      setHideConfirmOpen(false);
    } catch {
      showError("Failed to hide lineup.");
    }
  };

  const handleReclassify = async () => {
    try {
      const result = await reclassify(lineup.id).unwrap();
      if (result.success) {
        setFields(
          initFieldsFromLineup({
            ...lineup,
            suggested_game_id: result.suggested_game_id,
            suggested_map_id: result.suggested_map_id,
            suggested_target_zone_id: result.suggested_target_zone_id,
            suggested_stand_zone_id: result.suggested_stand_zone_id,
            suggested_side: result.suggested_side,
            suggested_utility_type_id: result.suggested_utility_type_id,
            aim_anchor_x: result.aim_anchor_x,
            aim_anchor_y: result.aim_anchor_y,
            classification_confidence: result.confidence,
            classification_reasoning: result.reasoning,
          }),
        );
        showSuccess("Re-classified.");
      } else {
        showError(
          `Classification failed: ${result.error_codes.join(", ") || "unknown error"}`,
        );
      }
    } catch {
      showError("Re-classify request failed.");
    }
  };

  const handleAnchorChange = (x: number, y: number) => {
    setField("aim_anchor_x", x.toFixed(4));
    setField("aim_anchor_y", y.toFixed(4));
  };

  const aimX = fields.aim_anchor_x !== "" ? parseFloat(fields.aim_anchor_x) : null;
  const aimY = fields.aim_anchor_y !== "" ? parseFloat(fields.aim_anchor_y) : null;
  const borderClass = confidenceBorderClass(lineup.classification_confidence);

  return (
    <div className={`rounded-lg border-2 bg-card overflow-hidden ${borderClass}`}>
      {/* Card header */}
      <div className="px-4 py-3 border-b flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheckToggle}
          aria-label={`Select ${lineup.title}`}
          className="mt-1 w-4 h-4 rounded cursor-pointer accent-primary"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{lineup.title}</span>
            <ConfidenceBadge confidence={lineup.classification_confidence} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
            {lineup.attribution_author && (
              <span>{lineup.attribution_author}</span>
            )}
            {lineup.chapter_title && lineup.chapter_title !== lineup.title && (
              <span className="opacity-70">{lineup.chapter_title}</span>
            )}
          </div>
        </div>
      </div>

      {/* Screenshots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">
            Stand position
          </p>
          <ReviewScreenshot
            src={lineup.stand_screenshot_url}
            alt={`${lineup.title} — stand`}
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">
            Aim reference{" "}
            <span className="opacity-60">(click to set anchor)</span>
          </p>
          <ReviewScreenshot
            src={lineup.aim_screenshot_url}
            alt={`${lineup.title} — aim`}
            aimAnchorX={aimX}
            aimAnchorY={aimY}
            interactive
            onAnchorChange={handleAnchorChange}
          />
          <div className="flex gap-2 mt-2">
            <label className="flex-1">
              <span className="text-xs text-muted-foreground">Anchor X</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={fields.aim_anchor_x}
                onChange={(e) => setField("aim_anchor_x", e.target.value)}
                className="mt-0.5 w-full h-8 rounded border border-input bg-background px-2 text-xs"
                placeholder="0.0–1.0"
              />
            </label>
            <label className="flex-1">
              <span className="text-xs text-muted-foreground">Anchor Y</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={fields.aim_anchor_y}
                onChange={(e) => setField("aim_anchor_y", e.target.value)}
                className="mt-0.5 w-full h-8 rounded border border-input bg-background px-2 text-xs"
                placeholder="0.0–1.0"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Minimap pin editor */}
      <div className="px-3 pb-3">
        <p className="text-xs text-muted-foreground mb-1.5 font-medium">
          Minimap positions{" "}
          {minimapUrl ? (
            <span className="opacity-60">(drag pins to refine)</span>
          ) : (
            <span className="opacity-60">
              (pick a game and map below to load the minimap)
            </span>
          )}
        </p>
        <MinimapPinEditor
          lineup={lineup}
          minimapUrl={minimapUrl}
          standAnchorX={fields.stand_anchor_x}
          standAnchorY={fields.stand_anchor_y}
          targetAnchorX={fields.target_anchor_x}
          targetAnchorY={fields.target_anchor_y}
          onStandChange={(x, y) => {
            setField("stand_anchor_x", x.toFixed(4));
            setField("stand_anchor_y", y.toFixed(4));
          }}
          onTargetChange={(x, y) => {
            setField("target_anchor_x", x.toFixed(4));
            setField("target_anchor_y", y.toFixed(4));
          }}
          onResetStand={() => {
            setField("stand_anchor_x", "");
            setField("stand_anchor_y", "");
          }}
          onResetTarget={() => {
            setField("target_anchor_x", "");
            setField("target_anchor_y", "");
          }}
          disabled={isAccepting}
        />
      </div>

      {/* Classification fields */}
      <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Game</span>
          <select
            value={fields.game_id}
            onChange={(e) => handleGameChange(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            <option value="">— choose a game —</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Map</span>
          <select
            value={fields.map_id}
            onChange={(e) => handleMapChange(e.target.value)}
            disabled={!gameSlug || isMapsFetching}
            className="h-8 rounded border border-input bg-background px-2 text-xs disabled:opacity-50"
          >
            <option value="">
              {placeholderLabel(mapBlockedMsg, isMapsFetching, "— choose a map —")}
            </option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Utility type</span>
          <select
            value={fields.utility_type_id}
            onChange={(e) => setField("utility_type_id", e.target.value)}
            disabled={!mapSlug || isMapDetailFetching}
            className="h-8 rounded border border-input bg-background px-2 text-xs disabled:opacity-50"
          >
            <option value="">
              {placeholderLabel(
                detailBlockedMsg,
                isMapDetailFetching,
                "— choose a utility —",
              )}
            </option>
            {utilityTypes.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Stand zone</span>
          <select
            value={fields.stand_zone_id}
            onChange={(e) => setField("stand_zone_id", e.target.value)}
            disabled={!mapSlug || isMapDetailFetching}
            className="h-8 rounded border border-input bg-background px-2 text-xs disabled:opacity-50"
          >
            <option value="">
              {placeholderLabel(
                detailBlockedMsg,
                isMapDetailFetching,
                "— choose a zone —",
              )}
            </option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Target zone</span>
          <select
            value={fields.target_zone_id}
            onChange={(e) => setField("target_zone_id", e.target.value)}
            disabled={!mapSlug || isMapDetailFetching}
            className="h-8 rounded border border-input bg-background px-2 text-xs disabled:opacity-50"
          >
            <option value="">
              {placeholderLabel(
                detailBlockedMsg,
                isMapDetailFetching,
                "— choose a zone —",
              )}
            </option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Side</span>
          <select
            value={fields.side}
            onChange={(e) => setField("side", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            <option value="">— choose —</option>
            <option value="side_a">Side A (Attack/T)</option>
            <option value="side_b">Side B (Defense/CT)</option>
            <option value="any">Any (both sides)</option>
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Setup seconds</span>
          <input
            type="number"
            min={0}
            value={fields.setup_seconds}
            onChange={(e) => setField("setup_seconds", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
            placeholder="e.g. 3"
          />
        </label>

        <label className="col-span-2 sm:col-span-1 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Title</span>
          <input
            type="text"
            value={fields.title}
            onChange={(e) => setField("title", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
            placeholder="Lineup title"
          />
        </label>

        <label className="col-span-2 sm:col-span-3 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Notes</span>
          <input
            type="text"
            value={fields.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
            placeholder="Optional notes"
          />
        </label>
      </div>

      {/* Classifier reasoning */}
      {lineup.classification_reasoning && (
        <div className="px-3 pb-3">
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              Classifier reasoning
            </summary>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">
              {lineup.classification_reasoning}
            </p>
          </details>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleAccept}
          disabled={isAccepting}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-8 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          <Check className={`w-3.5 h-3.5 ${isAccepting ? "animate-pulse" : ""}`} />
          {isAccepting ? "Accepting…" : "Accept"}
        </button>

        <button
          type="button"
          onClick={handleReclassify}
          disabled={isReclassifying}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs font-medium disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isReclassifying ? "animate-spin" : ""}`}
          />
          {isReclassifying ? "Classifying…" : "Re-classify"}
        </button>

        <button
          type="button"
          onClick={() => setHideConfirmOpen(true)}
          disabled={isHiding}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 h-8 text-xs font-medium text-destructive disabled:opacity-50 hover:bg-destructive/10 ml-auto"
        >
          <EyeOff className="w-3.5 h-3.5" />
          {isHiding ? "Hiding…" : "Hide"}
        </button>
      </div>

      <ConfirmDialog
        open={hideConfirmOpen}
        title="Hide this lineup?"
        description="It can be recovered from the database."
        confirmLabel="Hide"
        variant="destructive"
        isLoading={isHiding}
        onConfirm={handleHide}
        onCancel={() => setHideConfirmOpen(false)}
      />
    </div>
  );
}
