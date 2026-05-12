export interface Game {
  id: string;
  slug: string;
  name: string;
  side_a_label: string;
  side_b_label: string;
}

export interface GameMap {
  id: string;
  slug: string;
  name: string;
  minimap_url: string | null;
}

export interface MapZone {
  id: string;
  slug: string;
  name: string;
  polygon_points: number[][];
}

export interface MapSite {
  id: string;
  slug: string;
  name: string;
}

export interface UtilityType {
  id: string;
  slug: string;
  name: string;
}

export interface MapDetail {
  id: string;
  slug: string;
  name: string;
  minimap_url: string | null;
  zones: MapZone[];
  sites: MapSite[];
  utility_types: UtilityType[];
}
