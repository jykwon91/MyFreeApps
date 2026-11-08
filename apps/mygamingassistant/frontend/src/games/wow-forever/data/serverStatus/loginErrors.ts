import { PROVENANCE_DETAIL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { LoginErrorEntry } from "@/games/wow-forever/types/serverStatus/loginErrorEntry";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

const LOGIN_HELP: ProvenanceTag = { provenance: PROVENANCE.unconfirmed, detail: PROVENANCE_DETAIL.loginHelp };

/**
 * Common login and connection problems, in our own words — never copied from Blizzard, Wowhead or
 * any other site. Most common first. `id` is the `#err-<id>` deep link: never change one.
 * Tag an entry "Official" only if it links Blizzard's own support article for that error.
 */
export const LOGIN_ERRORS: readonly LoginErrorEntry[] = [
  {
    id: "wow51900319",
    code: "WOW51900319",
    title: "You have been disconnected from the server",
    aliases: ["disconnected", "dc", "kicked", "lost connection"],
    meaning:
      "The game lost its connection to the realm while you were playing. It's usually a short drop on your own connection, a VPN, or the realm restarting.",
    steps: [
      "Check the realm status at the top of this page. If it's down, wait for it to come back.",
      "Wait a minute, then log in again.",
      "Use a cable instead of Wi‑Fi if you can, or restart your router.",
      "Turn off any VPN or proxy while you play.",
      "If it keeps happening, look in the game's System → Network settings and turn off the option that optimizes the network for speed, if it's there.",
    ],
    provenance: LOGIN_HELP,
  },
  {
    id: "blz51900003",
    code: "BLZ51900003",
    title: "Battle.net sign-in fails",
    aliases: ["battle.net", "battlenet", "sign in failed", "authentication"],
    meaning:
      "The Battle.net part of the login failed before you reached the realm. It's usually a stale sign-in or a hiccup on Blizzard's login service.",
    steps: [
      "Close the game and the Battle.net app completely, then open them again.",
      "Log out of the Battle.net app and sign back in.",
      "Check the realm status on this page. If every realm looks down, it's on Blizzard's side — wait and try again.",
      "Restart your computer if it still fails.",
    ],
    provenance: LOGIN_HELP,
  },
  {
    id: "unable-to-connect",
    code: null,
    title: "Unable to connect",
    aliases: ["cant connect", "cannot connect", "try again later", "login server down", "maintenance"],
    meaning:
      "The game couldn't reach the login servers at all. Either the servers are down (maintenance or an outage) or something on your side is blocking the connection.",
    steps: [
      "Check the realm status and recent outages on this page. Down for everyone means maintenance or an outage — wait it out.",
      "Restart your router and try again.",
      "Make sure your firewall or antivirus isn't blocking the game.",
      "Turn off any VPN or proxy.",
    ],
    provenance: LOGIN_HELP,
  },
  {
    id: "character-not-found",
    code: null,
    title: "Character not found",
    aliases: ["characters missing", "no characters", "character list empty"],
    meaning:
      "You reached the realm, but it couldn't load your character. This usually happens right after a realm restart or when it's very busy.",
    steps: [
      "Wait a few minutes, then try again.",
      "Go back to the character list and pick the character again.",
      "Check that the realm shows up on this page.",
      "Restart the game. If it still happens long after the realm is back up, contact Blizzard support.",
    ],
    provenance: LOGIN_HELP,
  },
  {
    id: "logging-in-stuck",
    code: null,
    title: "Stuck on \"Logging in to game server\"",
    aliases: ["logging in", "login stuck", "hangs at login", "game server"],
    meaning:
      "The realm is slow to accept you. It's often busy, restarting, or about to put you in a queue.",
    steps: [
      "Give it about two minutes before cancelling.",
      "Cancel and try again.",
      "Check the realm status on this page.",
      "Restart the game and check your connection.",
    ],
    provenance: LOGIN_HELP,
  },
  {
    id: "transferring-stuck",
    code: null,
    title: "Stuck on \"Transferring\"",
    aliases: ["transferring", "loading screen", "stuck loading"],
    meaning:
      "The realm is handing your character over and the handover stalled. It happens when the realm is busy or your connection drops for a moment.",
    steps: [
      "Wait a minute or two.",
      "Cancel, go back to the character list and enter the world again.",
      "Restart the game.",
      "Check your connection, and turn off any VPN.",
    ],
    provenance: LOGIN_HELP,
  },
  {
    id: "realm-queue",
    code: null,
    title: "Long queue or \"Position in queue\"",
    aliases: ["queue", "queued", "realm full", "wait time", "position in queue"],
    meaning:
      "The realm is full, so players wait in line to get in. If you disconnect or close the game you usually lose your place.",
    steps: [
      "Leave the game open and connected while you wait.",
      "Use a stable connection — a drop can send you to the back of the line.",
      "Peak hours (evenings, launch days) are the busiest; try earlier or later.",
      "For a new character, consider a less busy realm.",
    ],
    provenance: LOGIN_HELP,
  },
  {
    id: "already-logged-in",
    code: null,
    title: "This account is already logged in",
    aliases: ["logged in elsewhere", "another location", "account in use"],
    meaning:
      "The realm still thinks your last session is open — usually after a crash — or someone else is logged in to your account.",
    steps: [
      "Wait a minute or two for the old session to time out, then log in again.",
      "If you didn't play anywhere else, change your Battle.net password and turn on its authenticator.",
    ],
    provenance: LOGIN_HELP,
  },
];
