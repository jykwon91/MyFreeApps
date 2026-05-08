"""MyBookkeeper brand parameters injected into shared email templates."""
from platform_shared.services.email_templates import Branding

MBK_BRANDING = Branding(
    app_name="MyBookkeeper",
    accent_color="#22c55e",
    tagline="Your AI-powered bookkeeping assistant",
    header_prefix_html="&#x1F4D2; ",
    footer_suffix="AI-powered bookkeeping",
)
