interface MapGroundProps {
  mapId: number;
  mapName: string;
  /** The drawn art failed to load (the markers' grid shows instead). */
  drawnFailed: boolean;
  onDrawnError: () => void;
  /** The satellite picture to lay over the drawn map, or null. */
  satelliteSrc: string | null;
  satelliteShown: boolean;
  onSatelliteLoad: () => void;
  onSatelliteError: () => void;
}

const FILL = "absolute inset-0 h-full w-full";

/**
 * The map's ground: the client's drawn art, with the satellite view laid over
 * it when asked for. The drawn art stays underneath while the satellite
 * picture downloads, and the satellite picture fades in once it has loaded —
 * no blank flash, no layout shift. Both fill the same 0..100 frame, so every
 * marker stays on the same spot.
 */
export default function MapGround(props: MapGroundProps) {
  const { satelliteSrc, satelliteShown } = props;
  return (
    <>
      {!props.drawnFailed && (
        <img
          src={`/wow-maps/${props.mapId}.webp`}
          alt={satelliteShown ? "" : `${props.mapName} map`}
          aria-hidden={satelliteShown || undefined}
          data-testid="map-art"
          draggable={false}
          decoding="async"
          onError={props.onDrawnError}
          className={FILL}
        />
      )}
      {satelliteSrc && (
        <img
          src={satelliteSrc}
          alt={satelliteShown ? `${props.mapName} satellite map` : ""}
          data-testid="map-satellite"
          draggable={false}
          decoding="async"
          onLoad={props.onSatelliteLoad}
          onError={props.onSatelliteError}
          className={`${FILL} transition-opacity duration-200 motion-reduce:transition-none ${satelliteShown ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </>
  );
}
