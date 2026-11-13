import { BLACKOUT_ATTACHMENT_MAX_LABEL } from "@mybookkeeper/api-client/constants/blackoutAttachments";
import type { InsuranceAttachmentKind } from "@mybookkeeper/api-client/types/insurance/insurance-attachment-kind";
import type { PropertyChoiceMessages } from "../types/PropertyChoiceMessages";
import { documentReaderMessages } from "./documentReader";

export const POLICY_NAME_MAX_LENGTH = 255;
export const POLICY_NOTES_MAX_LENGTH = 5000;
export const POLICY_PHOTO_NAME = "policy.jpg";
export const DEFAULT_ATTACHMENT_KIND: InsuranceAttachmentKind = "policy_document";

export const POLICY_FORM_MESSAGES = {
  addTitle: "New policy",
  editTitle: "Edit policy",
  property: "Property",
  propertySheetTitle: "Choose a property",
  propertyNone: "Choose a property",
  propertyRequired: "Choose which property this covers.",
  noProperties: "A policy covers one of your properties, and you don't have any yet.",
  addProperty: "Add a property",
  propertiesLoading: "Loading your properties",
  propertiesFailed: "I couldn't load your properties.",
  propertiesRetry: "Try again",
  policyName: "Policy name",
  policyNamePlaceholder: "e.g. Landlord insurance, 123 Main St",
  policyNameRequired: "Give the policy a name.",
  carrier: "Carrier",
  carrierPlaceholder: "e.g. State Farm",
  policyNumber: "Policy number",
  effectiveDate: "Starts",
  expirationDate: "Ends",
  coverage: "Coverage amount (USD)",
  costHeading: "What it costs",
  costBlurb: "I use this to tell whether the policy is priced in line with the market.",
  premium: "Premium (USD)",
  billed: "Billed",
  billedNone: "Not set",
  billedTitle: "How often you're billed",
  billedHint: "Pick this when you enter a premium, so I know whether it's per month or per year.",
  feesAndTaxes: "Fees and taxes (USD)",
  feesAndTaxesHint: "Everything on the bill that isn't premium, for the whole policy term. Leave blank if there is none.",
  deductible: "Deductible (USD)",
  windHail: "Wind and hail deductible (% of coverage)",
  windHailInvalid: "Enter a percentage from 0 to 100.",
  amountInvalid: "Enter an amount of zero or more.",
  notes: "Notes",
  notesPlaceholder: "Anything else worth remembering about this policy",
  datesOrder: "The end date is before the start date.",
  save: "Save policy",
  saveChanges: "Save changes",
  saving: "Saving…",
  added: "Policy added.",
  updated: "Policy updated.",
  saveOffline: "I can't reach the server, so I couldn't save that. Your details are still here.",
  saveUnsure: "I lost the connection before I heard back, so the policy may have saved. Check your policies before you try again.",
  saveUnsureEdit: "I lost the connection before I heard back, so the change may have saved. Check the policy before you try again.",
  saveRejected: "I couldn't save that. Check the details and try again.",
  saveGone: "That property or policy isn't there any more.",
  saveFailed: "I couldn't save that. Want to try again?",
} as const;

export const POLICY_PROPERTY_MESSAGES: PropertyChoiceMessages = POLICY_FORM_MESSAGES;

export const POLICY_READER_MESSAGES = documentReaderMessages({
  title: "Start from a document",
  hint: "Add your declarations page, a renewal notice or the policy itself and I'll fill in what I can.",
  takePhoto: "Take a photo",
  target: "policy",
});

export const POLICY_ATTACHMENT_MESSAGES = {
  addFile: "Add a document",
  kind: "What kind of document",
  uploadFile: "Upload",
  uploading: "Uploading…",
  cancel: "Cancel",
  uploaded: "Document added.",
  remove: "Remove",
  removing: "Removing…",
  removed: "Document removed.",
  removeTitle: "Remove this document?",
  removeBody: "It's deleted from this policy for good.",
  notAllowed: "You have view-only access, so I can't change documents.",
  tooBig: `That file's too big. I can take up to ${BLACKOUT_ATTACHMENT_MAX_LABEL}.`,
  badType: "I can't take that kind of file. A PDF, Word document or photo works.",
  gone: "That policy isn't there any more.",
  removeGone: "That document is already gone.",
  uploadFailed: "I couldn't upload that. Want to try again?",
  uploadOffline: "I can't reach the server, so I couldn't upload that. Want to try again?",
  removeFailed: "I couldn't remove that. Want to try again?",
} as const;
