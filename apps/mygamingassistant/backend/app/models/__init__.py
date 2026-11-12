# Import all models so that Alembic's env.py sees them when it imports this module.
# Order matters for forward references — declare referenced tables before referencing ones.

from app.models.user.user import User  # noqa: F401
from app.models.user.refresh_session import RefreshSession  # noqa: F401

# The scheduler process's job table (status + run requests from the API)
from app.models.system.scheduler_job import SchedulerJob  # noqa: F401

# Game domain — taxonomy first, then dependent tables
from app.models.game.game import Game  # noqa: F401
from app.models.game.agent import Agent  # noqa: F401
from app.models.game.utility_type import UtilityType  # noqa: F401
from app.models.game.map import Map  # noqa: F401
from app.models.game.map_zone import MapZone  # noqa: F401
from app.models.game.site import Site  # noqa: F401
from app.models.game.source import Source  # noqa: F401
from app.models.game.lineup import Lineup  # noqa: F401
from app.models.game.lineup_package import LineupPackage, LineupPackageLineup  # noqa: F401

# WoW Forever World Map — locations captured in game by the companion addon
from app.models.wow.map_capture import WowMapCapture  # noqa: F401

# WoW Forever auction-house prices — refreshed on a schedule from a price source
from app.models.wow.price_feed import WowPriceFeed  # noqa: F401
from app.models.wow.item_price import WowItemPrice  # noqa: F401
# WoW Forever server status history — recorded on a schedule from Blizzard's status
from app.models.wow.server_status_sample import WowServerStatusSample  # noqa: F401
# WoW Forever characters looked up on "Your character" — guild first (a character
# FKs to it), then the last sheet + daily history, then known recipes.
from app.models.wow.guild import WowGuild  # noqa: F401
from app.models.wow.character import WowCharacter  # noqa: F401
from app.models.wow.character_daily_metric import WowCharacterDailyMetric  # noqa: F401
from app.models.wow.character_profession_skill import WowCharacterProfessionSkill  # noqa: F401
from app.models.wow.faction import WowFaction  # noqa: F401
from app.models.wow.character_reputation import WowCharacterReputation  # noqa: F401
from app.models.wow.recipe import WowRecipe  # noqa: F401
from app.models.wow.character_recipe import WowCharacterRecipe  # noqa: F401
# WoW Forever feature requests — story first (submission + vote FK to it)
from app.models.wow.feature_story import WowFeatureStory  # noqa: F401
from app.models.wow.feature_submission import WowFeatureSubmission  # noqa: F401
from app.models.wow.feature_vote import WowFeatureVote  # noqa: F401

# WoW Raid signup bot — guild config, events, signups, member prefs, notification outbox
# Order: guild first (no deps), then event (fk→guild), signup (fk→event),
# member_pref (fk→guild), notification (fk→event), attendance (fk→event).
from app.models.wow.wow_raid_guild import WowRaidGuild  # noqa: F401
from app.models.wow.wow_raid_series import WowRaidSeries  # noqa: F401
from app.models.wow.wow_raid_event import WowRaidEvent  # noqa: F401
from app.models.wow.wow_raid_signup import WowRaidSignup  # noqa: F401
from app.models.wow.wow_raid_plan_link import WowRaidPlanLink  # noqa: F401
from app.models.wow.wow_raid_attendance import WowRaidAttendance  # noqa: F401
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref  # noqa: F401
from app.models.wow.wow_raid_notification import WowRaidNotification  # noqa: F401

# Shared models from platform_shared. Importing them here registers their
# tables with ``Base.metadata`` so Alembic autogenerate + Base.metadata.create_all
# see the schema. MGA does not own these tables — platform_shared is canonical.
from platform_shared.db.models.audit_log import AuditLog  # noqa: F401
from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401
# Durable global daily cap for the public WoW item reader (migration 0023).
from platform_shared.db.models.daily_usage_counter import DailyUsageCounter  # noqa: F401
