/**
 * Fictional Houston, TX rental properties for the MyBookkeeper portfolio
 * demo. Addresses are made up — never real locations tied to the operator.
 */
export interface PropertyFixture {
  name: string;
  address: string;
  classification: "investment";
  type: "long_term";
}

export const BAYOU_BEND_DUPLEX: PropertyFixture = {
  name: "Bayou Bend Duplex",
  address: "4821 Bayou Bend Ln, Houston, TX 77004",
  classification: "investment",
  type: "long_term",
};

export const OXFORD_STREET_BUNGALOW: PropertyFixture = {
  name: "Oxford Street Bungalow",
  address: "1103 Oxford St, Houston, TX 77008",
  classification: "investment",
  type: "long_term",
};

export const PROPERTIES: PropertyFixture[] = [BAYOU_BEND_DUPLEX, OXFORD_STREET_BUNGALOW];
