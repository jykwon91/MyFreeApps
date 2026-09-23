const ADDON_URL = "https://github.com/jykwon91/MyFreeApps/tree/main/apps/mygamingassistant/addons/MGACompanion";

/** How to install and use the MGA Companion addon, plus where the data comes from. */
export default function AddonHelp() {
  return (
    <section aria-labelledby="wm-help" className="rounded-xl border bg-card p-4 space-y-3 text-sm">
      <h2 id="wm-help" className="text-lg font-semibold">
        Waypoints in the game
      </h2>
      <p>
        <strong>Copy in-game waypoint</strong> gives you a <code>/mga way …</code> command. Paste it into the chat box and your map
        pin and the arrow on your screen point to the spot. It needs the free MGA Companion addon:
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Download the <code>MGACompanion</code> folder from{" "}
          <a href={ADDON_URL} target="_blank" rel="noreferrer" className="text-primary underline">
            GitHub
          </a>{" "}
          (both files: <code>MGACompanion.toc</code> and <code>MGACompanion.lua</code>).
        </li>
        <li>
          Put the folder in your WoW Forever game folder under <code>Interface\AddOns\</code>, so you have{" "}
          <code>Interface\AddOns\MGACompanion\MGACompanion.toc</code>.
        </li>
        <li>Restart the game (or type /reload) and tick MGA Companion in the AddOns list on the character screen.</li>
        <li>
          Paste a copied command, e.g. <code>/mga way 1429 44.4 66.2 Maximillian Crowe</code>. <code>/mga clear</code> removes the pin.
        </li>
      </ol>
      <p>
        <strong>Copy /way</strong> gives a plain <code>/way Elwynn Forest 44.4 66.2</code> for coordinate addons like TomTom. Cities
        don't always accept pins — use the zone around the city then.
      </p>
      <h3 className="font-semibold">Where the locations come from</h3>
      <p className="text-muted-foreground">
        NPC locations are from the Classic 1.12 world (cmangos classic-db, GPL-3.0) and may differ in Forever — each row says so.
        Maps, flight paths, boats and zeppelins are from the WoW Forever beta client data (via wago.tools). World of Warcraft and its
        maps are © Blizzard Entertainment; this is a free fan tool.
      </p>
    </section>
  );
}
