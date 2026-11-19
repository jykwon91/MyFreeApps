"""scripts.wow_crates: crates, tiers, bundles and material ids from Blizzard's item answers."""
import httpx
import pytest

from scripts.wow_crates.build import crates_json
from scripts.wow_crates.crates import crate_bundles, crate_items, crate_quality, crate_tier, material_id, material_index
from scripts.wow_talents.blizzard_api import BlizzardStatic

FILL = "Use: Fill the crate with any bundle from the following list:"


def _item(*descriptions: str) -> dict:
    return {"preview_item": {"spells": [{"description": d} for d in descriptions]}}


def test_crate_items_are_only_the_labelled_crates():
    names = {"248686": "Waylaid Crate: Journeyman Herbs", "248549": "Waylaid Crate", "275642": "Waylaid Herbs", "2447": "Peacebloom"}
    assert crate_items(names) == [(248686, "Waylaid Crate: Journeyman Herbs")]


@pytest.mark.parametrize(
    ("name", "tier"),
    [
        ("Waylaid Crate: Apprentice Ore", "apprentice"),
        ("Waylaid Crate: Journeyman Parts", "journeyman"),
        ("Waylaid Crate: Earthly Expert Herbs", "expert"),
        ("Waylaid Crate: Flowering Artisan Herbs", "artisan"),
    ],
)
def test_crate_tier_is_the_tier_word_in_the_name(name, tier):
    assert crate_tier(name) == tier


def test_a_crate_with_no_tier_word_stops_the_build():
    with pytest.raises(SystemExit, match="tier"):
        crate_tier("Waylaid Crate: Mystery Goods")


@pytest.mark.parametrize(("blizzard", "quality"), [("COMMON", "common"), ("UNCOMMON", "uncommon")])
def test_crate_quality_is_the_item_quality_lower_cased(blizzard, quality):
    assert crate_quality(248682, {"quality": {"type": blizzard, "name": blizzard.title()}}) == quality


@pytest.mark.parametrize("item", [{"quality": {"type": "RARE"}}, {"quality": {}}, {}])
def test_a_crate_of_another_or_no_quality_stops_the_build(item):
    with pytest.raises(SystemExit, match="quality"):
        crate_quality(248682, item)


def test_bundles_read_crlf_and_lf_lists_in_order():
    crlf = _item("Use: Read the label.", f"{FILL}\r\n- 10 Stranglekelp\r\n- 10 Kingsblood")
    lf = _item(f"{FILL}\n- 20 Peacebloom\n- 10 Khadgar's Whisker")
    assert crate_bundles(1, crlf) == [(10, "Stranglekelp"), (10, "Kingsblood")]
    assert crate_bundles(2, lf) == [(20, "Peacebloom"), (10, "Khadgar's Whisker")]


@pytest.mark.parametrize(
    "item",
    [_item("Use: Read the label."), _item(f"{FILL}\n- ten Peacebloom"), _item(FILL), _item(f"{FILL}\n- 1 A", f"{FILL}\n- 1 B")],
)
def test_bundle_text_the_build_cant_read_stops_it(item):
    with pytest.raises(SystemExit):
        crate_bundles(9, item)


def test_material_id_narrows_same_named_items_to_the_one_forever_knows():
    index = material_index({"11099": "Dark Iron Ore", "11370": "Dark Iron Ore", "2447": "Peacebloom"})
    asked: list[int] = []

    def known(item_id: int) -> bool:
        asked.append(item_id)
        return item_id == 11370

    assert material_id("Peacebloom", index, known) == 2447
    assert asked == []
    assert material_id("Dark Iron Ore", index, known) == 11370


@pytest.mark.parametrize("known", [lambda _i: True, lambda _i: False])
def test_material_id_stops_when_not_exactly_one_item_is_left(known):
    index = material_index({"1": "Twin", "2": "Twin"})
    with pytest.raises(SystemExit, match="Twin"):
        material_id("Twin", index, known)
    with pytest.raises(SystemExit, match="Nowhere"):
        material_id("Nowhere", index, known)


def test_item_known_is_false_on_404_and_stops_on_other_errors():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/token"):
            return httpx.Response(200, json={"access_token": "t"})
        status = {"/data/wow/item/1": 200, "/data/wow/item/2": 404}.get(request.url.path, 500)
        return httpx.Response(status, json={})

    with BlizzardStatic("id", "secret", transport=httpx.MockTransport(handler), sleep=lambda _s: None) as api:
        assert api.item_known(1) is True
        assert api.item_known(2) is False
        with pytest.raises(SystemExit):
            api.item_known(3)


def test_crates_json_is_one_crate_per_line():
    text = crates_json("1.60.1.1", [{"id": 1, "name": "A", "tier": "expert", "bundles": []}, {"id": 2, "name": "B", "tier": "artisan", "bundles": []}])
    lines = text.splitlines()
    assert lines[2] == '{"id":1,"name":"A","tier":"expert","bundles":[]},'
    assert lines[3] == '{"id":2,"name":"B","tier":"artisan","bundles":[]}'
