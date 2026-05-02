"""Profile domain CRUD write tests (Phase 3).

Covers:
  Profile:
  - GET /profile returns a ProfileResponse (creates lazily if none exists)
  - PATCH /profile updates allowed fields
  - PATCH /profile rejects extra fields (422)

  Work history:
  - POST /work-history happy path returns 201
  - POST /work-history rejects unauthenticated 401
  - GET /work-history lists caller's items
  - GET /work-history does not leak other users' items
  - PATCH /work-history/{id} happy path
  - PATCH /work-history/{id} returns 404 for cross-tenant access
  - DELETE /work-history/{id} hard-deletes and returns 204
  - DELETE /work-history/{id} returns 404 for cross-tenant access

  Education:
  - POST /education happy path returns 201
  - GET /education lists caller's items
  - GET /education does not leak other users' items
  - PATCH /education/{id} happy path
  - PATCH /education/{id} returns 404 for cross-tenant access
  - DELETE /education/{id} hard-deletes and returns 204

  Skills:
  - POST /skills happy path returns 201
  - POST /skills returns 409 on duplicate name (case-insensitive)
  - GET /skills lists caller's items
  - GET /skills does not leak other users' items
  - DELETE /skills/{id} hard-deletes and returns 204
  - DELETE /skills/{id} returns 404 for cross-tenant access

  Screening answers:
  - POST /screening-answers happy path (non-EEOC key)
  - POST /screening-answers EEOC key sets is_eeoc=True
  - POST /screening-answers rejects unknown question_key (422)
  - POST /screening-answers returns 409 on duplicate question_key
  - POST /screening-answers rejects caller-supplied is_eeoc (422, extra='forbid')
  - GET /screening-answers lists caller's items
  - GET /screening-answers does not leak other users' items
  - PATCH /screening-answers/{id} updates answer text
  - PATCH /screening-answers/{id} returns 404 for cross-tenant access
  - DELETE /screening-answers/{id} hard-deletes and returns 204
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _work_history_payload(**overrides) -> dict:
    payload = {
        "company_name": "Acme Corp",
        "title": "Senior Engineer",
        "start_date": "2020-01-01",
        "end_date": "2022-12-31",
        "bullets": ["Led microservices migration", "Reduced p99 latency by 40%"],
    }
    payload.update(overrides)
    return payload


def _education_payload(**overrides) -> dict:
    payload = {
        "school": "State University",
        "degree": "B.S.",
        "field": "Computer Science",
        "start_year": 2014,
        "end_year": 2018,
        "gpa": "3.80",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


class TestProfile:
    @pytest.mark.asyncio
    async def test_get_profile_creates_lazily(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/profile")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["user_id"] == user["id"]
        assert "id" in body
        assert "salary_currency" in body
        assert "locations" in body

    @pytest.mark.asyncio
    async def test_get_profile_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.get("/profile")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_patch_profile_updates_salary(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.patch(
                "/profile",
                json={
                    "desired_salary_min": "80000",
                    "desired_salary_max": "120000",
                    "salary_currency": "USD",
                    "salary_period": "annual",
                },
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert float(body["desired_salary_min"]) == 80000.0
        assert float(body["desired_salary_max"]) == 120000.0
        assert body["salary_currency"] == "USD"
        assert body["salary_period"] == "annual"

    @pytest.mark.asyncio
    async def test_patch_profile_updates_locations(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.patch(
                "/profile",
                json={"locations": ["San Francisco, CA", "Remote"]},
            )
        assert resp.status_code == 200, resp.text
        assert resp.json()["locations"] == ["San Francisco, CA", "Remote"]

    @pytest.mark.asyncio
    async def test_patch_profile_rejects_extra_fields(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.patch("/profile", json={"user_id": str(uuid.uuid4())})
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_patch_profile_invalid_work_auth_status(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.patch(
                "/profile", json={"work_auth_status": "invalid_status"}
            )
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# Work history
# ---------------------------------------------------------------------------


class TestWorkHistory:
    @pytest.mark.asyncio
    async def test_create_happy_path_returns_201(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/work-history", json=_work_history_payload())
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["user_id"] == user["id"]
        assert body["company_name"] == "Acme Corp"
        assert body["title"] == "Senior Engineer"
        assert body["bullets"] == ["Led microservices migration", "Reduced p99 latency by 40%"]
        assert "id" in body

    @pytest.mark.asyncio
    async def test_create_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post("/work-history", json=_work_history_payload())
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_returns_caller_items(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post("/work-history", json=_work_history_payload())
            assert create.status_code == 201
            list_resp = await authed.get("/work-history")
        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["company_name"] == "Acme Corp"

    @pytest.mark.asyncio
    async def test_list_does_not_leak_other_users(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/work-history", json=_work_history_payload())
            assert create.status_code == 201
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get("/work-history")
        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    @pytest.mark.asyncio
    async def test_get_other_users_entry_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/work-history", json=_work_history_payload())
            assert create.status_code == 201
            entry_id = create.json()["id"]
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get(f"/work-history/{entry_id}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_patch_happy_path(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post("/work-history", json=_work_history_payload())
            assert create.status_code == 201
            entry_id = create.json()["id"]
            resp = await authed.patch(
                f"/work-history/{entry_id}",
                json={"title": "Staff Engineer", "bullets": ["New bullet"]},
            )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"] == "Staff Engineer"
        assert body["bullets"] == ["New bullet"]
        # Unchanged field preserved
        assert body["company_name"] == "Acme Corp"

    @pytest.mark.asyncio
    async def test_patch_other_users_entry_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/work-history", json=_work_history_payload())
            assert create.status_code == 201
            entry_id = create.json()["id"]
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.patch(
                f"/work-history/{entry_id}", json={"title": "Stolen"}
            )
        assert resp.status_code == 404, resp.text

    @pytest.mark.asyncio
    async def test_delete_happy_path_returns_204(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post("/work-history", json=_work_history_payload())
            assert create.status_code == 201
            entry_id = create.json()["id"]
            resp = await authed.delete(f"/work-history/{entry_id}")
        assert resp.status_code == 204, resp.text

    @pytest.mark.asyncio
    async def test_delete_other_users_entry_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/work-history", json=_work_history_payload())
            assert create.status_code == 201
            entry_id = create.json()["id"]
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.delete(f"/work-history/{entry_id}")
        assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------


class TestEducation:
    @pytest.mark.asyncio
    async def test_create_happy_path_returns_201(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post("/education", json=_education_payload())
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["user_id"] == user["id"]
        assert body["school"] == "State University"
        assert body["degree"] == "B.S."
        assert float(body["gpa"]) == 3.8

    @pytest.mark.asyncio
    async def test_list_returns_caller_items(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post("/education", json=_education_payload())
            assert create.status_code == 201
            list_resp = await authed.get("/education")
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["school"] == "State University"

    @pytest.mark.asyncio
    async def test_list_does_not_leak_other_users(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/education", json=_education_payload())
            assert create.status_code == 201
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get("/education")
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_patch_other_users_entry_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/education", json=_education_payload())
            entry_id = create.json()["id"]
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.patch(
                f"/education/{entry_id}", json={"school": "Stolen U"}
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_removes_row(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post("/education", json=_education_payload())
            entry_id = create.json()["id"]
            delete = await authed.delete(f"/education/{entry_id}")
            assert delete.status_code == 204
            get = await authed.get(f"/education/{entry_id}")
        assert get.status_code == 404


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------


class TestSkills:
    @pytest.mark.asyncio
    async def test_create_happy_path_returns_201(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/skills",
                json={"name": "Python", "years_experience": 5, "category": "language"},
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["user_id"] == user["id"]
        assert body["name"] == "Python"
        assert body["years_experience"] == 5
        assert body["category"] == "language"

    @pytest.mark.asyncio
    async def test_create_duplicate_name_case_insensitive_returns_409(
        self, user_factory, as_user
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            first = await authed.post("/skills", json={"name": "Python"})
            assert first.status_code == 201
            dup = await authed.post("/skills", json={"name": "python"})
        assert dup.status_code == 409, dup.text

    @pytest.mark.asyncio
    async def test_create_invalid_category_returns_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/skills",
                json={"name": "Python", "category": "invalid_cat"},
            )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_list_returns_caller_items(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post("/skills", json={"name": "Python"})
            assert create.status_code == 201
            list_resp = await authed.get("/skills")
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Python"

    @pytest.mark.asyncio
    async def test_list_does_not_leak_other_users(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/skills", json={"name": "Rust"})
            assert create.status_code == 201
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get("/skills")
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_delete_happy_path_returns_204(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post("/skills", json={"name": "Go"})
            skill_id = create.json()["id"]
            resp = await authed.delete(f"/skills/{skill_id}")
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_other_users_skill_returns_404(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post("/skills", json={"name": "Elixir"})
            skill_id = create.json()["id"]
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.delete(f"/skills/{skill_id}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Screening answers
# ---------------------------------------------------------------------------


class TestScreeningAnswers:
    @pytest.mark.asyncio
    async def test_create_non_eeoc_key_returns_201(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/screening-answers",
                json={"question_key": "work_auth_us", "answer": "Yes"},
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["user_id"] == user["id"]
        assert body["question_key"] == "work_auth_us"
        assert body["answer"] == "Yes"
        assert body["is_eeoc"] is False

    @pytest.mark.asyncio
    async def test_create_eeoc_key_sets_is_eeoc_true(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/screening-answers",
                json={"question_key": "eeoc_gender", "answer": "Prefer not to say"},
            )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["is_eeoc"] is True

    @pytest.mark.asyncio
    async def test_create_unknown_key_returns_422(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/screening-answers",
                json={"question_key": "not_an_allowed_key", "answer": "whatever"},
            )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_create_duplicate_question_key_returns_409(
        self, user_factory, as_user
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            first = await authed.post(
                "/screening-answers",
                json={"question_key": "require_sponsorship", "answer": "No"},
            )
            assert first.status_code == 201
            dup = await authed.post(
                "/screening-answers",
                json={"question_key": "require_sponsorship", "answer": "Maybe"},
            )
        assert dup.status_code == 409, dup.text

    @pytest.mark.asyncio
    async def test_create_rejects_caller_supplied_is_eeoc(
        self, user_factory, as_user
    ) -> None:
        """extra='forbid' must reject is_eeoc in the request body."""
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.post(
                "/screening-answers",
                json={"question_key": "work_auth_us", "answer": "Yes", "is_eeoc": True},
            )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_list_returns_caller_items(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post(
                "/screening-answers",
                json={"question_key": "linkedin_url", "answer": "https://linkedin.com/in/me"},
            )
            assert create.status_code == 201
            list_resp = await authed.get("/screening-answers")
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["question_key"] == "linkedin_url"

    @pytest.mark.asyncio
    async def test_list_does_not_leak_other_users(self, user_factory, as_user) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post(
                "/screening-answers",
                json={"question_key": "github_url", "answer": "https://github.com/me"},
            )
            assert create.status_code == 201
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get("/screening-answers")
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_patch_updates_answer(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post(
                "/screening-answers",
                json={"question_key": "notice_period", "answer": "2 weeks"},
            )
            answer_id = create.json()["id"]
            resp = await authed.patch(
                f"/screening-answers/{answer_id}",
                json={"answer": "4 weeks"},
            )
        assert resp.status_code == 200, resp.text
        assert resp.json()["answer"] == "4 weeks"
        # question_key unchanged
        assert resp.json()["question_key"] == "notice_period"

    @pytest.mark.asyncio
    async def test_patch_other_users_answer_returns_404(
        self, user_factory, as_user
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        async with await as_user(owner) as authed_owner:
            create = await authed_owner.post(
                "/screening-answers",
                json={"question_key": "salary_expectation", "answer": "80k"},
            )
            answer_id = create.json()["id"]
        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.patch(
                f"/screening-answers/{answer_id}", json={"answer": "stole your salary"}
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_removes_row(self, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post(
                "/screening-answers",
                json={"question_key": "willing_to_relocate", "answer": "Yes"},
            )
            answer_id = create.json()["id"]
            delete = await authed.delete(f"/screening-answers/{answer_id}")
            assert delete.status_code == 204
            get = await authed.get(f"/screening-answers/{answer_id}")
        assert get.status_code == 404
