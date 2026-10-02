import { Link } from "react-router-dom";
import { directionsHref } from "@/games/wow-forever/food/recipeSources";
import {
  clothPerHour,
  formatMoney,
  goldPerHour,
  levelLabel,
  oneEvery,
  type GoldFarm,
} from "@/games/wow-forever/gold/goldFarms";

interface GoldFarmCardProps {
  farm: GoldFarm;
  rank: number;
  skinning: boolean;
}

/** One farm spot: who to kill, where, and what an hour of it is worth. */
export default function GoldFarmCard({ farm, rank, skinning }: GoldFarmCardProps) {
  const cloth = Math.round(clothPerHour(farm));
  const greens = oneEvery(farm.greensPerKill + farm.bluesPerKill);
  const recipes = oneEvery(farm.recipesPerKill);
  const respawnMin = Math.max(1, Math.round(farm.respawnSec / 60));
  const place = farm.subzone ? `${farm.zone} — ${farm.subzone}` : farm.zone;
  return (
    <li className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-semibold">
            <span className="text-muted-foreground">{rank}.</span> {farm.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {levelLabel(farm)} {farm.type} · {place} ({Math.round(farm.x)}, {Math.round(farm.y)})
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold tabular-nums">{formatMoney(goldPerHour(farm, skinning))} an hour</p>
          <p className="text-xs text-muted-foreground">at vendor prices</p>
        </div>
      </div>
      <ul className="text-sm space-y-1">
        <li>
          Each kill: {farm.coin > 0 ? `${formatMoney(farm.coin)} coin + ` : ""}
          {formatMoney(farm.vendor)} of loot to vendor
          {skinning && farm.skinVendor > 0 ? ` + ${formatMoney(farm.skinVendor)} of ${farm.skin}` : ""}
          {farm.coin > 0 ? "" : " (it drops no coin)"}
        </li>
        {cloth > 0 ? (
          <li>
            About <span className="font-medium">{cloth} {farm.cloth}</span> an hour — keep it, players pay more than a vendor
          </li>
        ) : null}
        {!skinning && farm.skin ? (
          <li>Skinnable: {farm.skin}, another {formatMoney(farm.skinVendor * farm.killsPerHour)} an hour at a vendor</li>
        ) : null}
        {greens ? <li>Green or better item: {greens}</li> : null}
        {recipes ? <li>Recipe: {recipes}</li> : null}
        <li className="text-muted-foreground">
          {farm.pack} of them close together, back {respawnMin} min after a kill — about {farm.killsPerHour} kills an hour
        </li>
      </ul>
      <Link
        to={directionsHref({ zoneId: farm.zoneId, x: farm.x, y: farm.y })}
        className="inline-flex min-h-[44px] sm:min-h-0 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Directions on the World Map
      </Link>
    </li>
  );
}
