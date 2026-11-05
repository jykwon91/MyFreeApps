interface TaxOption {
  value: string;
  label: string;
  description: string;
}

export const TAX_SITUATION_OPTIONS: TaxOption[] = [
  {
    value: "rental_property",
    label: "Rental Properties",
    description: "I own rental properties (Airbnb, long-term tenants)",
  },
  {
    value: "self_employment",
    label: "Self-Employment",
    description: "I'm self-employed, freelance, or do contract work",
  },
  {
    value: "w2_employment",
    label: "W-2 Employment",
    description: "I receive a W-2 from an employer",
  },
  {
    value: "investment",
    label: "Investments",
    description: "I have stocks, crypto, or other investments",
  },
];

export const FILING_STATUS_OPTIONS: TaxOption[] = [
  {
    value: "single",
    label: "Single",
    description: "Unmarried or legally separated",
  },
  {
    value: "married_filing_jointly",
    label: "Married Filing Jointly",
    description: "Married and filing a combined return",
  },
  {
    value: "married_filing_separately",
    label: "Married Filing Separately",
    description: "Married but filing your own return",
  },
  {
    value: "head_of_household",
    label: "Head of Household",
    description: "Unmarried with a qualifying dependent",
  },
  {
    value: "qualifying_surviving_spouse",
    label: "Qualifying Surviving Spouse",
    description: "Widowed with a dependent child",
  },
];
