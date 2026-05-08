/** Industry-exclusion chips rendered on the New Saved Search dialog.
 *
 * Each chip's ``value`` matches a key in
 * ``apps/myjobhunter/backend/app/services/discovery/industry_denylists.py``.
 * The backend expands the chip to a substring keyword list at fetch
 * time; the frontend only shows the label.
 *
 * Adding a new chip
 * =================
 *
 * 1. Pick a snake_case key (must match the backend constant key).
 * 2. Add a row here with a short, scannable label.
 * 3. Mirror the entry in the backend constant. Without the backend
 *    expansion the chip is a no-op (which is silently OK — the
 *    operator's selection is preserved on the saved search but no
 *    keywords are added to the filter).
 */

export interface IndustryChip {
  value: string;
  label: string;
}

export const INDUSTRY_CHIPS: IndustryChip[] = [
  { value: "government_defense", label: "Government & Defense" },
  { value: "staffing_recruiting", label: "Staffing / Recruiting" },
  { value: "consulting_big4", label: "Big 4 Consulting" },
  { value: "crypto_web3", label: "Crypto / Web3" },
  { value: "adtech_gambling", label: "Ad Tech / Gambling" },
];
