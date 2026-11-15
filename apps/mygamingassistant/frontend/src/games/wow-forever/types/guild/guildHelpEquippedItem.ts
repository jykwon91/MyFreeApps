/** One item a guild member currently wears (`GET /api/wow/guilds/{slug}/help`). */
export interface GuildHelpEquippedItem {
  /** Blizzard's slot: HEAD, NECK, WRIST, MAIN_HAND, FINGER_1, etc. */
  slot: string;
  item_id: number;
  name: string;
  item_level: number;
  /** Blizzard's inventory_type: HEAD, TWOHWEAPON, SHIELD, WEAPONMAINHAND, etc. */
  inventory_type: string;
  /** Non-empty when the item already carries an enchant. */
  enchantments: string[];
}
