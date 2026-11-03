import pytest


async def test_clearing_display_name_succeeds(user_factory, as_user) -> None:
    async with await as_user(await user_factory()) as client:
        assert (await client.patch("/users/me", json={"display_name": "Ada"})).status_code == 200
        resp = await client.patch("/users/me", json={"display_name": "   "})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == ""


@pytest.mark.parametrize("name", [None, "x" * 101, "a\x00b"])
async def test_invalid_display_name_returns_422_and_keeps_saved_name(
    user_factory, as_user, name: str | None,
) -> None:
    async with await as_user(await user_factory()) as client:
        await client.patch("/users/me", json={"display_name": "Ada"})
        resp = await client.patch("/users/me", json={"display_name": name})
        me = await client.get("/users/me")
    assert resp.status_code == 422
    assert me.json()["display_name"] == "Ada"


async def test_omitting_display_name_keeps_saved_name(user_factory, as_user) -> None:
    async with await as_user(await user_factory()) as client:
        await client.patch("/users/me", json={"display_name": "Ada"})
        resp = await client.patch("/users/me", json={})
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Ada"
