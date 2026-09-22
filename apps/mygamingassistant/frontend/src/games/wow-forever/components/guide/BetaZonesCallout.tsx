import { AlertBox } from "@platform/ui";
import { FOREVER_BETA_ZONES } from "@/games/wow-forever/data/guide/levelingZones";

export default function BetaZonesCallout() {
  return (
    <AlertBox variant="info">
      <p className="font-medium">Forever beta — may change</p>
      <p className="mt-1">These Forever zones have been shown so far. Levels and details can change before launch.</p>
      <ul className="mt-2 list-disc pl-5 space-y-1">
        {FOREVER_BETA_ZONES.map((z) => (
          <li key={z.name}>
            <span className="font-medium">{z.name}</span> — {z.detail}
          </li>
        ))}
      </ul>
    </AlertBox>
  );
}
