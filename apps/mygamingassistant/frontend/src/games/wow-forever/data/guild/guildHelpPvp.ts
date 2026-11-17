/**
 * PvP weights for Help each other are an estimate built from the PvE ones (`pvpWeights`): no Classic PvP
 * stat weights are published, only advice. Classic PvP guides put Stamina at the top: Icy Veins' Classic
 * warlock PvP gear page ("prioritize Stamina in PvP") and warrior PvP gear page ("high Stamina and
 * Strength / Attack Power / Critical Strike / Armor pieces"), checked 2026-11-17:
 *   https://www.icy-veins.com/wow-classic/warlock-pvp-bis-gear-trinkets-and-switch-items
 *   https://www.icy-veins.com/wow-classic/warrior-pvp-bis-gear-trinkets-and-switch-items
 *
 * The rule: one point of Stamina counts as this share of one point of the wearer's best main stat.
 * 1 = as much as their best main stat (operator chose guide-built estimates, 2026-11-17).
 */
export const PVP_STAMINA_SHARE = 1;
