import { documentReaderMessages } from "./documentReader";
import type { PropertyChoiceMessages } from "../types/PropertyChoiceMessages";

export const UTILITY_PLAN_PHOTO_NAME = "utility-plan.jpg";
export const UTILITY_PLAN_TEXT_MAX_LENGTH = 255;
export const UTILITY_PLAN_ACCOUNT_MAX_LENGTH = 100;

export const UTILITY_PLAN_FORM_MESSAGES = {
  titleNew: "Add plan",
  titleEdit: "Edit plan",
  viewOnlyHeading: "You have view-only access.",
  viewOnlyBody: "Ask the owner if you need to add or change utility plans.",
  property: "Property",
  propertySheetTitle: "Which property is this plan for?",
  propertyNone: "Choose a property",
  propertyRequired: "Pick the property this plan is for.",
  noProperties: "You need a property before you can add a utility plan.",
  addProperty: "Add a property",
  propertiesLoading: "Loading your properties",
  propertiesFailed: "I couldn't load your properties. Pull down on the previous screen and try again.",
  service: "Service",
  serviceSheetTitle: "Which service is this?",
  rateType: "Rate type",
  provider: "Provider",
  providerPlaceholder: "For example Constellation",
  planName: "Plan name",
  planNamePlaceholder: "For example 12 Month Fixed",
  accountNumber: "Account number",
  accountNumberPlaceholder: "For example 6403771807-5",
  energyCharge: "Energy charge (¢/kWh)",
  tduCharge: "Delivery / TDU charge (¢/kWh)",
  avgPrice: "Average price at 1,000 kWh (¢/kWh)",
  monthlyBase: "Monthly base charge ($)",
  termMonths: "Term (months)",
  serviceStart: "Service start",
  termEnds: "Term ends",
  earlyTerminationFee: "Early termination fee ($)",
  hasBillCredit: "This plan has a usage-based bill credit",
  creditAmount: "Credit amount ($)",
  creditThreshold: "Applies at or above (kWh)",
  minUsageFee: "Minimum usage fee ($)",
  minUsageThreshold: "Charged below (kWh)",
  postPromo: "Price after the promo ($/mo)",
  equipmentFee: "Equipment fee ($/mo)",
  postPromoHint: "A promo price needs the date it ends. Set the term end above, and the renewal alert will name the day the bill goes up. Leave the data cap blank if the plan is uncapped.",
  download: "Download (Mbps)",
  upload: "Upload (Mbps)",
  dataCap: "Data cap (GB)",
  saveNew: "Save plan",
  saveEdit: "Save changes",
  saving: "Saving...",
  added: "Utility plan added.",
  updated: "Utility plan updated.",
  goneProperty: "That property is gone, so I can't add a plan to it.",
} as const;

export const UTILITY_PLAN_PROPERTY_MESSAGES: PropertyChoiceMessages = UTILITY_PLAN_FORM_MESSAGES;

export const UTILITY_PLAN_READER_MESSAGES = documentReaderMessages({
  title: "Start from a document",
  hint: "Take a photo of an Electricity Facts Label, a contract or a bill, or choose a PDF or photo. I'll fill in what I can find.",
  takePhoto: "Take a photo of the document",
  target: "plan",
});
