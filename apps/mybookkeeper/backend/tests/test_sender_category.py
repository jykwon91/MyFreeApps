from app.services.extraction.sender_category_service import match_sender_category


class TestMatchSenderCategory:
    def test_centerpoint_matches_utilities(self) -> None:
        assert match_sender_category("CenterPoint Energy") == "utilities"

    def test_att_matches_utilities(self) -> None:
        assert match_sender_category("billing@att.com") == "utilities"

    def test_comcast_matches_utilities(self) -> None:
        assert match_sender_category("Comcast Business") == "utilities"

    def test_statefarm_matches_insurance(self) -> None:
        assert match_sender_category("StateFarm Insurance") == "insurance"

    def test_state_farm_spaced_matches_insurance(self) -> None:
        assert match_sender_category("State Farm") == "insurance"

    def test_allstate_matches_insurance(self) -> None:
        assert match_sender_category("Allstate Claims") == "insurance"

    def test_wellsfargo_matches_mortgage(self) -> None:
        assert match_sender_category("WellsFargo Mortgage") == "mortgage_interest"

    def test_wells_fargo_spaced_matches_mortgage(self) -> None:
        assert match_sender_category("Wells Fargo Bank") == "mortgage_interest"

    def test_chase_matches_mortgage(self) -> None:
        assert match_sender_category("Chase Home Finance") == "mortgage_interest"

    def test_unknown_vendor_returns_none(self) -> None:
        assert match_sender_category("Random Store") is None

    def test_empty_vendor_returns_none(self) -> None:
        assert match_sender_category("") is None

    def test_case_insensitive(self) -> None:
        assert match_sender_category("DUKE ENERGY") == "utilities"
