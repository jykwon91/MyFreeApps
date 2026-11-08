/** One spot a rare spawns at (Classic data), on its zone's World Map picture. */
export interface RareSpawn {
  zoneId: number;
  zoneName: string;
  /** The sub-zone it's in; "" out in the open. */
  subzone: string;
  /** 0..100, like the in-game map. */
  x: number;
  y: number;
}
