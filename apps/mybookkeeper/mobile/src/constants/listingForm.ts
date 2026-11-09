import { LISTING_ROOM_TYPE_LABELS, LISTING_ROOM_TYPES, LISTING_STATUS_LABELS, LISTING_STATUSES } from "@mybookkeeper/api-client/constants/listingLabels";
import type { PropertyChoiceMessages } from "../types/PropertyChoiceMessages";

export const LISTING_FORM_MESSAGES = {
  newTitle: "New listing",
  editTitle: "Edit listing",
  title: "Title",
  description: "Description",
  descriptionHint: "Shown to people who inquire. Plain text or markdown.",
  monthlyRate: "Monthly rate (USD)",
  weeklyRate: "Weekly rate (USD)",
  nightlyRate: "Nightly rate (USD)",
  rateHint: "e.g. 1200 or 1200.50",
  minStay: "Minimum stay (days)",
  maxStay: "Maximum stay (days)",
  roomType: "Room type",
  chooseRoomType: "What kind of space is it?",
  status: "Status",
  chooseStatus: "Set the listing's status",
  privateBath: "Private bath",
  parking: "Assigned parking",
  furnished: "Furnished",
  amenities: "Amenities",
  amenitiesHint: "Separate with commas: wifi, washer/dryer, smart lock",
  pets: "Pets on premises",
  petDisclosure: "Pet or dog disclosure",
  petDisclosureHint: "Added to replies about this listing, e.g. We have a friendly large dog.",
  add: "Create listing",
  adding: "Creating…",
  save: "Save changes",
  saving: "Saving…",
  added: "Listing created.",
  saved: "Changes saved.",
  propertyGone: "I can't find that property anymore. It may have been deleted. Choose another one.",
} as const;

export const LISTING_ROOM_OPTIONS = LISTING_ROOM_TYPES.map((value) => ({ value, label: LISTING_ROOM_TYPE_LABELS[value] }));
export const LISTING_STATUS_OPTIONS = LISTING_STATUSES.map((value) => ({ value, label: LISTING_STATUS_LABELS[value] }));
export const LISTING_MULTILINE_MIN_HEIGHT = 96;

export const LISTING_PROPERTY_CHOICE: PropertyChoiceMessages = {
  property: "Property",
  propertySheetTitle: "Which property is this listing for?",
  propertyNone: "Choose a property",
  noProperties: "A listing is for one of your properties, and you don't have any yet.",
  addProperty: "Add a property",
  propertiesLoading: "Loading your properties",
  propertiesFailed: "I couldn't load your properties.",
  propertiesRetry: "Try again",
};
