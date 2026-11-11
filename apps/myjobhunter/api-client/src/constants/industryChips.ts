import type { IndustryChip } from "../types/discovery/industry-chip";

/**
 * Industries a JSearch saved search can leave out. Each `value` is a key in the backend's
 * `services/discovery/industry_denylists.py`, which expands it to keywords at fetch time; a chip
 * with no backend entry is kept on the saved search but adds nothing to the filter.
 */
export const INDUSTRY_CHIPS: IndustryChip[] = [
  { value: "government_defense", label: "Government & Defense" },
  { value: "staffing_recruiting", label: "Staffing / Recruiting" },
  { value: "consulting_big4", label: "Big 4 Consulting" },
  { value: "crypto_web3", label: "Crypto / Web3" },
  { value: "adtech_gambling", label: "Ad Tech / Gambling" },
];
