"""Unit tests for the account-deletion schema helpers."""
from sqlalchemy import Column, ForeignKey, Integer, MetaData, String, Table

from platform_shared.testing.account_deletion_schema import (
    entries_without_reason,
    foreign_keys_blocking_user_deletion,
    foreign_keys_not_cascading,
    missing_columns,
    stored_file_suspects,
    tables_deleted_with,
    tables_referencing,
)


def _metadata(ondelete: str | None, extra_columns: tuple[str, ...] = ()) -> MetaData:
    md = MetaData()
    Table("users", md, Column("id", Integer, primary_key=True))
    Table(
        "posts",
        md,
        Column("id", Integer, primary_key=True),
        Column("user_id", Integer, ForeignKey("users.id", ondelete=ondelete)),
        *(Column(name, String) for name in extra_columns),
    )
    return md


def test_cascading_fk_is_not_reported() -> None:
    assert foreign_keys_not_cascading(_metadata("CASCADE"), "users") == []


def test_non_cascading_fk_is_reported() -> None:
    assert foreign_keys_not_cascading(_metadata(None), "users") == ["posts.user_id"]
    assert foreign_keys_not_cascading(_metadata("SET NULL"), "users") == ["posts.user_id"]


def test_fk_to_other_table_is_ignored() -> None:
    md = _metadata("CASCADE")
    Table("tags", md, Column("post_id", Integer, ForeignKey("posts.id")))
    assert foreign_keys_not_cascading(md, "users") == []


def _chain(child_ondelete: str | None, grandchild_ondelete: str | None) -> MetaData:
    """users <- orders (child_ondelete); items -> orders (grandchild_ondelete)."""
    md = MetaData()
    Table("users", md, Column("id", Integer, primary_key=True))
    Table(
        "orders", md, Column("id", Integer, primary_key=True),
        Column("user_id", Integer, ForeignKey("users.id", ondelete=child_ondelete)),
    )
    Table(
        "items", md, Column("id", Integer, primary_key=True),
        Column("order_id", Integer, ForeignKey("orders.id", ondelete=grandchild_ondelete)),
    )
    return md


def test_cascade_reachability_follows_cascading_fks_only() -> None:
    assert tables_deleted_with(_chain("cascade", "CASCADE"), "users") == {"users", "orders", "items"}
    assert tables_deleted_with(_chain("CASCADE", None), "users") == {"users", "orders"}


def test_tables_referencing_lists_direct_referrers() -> None:
    assert tables_referencing(_chain("CASCADE", None), "orders") == {"items"}


def test_no_ondelete_fk_into_a_cascaded_child_blocks() -> None:
    assert foreign_keys_blocking_user_deletion(_chain("CASCADE", None), "users") == ["items.order_id"]


def test_restrict_into_a_cascaded_child_blocks() -> None:
    md = _chain("CASCADE", "CASCADE")
    Table(
        "audit", md, Column("id", Integer, primary_key=True),
        Column("order_id", Integer, ForeignKey("orders.id", ondelete="restrict")),
    )
    assert foreign_keys_blocking_user_deletion(md, "users") == ["audit.order_id"]


def test_restrict_between_two_cascaded_children_blocks() -> None:
    assert foreign_keys_blocking_user_deletion(_chain("CASCADE", "RESTRICT"), "users") == [
        "items.order_id",
    ]


def test_no_action_between_two_cascaded_children_does_not_block() -> None:
    md = _chain("CASCADE", "CASCADE")
    Table(
        "notes", md, Column("id", Integer, primary_key=True),
        Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE")),
        Column("order_id", Integer, ForeignKey("orders.id")),
    )
    assert foreign_keys_blocking_user_deletion(md, "users") == []


def test_set_null_into_a_cascaded_child_does_not_block() -> None:
    md = _chain("CASCADE", "CASCADE")
    Table(
        "audit", md, Column("id", Integer, primary_key=True),
        Column("order_id", Integer, ForeignKey("orders.id", ondelete="SET NULL")),
    )
    assert foreign_keys_blocking_user_deletion(md, "users") == []


def test_restrict_between_unreached_tables_does_not_block() -> None:
    md = _metadata("CASCADE")
    Table("categories", md, Column("id", Integer, primary_key=True))
    Table(
        "tags", md, Column("id", Integer, primary_key=True),
        Column("category_id", Integer, ForeignKey("categories.id", ondelete="RESTRICT")),
    )
    assert foreign_keys_blocking_user_deletion(md, "users") == []


def test_non_cascading_user_fk_blocks() -> None:
    assert foreign_keys_blocking_user_deletion(_metadata(None), "users") == ["posts.user_id"]


def test_suffix_columns_are_suspects() -> None:
    md = _metadata("CASCADE", ("cover_url", "file_path", "name"))
    assert stored_file_suspects(md) == ["posts.cover_url", "posts.file_path"]


def test_bare_names_are_suspects() -> None:
    md = _metadata("CASCADE", ("url", "path", "key", "avatar", "audio", "title"))
    assert stored_file_suspects(md) == [
        "posts.audio",
        "posts.avatar",
        "posts.key",
        "posts.path",
        "posts.url",
    ]


def test_blob_is_not_a_default_suspect() -> None:
    assert stored_file_suspects(_metadata("CASCADE", ("data_blob",))) == []


def test_excused_columns_are_skipped() -> None:
    md = _metadata("CASCADE", ("lineage_key", "cover_url"))
    assert stored_file_suspects(md, excused={"posts.lineage_key"}) == ["posts.cover_url"]


def test_custom_suffixes_replace_defaults() -> None:
    md = _metadata("CASCADE", ("cover_url", "slug_tag"))
    assert stored_file_suspects(md, suffixes=("_tag",)) == ["posts.slug_tag"]


def test_missing_columns_reports_only_absent() -> None:
    assert missing_columns(_metadata(None), ["posts.user_id", "posts.gone"]) == ["posts.gone"]


def test_entries_without_reason_flags_blank() -> None:
    assert entries_without_reason({"a.b": "why", "c.d": "", "e.f": "  "}) == ["c.d", "e.f"]


def test_plural_and_extra_words_are_suspects() -> None:
    md = _metadata("CASCADE", ("page_images", "attachments", "doc_uri", "screenshot", "document"))
    assert stored_file_suspects(md) == [
        "posts.attachments",
        "posts.doc_uri",
        "posts.document",
        "posts.page_images",
        "posts.screenshot",
    ]


def test_mid_word_endings_do_not_match() -> None:
    md = _metadata("CASCADE", ("postimage", "monkey", "hourly", "thumbnails_count", "audiobook"))
    assert stored_file_suspects(md) == []


def test_underscore_prefixed_word_endings_match() -> None:
    md = _metadata("CASCADE", ("cover_image", "has_image"))
    assert stored_file_suspects(md) == ["posts.cover_image", "posts.has_image"]
