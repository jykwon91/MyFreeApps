"""__APP_DISPLAY_NAME__ brand parameters injected into shared email templates."""
from platform_shared.services.email_templates import Branding

APP_BRANDING = Branding(
    app_name="__APP_DISPLAY_NAME__",
    accent_color="#6366f1",
    tagline="",
)
