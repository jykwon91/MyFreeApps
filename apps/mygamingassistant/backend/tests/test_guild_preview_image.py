"""The guild link-preview card renders a valid 1200x630 PNG under the size limit."""
from __future__ import annotations

import io

import pytest
from PIL import Image

from app.core import guild_preview as cfg
from app.services.wow.guild import guild_preview_image as image_module
from app.services.wow.guild import guild_preview_service as service
from guild_preview_fixtures import make_guild, make_member, realistic_guild


def decode(png: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(png))
    image.load()
    return image


def assert_valid_card(png: bytes) -> None:
    assert len(png) <= cfg.MAX_BYTES
    image = decode(png)
    assert image.format == "PNG"
    assert image.size == (cfg.WIDTH, cfg.HEIGHT)


@pytest.mark.parametrize("faction", ["alliance", "horde", "", "something-new"])
def test_a_realistic_guild_renders_in_every_faction(faction: str) -> None:
    assert_valid_card(service.render_png(realistic_guild(faction)))


def test_the_faction_sets_the_banner_colour() -> None:
    alliance = decode(service.render_png(realistic_guild("alliance"))).convert("RGB").getpixel((1190, 20))
    horde = decode(service.render_png(realistic_guild("horde"))).convert("RGB").getpixel((1190, 20))
    assert alliance[2] > alliance[0]
    assert horde[0] > horde[2]


def test_a_one_member_guild_renders() -> None:
    guild = make_guild([make_member("Zoë", "Ãrthas", class_name="Druid", level=60, honorable_kills=3)])
    assert_valid_card(service.render_png(guild))


def test_a_guild_with_no_member_data_renders_just_the_banner() -> None:
    assert_valid_card(service.render_png(make_guild([], name="x" * 60)))


def test_a_very_long_name_and_class_less_members_still_render() -> None:
    members = [make_member("W" * 40, "I" * 40, class_name=None, honorable_kills=99_999_999, dungeons_done=5)]
    assert_valid_card(service.render_png(make_guild(members, name="W" * 60)))


def test_members_tied_for_first_all_get_the_gold_row() -> None:
    members = [make_member("Ann", "A", honorable_kills=50), make_member("Bob", "B", honorable_kills=50), make_member("Cy", "C", honorable_kills=9)]
    image = decode(service.render_png(make_guild(members))).convert("RGB")
    border_x = image_module.panel_lefts(2)[0] + cfg.PANEL_PAD - 12 + 1

    def is_gold(style_index: int) -> bool:
        style = cfg.ROW_STYLES[style_index]
        pixel = image.getpixel((border_x, cfg.PANEL_TOP + style.top + style.height // 2))
        return pixel[0] > 150 and pixel[2] < 100

    assert is_gold(0)
    assert is_gold(1)
    assert not is_gold(2)
