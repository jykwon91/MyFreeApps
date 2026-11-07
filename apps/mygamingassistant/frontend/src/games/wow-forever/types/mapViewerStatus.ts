import type { MAP_VIEWER_STATUS } from "@/games/wow-forever/data/worldMap/mapViewer";

export type MapViewerStatus = (typeof MAP_VIEWER_STATUS)[keyof typeof MAP_VIEWER_STATUS];
