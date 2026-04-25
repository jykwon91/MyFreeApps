from app.core.vendors import normalize_address, normalize_vendor


def test_strips_llc():
    assert normalize_vendor("ABC Plumbing LLC") == "abc plumbing"


def test_strips_llc_with_comma():
    assert normalize_vendor("ABC Plumbing, LLC") == "abc plumbing"


def test_strips_inc():
    assert normalize_vendor("ABC Services Inc") == "abc services"


def test_strips_inc_with_period():
    assert normalize_vendor("ABC Services Inc.") == "abc services"


def test_strips_incorporated():
    assert normalize_vendor("ABC Incorporated") == "abc"


def test_strips_corp():
    assert normalize_vendor("ABC Corp") == "abc"


def test_strips_corporation():
    assert normalize_vendor("ABC Corporation") == "abc"


def test_strips_ltd():
    assert normalize_vendor("ABC Ltd") == "abc"


def test_strips_limited():
    assert normalize_vendor("ABC Limited") == "abc"


def test_collapses_whitespace():
    assert normalize_vendor("  ABC   Plumbing  ") == "abc plumbing"


def test_empty_string():
    assert normalize_vendor("") == ""


def test_none_returns_empty():
    assert normalize_vendor(None) == ""


def test_no_suffix_unchanged():
    assert normalize_vendor("All Service Maintenance") == "all service maintenance"


def test_case_insensitive():
    assert normalize_vendor("ABC PLUMBING LLC") == normalize_vendor("abc plumbing llc")


def test_matching_with_and_without_suffix():
    assert normalize_vendor("A to Z Services LLC") == normalize_vendor("A to Z Services")


def test_matching_inc_vs_no_suffix():
    assert normalize_vendor("Jason Lawn Guy Inc.") == normalize_vendor("Jason Lawn Guy")


def test_address_strips_street_suffix():
    assert normalize_address("6738 Peerless St Houston TX 77021") == "6738 peerless houston"


def test_address_strips_avenue():
    assert normalize_address("123 Main Avenue, Houston, TX 77002") == "123 main houston"


def test_address_strips_unit():
    assert normalize_address("456 Elm St Apt 5B Houston TX") == "456 elm houston"


def test_address_strips_suite():
    assert normalize_address("789 Oak Blvd Suite 200 Dallas TX 75201") == "789 oak dallas"


def test_address_collapses_whitespace():
    assert normalize_address("  6738   Peerless  St  ") == "6738 peerless"


def test_address_empty_string():
    assert normalize_address("") == ""


def test_address_none_returns_empty():
    assert normalize_address(None) == ""


def test_address_case_insensitive():
    assert normalize_address("6738 PEERLESS ST") == normalize_address("6738 peerless st")


def test_address_same_with_and_without_suffix():
    assert normalize_address("6738 Peerless St Houston TX") == normalize_address("6738 Peerless Houston TX")


def test_address_same_with_and_without_zip():
    assert normalize_address("6738 Peerless Houston TX 77021") == normalize_address("6738 Peerless Houston")
