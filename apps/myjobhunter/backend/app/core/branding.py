"""MyJobHunter brand parameters injected into shared email templates."""
from platform_shared.services.email_templates import Branding

MJH_BRANDING = Branding(
    app_name="MyJobHunter",
    accent_color="#2563eb",
    tagline="Your AI-powered job search assistant",
)
