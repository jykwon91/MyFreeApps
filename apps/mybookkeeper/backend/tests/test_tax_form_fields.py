from app.core.tax_form_fields import TAX_FORM_FIELD_DEFINITIONS, TAX_SOURCE_FORM_TYPES


class TestTaxFormFieldDefinitions:
    def test_all_source_forms_have_definitions(self) -> None:
        for form_type in TAX_SOURCE_FORM_TYPES:
            assert form_type in TAX_FORM_FIELD_DEFINITIONS, (
                f"{form_type} missing from TAX_FORM_FIELD_DEFINITIONS"
            )

    def test_all_definitions_have_tuples(self) -> None:
        for form_name, fields in TAX_FORM_FIELD_DEFINITIONS.items():
            assert isinstance(fields, list), f"{form_name} fields must be a list"
            for item in fields:
                assert isinstance(item, tuple), f"{form_name} has non-tuple: {item}"
                assert len(item) == 2, f"{form_name} has wrong-length tuple: {item}"
                field_id, label = item
                assert isinstance(field_id, str), f"{form_name}.{field_id} id not str"
                assert isinstance(label, str), f"{form_name}.{field_id} label not str"

    def test_no_duplicate_field_ids_per_form(self) -> None:
        for form_name, fields in TAX_FORM_FIELD_DEFINITIONS.items():
            ids = [fid for fid, _ in fields]
            assert len(ids) == len(set(ids)), (
                f"{form_name} has duplicate field IDs: "
                f"{[x for x in ids if ids.count(x) > 1]}"
            )

    def test_w2_has_expected_boxes(self) -> None:
        w2_ids = {fid for fid, _ in TAX_FORM_FIELD_DEFINITIONS["w2"]}
        for box in ["box_1", "box_2", "box_3", "box_4", "box_5", "box_6"]:
            assert box in w2_ids

    def test_1099_int_has_interest_income(self) -> None:
        fields = {fid: label for fid, label in TAX_FORM_FIELD_DEFINITIONS["1099_int"]}
        assert "box_1" in fields
        assert "interest" in fields["box_1"].lower()

    def test_1098_has_mortgage_interest(self) -> None:
        fields = {fid: label for fid, label in TAX_FORM_FIELD_DEFINITIONS["1098"]}
        assert "box_1" in fields
        assert "mortgage" in fields["box_1"].lower()

    def test_source_form_types_match_definitions(self) -> None:
        assert TAX_SOURCE_FORM_TYPES == {
            "w2", "1099_int", "1099_div", "1099_b", "1099_k",
            "1099_misc", "1099_nec", "1099_r", "1098", "k1", "1095_a",
        }
