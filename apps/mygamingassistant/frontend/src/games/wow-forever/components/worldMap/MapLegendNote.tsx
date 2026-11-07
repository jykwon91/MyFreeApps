/** The key and the controls, under the map. */
export default function MapLegendNote() {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-blue-600">●</span> You · <span className="font-medium text-emerald-600">A</span> start ·{" "}
      <span className="font-medium text-red-600">B</span> destination · <span className="font-medium text-amber-500">●</span> direction
      steps (walk solid, fly dashed, boat dotted) · <span className="font-medium text-fuchsia-500">numbered</span> your own route ·
      other coloured dots are your results and the layers you've switched on (the Layers button on the map lists each colour). With a
      result selected, a click on the map or Esc clears it and the map goes back to where it was — unless you've moved it yourself
      since. Otherwise click a zone to open it; Esc, the Zoom out button or Back zooms out. Right-click the map (or press and hold
      on a touch screen) to add a mark or copy coordinates. On your zone's map, click to set where you are. Scroll, pinch or use + /
      − to zoom; drag or use the arrow keys to move.
    </p>
  );
}
