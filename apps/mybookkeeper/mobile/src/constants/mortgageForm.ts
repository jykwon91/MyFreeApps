import type { MortgageFormProblem } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-problem";
import { documentReaderMessages } from "./documentReader";
import type { MortgageRateType } from "@mybookkeeper/api-client/types/mortgage/mortgage-rate-type";

export const MORTGAGE_NOTES_MAX_LENGTH = 5000;
export const MORTGAGE_TEXT_MAX_LENGTH = 255;
export const MORTGAGE_STATEMENT_PHOTO_NAME = "mortgage-statement.jpg";

export const MORTGAGE_RATE_TYPE_LABELS: Record<MortgageRateType, string> = {
  fixed: "Fixed for the life of the loan",
  arm: "Adjustable (ARM)",
};

export const MORTGAGE_PROBLEM_MESSAGES: Record<MortgageFormProblem, string> = {
  rate_type_required: "Pick whether the rate is fixed or adjustable.",
  rate_out_of_range: "Use a rate above 0 and below 25, like 7.125.",
  not_a_number: "Use a plain amount like 1995.82, or leave it blank.",
  must_be_positive: "Use an amount above 0, or leave it blank.",
  term_out_of_range: "Use a number of months from 1 to 600, or leave it blank.",
  needs_statement_date: "A balance is only true as of a date. Pick the statement date too.",
  needs_balance: "Add the balance that statement showed, or clear the date.",
};

export const MORTGAGE_FORM_MESSAGES = {
  titleNew: "Add mortgage",
  titleEdit: "Edit mortgage",
  loadingForm: "Loading this mortgage",
  viewOnlyHeading: "You have view-only access.",
  viewOnlyBody: "Ask the owner if you need to add or change mortgages.",
  property: "Property",
  propertySheetTitle: "Which property is this loan on?",
  propertyNone: "Choose a property",
  propertyRequired: "Pick the property this loan is on.",
  noProperties: "You need a property before you can add a loan.",
  addProperty: "Add a property",
  propertiesLoading: "Loading your properties",
  propertiesFailed: "I couldn't load your properties. Pull down on the previous screen and try again.",
  lender: "Lender",
  lenderHint: "For example Chase.",
  rate: "Interest rate (%)",
  rateHint: "For example 7.125. I need this to compare the loan with the market.",
  rateType: "Rate type",
  rateTypeHint: "I won't guess whether the rate can move, because the comparison depends on it.",
  fixedUntil: "Current rate runs until",
  fixedUntilHint: "The date the rate can start moving. On a statement it reads like “interest rate until February 2035”.",
  balance: "Remaining balance ($)",
  statementDate: "As of (statement date)",
  balanceHint: "A balance is only true as of a date, so I keep the two together.",
  payoffIntro: "How many payments are left is the difference between a rate gap and real money. The payoff date or the principal and interest split is enough; both is better.",
  maturityDate: "Payoff date (maturity)",
  monthlyPrincipal: "Monthly principal ($)",
  monthlyInterest: "Monthly interest ($)",
  monthlyEscrow: "Monthly escrow ($)",
  escrowHint: "Taxes and insurance. I keep it for your records but leave it out of the comparison, since refinancing doesn't change it.",
  originalLoan: "Original loan amount ($)",
  term: "Original term (months)",
  accountNumber: "Account number",
  accountHint: "Optional. I store it encrypted and nothing here needs it.",
  notes: "Notes",
  saveNew: "Save mortgage",
  saveEdit: "Save changes",
  saving: "Saving...",
  added: "Mortgage added.",
  updated: "Mortgage updated.",
  discardTitle: "Discard your changes?",
  discardBody: "What you've typed here hasn't been saved.",
  discard: "Discard",
  keepEditing: "Keep editing",
  gone: "That mortgage is gone, so I can't save changes to it.",
  goneProperty: "That property is gone, so I can't add a loan to it.",
  viewOnly: "You have view-only access, so I can't save this.",
  lostConnection: "I couldn't reach the server. Nothing was lost on this screen. Check your connection and try again.",
  createUnsure: "I couldn't reach the server, so I'm not sure this saved. Check your mortgages list before saving again, or it may be added twice.",
  invalid: "The server didn't accept some of those numbers. Check the figures and try again.",
  retry: "I couldn't save that. Want me to try again?",
  demo: "This is a demo workspace, so I can't save changes here.",
} as const;

export const MORTGAGE_STATEMENT_MESSAGES = documentReaderMessages({
  title: "Read it off a statement",
  hint: "Take a photo of your latest monthly mortgage statement, or choose a PDF or photo. I'll fill in what I can find.",
  takePhoto: "Take a photo of the statement",
  target: "loan",
});
