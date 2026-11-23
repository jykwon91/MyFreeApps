/** A spot the addon can pin: `x` and `y` are percent of the zone map `map` (MGA Waypoints' own coordinates). */
export interface AddonPlace {
  name: string;
  map: number;
  x: number;
  y: number;
  /** "Stormwind City" / "Kharanos, Dun Morogh". */
  where: string;
}
