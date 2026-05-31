/**
 * MapScopePicker — controlled game→map cascade for a source's classification
 * scope (Source.config_json game_hint / map_hint).
 *
 * Semantics (map_hint implies its game):
 *   - "No scope"  → { game_hint: null, map_hint: null }  (classify freely)
 *   - game only   → { game_hint, map_hint: null }        (scope to a game)
 *   - game + map  → { game_hint, map_hint }              (hard-lock to a map)
 *
 * Reused at source-create time and to edit an existing source's scope. Reads
 * the game/map taxonomy from the shared gamesApi (public endpoints).
 */
import { useGetGamesQuery, useGetMapsQuery } from "@/store/gamesApi";

export interface MapScopeValue {
  game_hint: string | null;
  map_hint: string | null;
}

interface MapScopePickerProps {
  value: MapScopeValue;
  onChange: (value: MapScopeValue) => void;
  disabled?: boolean;
  /** Disambiguates label htmlFor when multiple pickers render on one page. */
  idPrefix?: string;
}

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm";

export function MapScopePicker({
  value,
  onChange,
  disabled = false,
  idPrefix = "scope",
}: MapScopePickerProps) {
  const { data: games, isLoading: gamesLoading } = useGetGamesQuery();
  const gameSlug = value.game_hint;
  const { data: maps, isFetching: mapsFetching } = useGetMapsQuery(
    gameSlug ?? "",
    { skip: !gameSlug },
  );

  const gameSelectId = `${idPrefix}-game`;
  const mapSelectId = `${idPrefix}-map`;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor={gameSelectId}
          className="text-xs font-medium text-muted-foreground"
        >
          Game scope
        </label>
        <select
          id={gameSelectId}
          value={gameSlug ?? ""}
          disabled={disabled || gamesLoading}
          onChange={(e) => {
            // Changing (or clearing) the game resets any map lock — a map
            // belongs to exactly one game.
            onChange({ game_hint: e.target.value || null, map_hint: null });
          }}
          className={SELECT_CLASS}
        >
          <option value="">No scope (classify freely)</option>
          {games?.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {gameSlug && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={mapSelectId}
            className="text-xs font-medium text-muted-foreground"
          >
            Map lock
          </label>
          <select
            id={mapSelectId}
            value={value.map_hint ?? ""}
            disabled={disabled || mapsFetching}
            onChange={(e) =>
              onChange({ game_hint: gameSlug, map_hint: e.target.value || null })
            }
            className={SELECT_CLASS}
          >
            <option value="">Whole game (no map lock)</option>
            {maps?.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
