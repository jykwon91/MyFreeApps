"""Unit tests for platform_shared.infra.render: _build_permissions_policy and the
registry_images guard.

These tests are intentionally narrow — they only cover the new helper, not the
full render pipeline (that's covered by TestInfraTemplateDrift in
test_app_conformance.py via the diff_app call).
"""
from __future__ import annotations

from pathlib import Path

import pytest

from platform_shared.infra.render import (
    _PERMISSIONS_POLICY_FEATURES,
    _build_permissions_policy,
    render_app,
)


class TestBuildPermissionsPolicy:
    def test_default_all_deny(self) -> None:
        """Empty self_allow → every feature gets ()."""
        result = _build_permissions_policy([])
        for feature in _PERMISSIONS_POLICY_FEATURES:
            assert f"{feature}=()" in result, (
                f"feature '{feature}' should be denied but was not in: {result}"
            )
        assert "(self)" not in result

    def test_microphone_self_allow(self) -> None:
        """[microphone] → microphone=(self), all others ()."""
        result = _build_permissions_policy(["microphone"])
        assert "microphone=(self)" in result
        for feature in _PERMISSIONS_POLICY_FEATURES:
            if feature != "microphone":
                assert f"{feature}=()" in result, (
                    f"feature '{feature}' should be denied but was not in: {result}"
                )

    def test_multiple_self_allows(self) -> None:
        """Multiple features can all be self-allowed simultaneously."""
        result = _build_permissions_policy(["microphone", "camera"])
        assert "microphone=(self)" in result
        assert "camera=(self)" in result
        for feature in _PERMISSIONS_POLICY_FEATURES:
            if feature not in {"microphone", "camera"}:
                assert f"{feature}=()" in result

    def test_all_features_self_allow(self) -> None:
        """Every feature can be self-allowed at once."""
        result = _build_permissions_policy(list(_PERMISSIONS_POLICY_FEATURES))
        assert "()" not in result
        for feature in _PERMISSIONS_POLICY_FEATURES:
            assert f"{feature}=(self)" in result

    def test_unknown_feature_raises(self) -> None:
        """A typo or unknown feature name raises ValueError."""
        with pytest.raises(ValueError, match="unknown feature"):
            _build_permissions_policy(["microphone", "bluetooth"])

    def test_unknown_feature_error_lists_known_features(self) -> None:
        """The error message names the allowed features so the operator knows what to fix."""
        with pytest.raises(ValueError) as exc_info:
            _build_permissions_policy(["webhid"])
        msg = str(exc_info.value)
        assert "webhid" in msg
        assert "microphone" in msg  # sample of a known feature present in the error

    def test_canonical_order_preserved(self) -> None:
        """The output preserves _PERMISSIONS_POLICY_FEATURES order regardless of
        self_allow input order."""
        result = _build_permissions_policy(["browsing-topics", "accelerometer"])
        parts = [p.split("=")[0] for p in result.split(", ")]
        assert parts == list(_PERMISSIONS_POLICY_FEATURES)

    def test_matches_previously_hardcoded_string(self) -> None:
        """With an empty self_allow list the output must exactly match the string
        that was previously hardcoded in Caddyfile.docker.j2, preserving the
        byte-identical guarantee for existing apps."""
        expected = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=(), "
            "interest-cohort=(), browsing-topics=()"
        )
        assert _build_permissions_policy([]) == expected


def test_render_refuses_an_on_vps_build(tmp_path: Path) -> None:
    """An on-VPS build would read its build context from the shared checkout,
    not the commit the app's CI passed, so only registry apps render."""
    real_root = Path(__file__).resolve().parents[3]
    app_dir = tmp_path / "apps" / "myrecipes"
    app_dir.mkdir(parents=True)
    config = (real_root / "apps" / "myrecipes" / "app.yaml").read_text("utf-8")
    (app_dir / "app.yaml").write_text(
        config.replace("registry_images: true", "registry_images: false"), "utf-8",
    )
    with pytest.raises(ValueError, match="registry_images must be true"):
        render_app(tmp_path, "myrecipes", write=False)
