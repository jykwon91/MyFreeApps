"""Hand-curated WoW Forever raid consumables spec.

Transcribed from the wow-forever-expert verified spec (2026-10-01).

Keys mirror the spec YAML exactly.  ``build.py`` resolves every item_id
against the Forever client's ``ItemSparse`` table and writes the committed
``backend/data/wow/raid_consumables.json``.

Rules:
* All ids must exist in the Forever beta client (1.60.1.69977).
* Display names come from the Forever ``ItemSparse`` at build time —
  the ``name`` fields here are annotations only, not shipped.
* Item 21546 is BLOCKED until verified by a subject-matter expert.
* Items with ``item_id: None`` (e.g. "Repair to 100%") have no Wowhead
  page and are excluded from the JSON; they appear here as documentation.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Blocked ids — excluded from the JSON build regardless of spec listing
# ---------------------------------------------------------------------------
BLOCKED_IDS: frozenset[int] = frozenset({21546})  # "Elixir of Holy Power" — unverified

# ---------------------------------------------------------------------------
# Raid metadata
# ---------------------------------------------------------------------------
# advice_source: "forever" = verified for Forever; "classic" = ported from
# Classic Era and may differ in Forever.
# available: False means the raid has not been announced for Forever.
RAIDS: dict[str, dict] = {
    "barrow_deeps": {
        "name": "Barrow Deeps",
        "size": 10,
        "advice_source": "forever",
        "available": True,
    },
    "hyjal_summit": {
        "name": "Hyjal Summit",
        "size": 20,
        "advice_source": "forever",
        "available": True,
    },
    "onyxia": {
        # Announced as likely but mechanics = Classic; specific items flagged
        # classic_advice at the raid level.
        "name": "Onyxia's Lair",
        "size": 40,
        "advice_source": "classic",
        "available": True,
    },
    "mc": {
        "name": "Molten Core",
        "size": 40,
        "advice_source": "classic",
        "available": False,
    },
    "bwl": {
        "name": "Blackwing Lair",
        "size": 40,
        "advice_source": "classic",
        "available": False,
    },
    "zg": {
        "name": "Zul'Gurub",
        "size": 20,
        "advice_source": "classic",
        "available": False,
    },
    "aq20": {
        "name": "Ruins of Ahn'Qiraj",
        "size": 20,
        "advice_source": "classic",
        "available": False,
    },
    "aq40": {
        "name": "Temple of Ahn'Qiraj",
        "size": 40,
        "advice_source": "classic",
        "available": False,
    },
    "naxx": {
        "name": "Naxxramas",
        "size": 40,
        "advice_source": "classic",
        "available": False,
    },
}

# ---------------------------------------------------------------------------
# Shared Natural Flask list (hyjal_summit and barrow_deeps share the same set)
# ---------------------------------------------------------------------------
_NATURAL_FLASKS: list[dict] = [
    {"item_id": 274273, "why": "Stamina + in-raid bonus (Hyjal/Barrow)", "tier": "tryhard"},
    {"item_id": 274274, "why": "Stamina + in-raid bonus (Hyjal/Barrow)", "tier": "tryhard"},
    {"item_id": 274275, "why": "Stamina + in-raid bonus (Hyjal/Barrow)", "tier": "tryhard"},
    {"item_id": 274276, "why": "Stamina + in-raid bonus (Hyjal/Barrow)", "tier": "tryhard"},
]

# ---------------------------------------------------------------------------
# Raid-specific consumables
# ---------------------------------------------------------------------------
# Items here are recommended ON TOP OF role baseline for a specific raid.
# Optional keys: roles (list[str]), classes (list[str]).
#
# Role values: "tank", "healer", "dps", "dps_physical", "dps_caster", "melee"
#   "dps"    → any damage-dealing role
#   "melee"  → physical dps (normalised to dps_physical in the service)
# Class values: lowercase WoW class names.
RAID_SPECIFIC: dict[str, list[dict]] = {
    "onyxia": [
        {
            "item_id": 13457,
            "why": "absorb Deep Breath / P2 fire",
            "tier": "tryhard",
        },
    ],
    "hyjal_summit": _NATURAL_FLASKS,
    "barrow_deeps": _NATURAL_FLASKS,
    "mc": [
        {
            "item_id": 13457,
            "why": "Ragnaros / Baron fire damage",
            "tier": "recommended",
        },
        {
            "item_id": 6049,
            "why": "budget fire protection alternative",
            "tier": "recommended",
        },
    ],
    "bwl": [
        {
            "item_id": 15138,
            "why": "Nefarian Shadow Flame instakill without it",
            "tier": "essential",
        },
        {
            "item_id": 13457,
            "why": "Vael / Firemaw / Ebonroc fire damage",
            "tier": "recommended",
        },
        {
            "item_id": 3387,
            "why": "drop aggro or survive a mistake",
            "tier": "tryhard",
        },
    ],
    "zg": [],
    "aq20": [],
    "aq40": [
        {
            "item_id": 13458,
            "why": "Huhuran poison — tank/healer must have it",
            "tier": "essential",
            "roles": ["tank", "healer"],
        },
        {
            "item_id": 13458,
            "why": "Huhuran poison — dps recommended",
            "tier": "recommended",
            "roles": ["dps"],
        },
        {
            "item_id": 3829,
            "why": "Viscidus frost hits (melee dps)",
            "tier": "recommended",
            "roles": ["melee"],
        },
        {
            "item_id": 17708,
            "why": "Viscidus (frost casters)",
            "tier": "recommended",
            "classes": ["mage"],
        },
    ],
    "naxx": [
        {
            "item_id": 13456,
            "why": "Sapphiron (plus frost-resist gear)",
            "tier": "essential",
        },
        {
            "item_id": 13459,
            "why": "Loatheb shadow damage",
            "tier": "recommended",
        },
        {
            "item_id": 13446,
            "why": "Loatheb blocks most healing — emergency self-heal",
            "tier": "essential",
        },
    ],
}

# ---------------------------------------------------------------------------
# Role baselines
# ---------------------------------------------------------------------------
ROLE_BASELINE: dict[str, list[dict]] = {
    "tank": [
        {"item_id": 13446, "why": "emergency self-heal", "tier": "essential"},
        {"item_id": 13445, "why": "armor", "tier": "essential"},
        {"item_id": 3825, "why": "max HP boost", "tier": "recommended"},
        {"item_id": 13455, "why": "armor burst cooldown", "tier": "recommended"},
        {"item_id": 21151, "why": "+Stamina drink", "tier": "recommended"},
        {"item_id": 13452, "why": "crit / dodge for threat", "tier": "tryhard"},
        {"item_id": 13510, "why": "+HP flask", "tier": "tryhard"},
        {"item_id": 3387, "why": "survive a mistake", "tier": "tryhard"},
        {"item_id": 13442, "why": "rage burst (Warriors only)", "tier": "tryhard", "classes": ["warrior"]},
    ],
    "healer": [
        {"item_id": 13444, "why": "mana", "tier": "essential"},
        {"item_id": 20007, "why": "mana regen", "tier": "recommended"},
        {"item_id": 12662, "why": "mana restore (costs HP)", "tier": "recommended"},
        {"item_id": 20520, "why": "mana restore — shares Demonic Rune cooldown", "tier": "recommended"},
        {"item_id": 11952, "why": "HP + mana restoration", "tier": "tryhard"},
        {"item_id": 13511, "why": "+mana flask", "tier": "tryhard"},
    ],
    "dps_physical": [
        {"item_id": 13446, "why": "emergency self-heal", "tier": "essential"},
        {"item_id": 13452, "why": "Agility + crit", "tier": "recommended"},
        {"item_id": 9206, "why": "Strength", "tier": "recommended"},
        {"item_id": 12451, "why": "Strength", "tier": "tryhard"},
        {"item_id": 12460, "why": "attack power (not with Firewater)", "tier": "tryhard"},
        {"item_id": 12820, "why": "attack power", "tier": "recommended"},
        {"item_id": 8410, "why": "Strength", "tier": "tryhard"},
        {"item_id": 8412, "why": "Agility", "tier": "tryhard"},
    ],
    "dps_caster": [
        {"item_id": 13444, "why": "mana", "tier": "essential"},
        {"item_id": 13454, "why": "spell damage", "tier": "recommended"},
        {"item_id": 9264, "why": "shadow damage", "tier": "recommended", "classes": ["warlock", "priest"]},
        {"item_id": 17708, "why": "frost damage", "tier": "recommended", "classes": ["mage"]},
        {"item_id": 13512, "why": "spell damage flask", "tier": "tryhard"},
        {"item_id": 8423, "why": "Intellect", "tier": "tryhard"},
    ],
}

# ---------------------------------------------------------------------------
# Class extras
# ---------------------------------------------------------------------------
CLASS_EXTRAS: dict[str, list[dict]] = {
    "warrior": [
        {"item_id": 12404, "why": "blade weapon sharpening", "tier": "recommended"},
        {"item_id": 12643, "why": "blunt weapon weighting", "tier": "recommended"},
        {"item_id": 18262, "why": "+2% crit chance", "tier": "tryhard"},
    ],
    "rogue": [
        {"item_id": 8928, "why": "main-hand poison", "tier": "essential"},
        {"item_id": 20844, "why": "off-hand poison", "tier": "recommended"},
        {"item_id": 12404, "why": "if not poisoning that hand", "tier": "recommended"},
        {"item_id": 18262, "why": "+2% crit chance", "tier": "tryhard"},
    ],
    "hunter": [
        {"item_id": 11285, "why": "ammo (bows)", "tier": "essential"},
        {"item_id": 10512, "why": "ammo (guns)", "tier": "essential"},
        {"item_id": 18042, "why": "better arrows", "tier": "recommended"},
        {"item_id": 15997, "why": "better shells", "tier": "recommended"},
    ],
    "warlock": [
        {"item_id": 6265, "why": "summons / Soulstone / Healthstones", "tier": "essential"},
    ],
    "mage": [
        {"item_id": 17020, "why": "Arcane Brilliance reagent", "tier": "essential"},
        {"item_id": 20749, "why": "spell damage + crit", "tier": "recommended"},
    ],
    "priest": [
        {"item_id": 17029, "why": "Prayer of Fortitude reagent", "tier": "essential"},
        {"item_id": 20748, "why": "healing + mana regen (holy/disc)", "tier": "recommended", "roles": ["healer"]},
        {"item_id": 20749, "why": "shadow spec spell damage", "tier": "recommended", "roles": ["dps"]},
    ],
    "shaman": [
        {"item_id": 17030, "why": "Reincarnation reagent", "tier": "essential"},
        {"item_id": 20748, "why": "healing + mana regen (resto)", "tier": "recommended", "roles": ["healer"]},
    ],
    "paladin": [
        {"item_id": 21177, "why": "Greater Blessings reagent", "tier": "essential"},
        {"item_id": 20748, "why": "healing + mana regen (holy)", "tier": "recommended", "roles": ["healer"]},
    ],
    "druid": [
        {"item_id": 17026, "why": "Gift of the Wild reagent", "tier": "essential"},
    ],
}

# ---------------------------------------------------------------------------
# Food
# ---------------------------------------------------------------------------
# The "raid" key is always included (feast / group food).
# Other keys match role names directly.
FOOD: dict[str, list[dict]] = {
    "raid": [
        {"item_id": 238641, "why": "serves 40; grants AP/spellpower/healing/Stamina for 45 min", "tier": "recommended"},
    ],
    "tank": [
        {"item_id": 21023, "why": "+25 Stamina", "tier": "recommended"},
        {"item_id": 12218, "why": "+15 Stamina, cheap and easy to obtain", "tier": "essential"},
        {"item_id": 286152, "why": "+150 armor", "tier": "tryhard"},
    ],
    "dps_physical": [
        {"item_id": 20452, "why": "+20 Strength", "tier": "recommended"},
        {"item_id": 18045, "why": "+15 Agility", "tier": "essential"},
        {"item_id": 13934, "why": "+40 attack power", "tier": "recommended"},
        {"item_id": 13928, "why": "+1% crit chance", "tier": "tryhard"},
    ],
    "dps_caster": [
        {"item_id": 13931, "why": "+22 spell damage", "tier": "essential"},
    ],
    "healer": [
        {"item_id": 232438, "why": "+22 healing power", "tier": "essential"},
        {"item_id": 249870, "why": "mana per 5 + 44 healing power", "tier": "recommended"},
        {"item_id": 18254, "why": "+15 Intellect", "tier": "recommended"},
    ],
}

# ---------------------------------------------------------------------------
# Always — every raider regardless of class / role
# ---------------------------------------------------------------------------
# Note: the item with item_id=None ("Repair to 100%") has no Wowhead page
# and is excluded from the JSON; include it mentally before every raid.
ALWAYS: list[dict] = [
    {"item_id": 13446, "why": "every raider needs an emergency heal", "tier": "essential"},
    {"item_id": 14530, "why": "free healing between pulls", "tier": "essential"},
    # item_id None — Repair to 100%: "deaths cost durability" — excluded from JSON
    {"item_id": 5634, "why": "removes stuns / roots from some bosses", "tier": "recommended"},
    {"item_id": 9421, "why": "ask your warlock", "tier": "recommended"},
]
