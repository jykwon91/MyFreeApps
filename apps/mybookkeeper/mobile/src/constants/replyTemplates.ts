import type { ReplyTemplateVariable } from "../types/ReplyTemplateVariable";

export const REPLY_TEMPLATE_SKELETON_ROWS = ["a", "b", "c", "d"];

// Mirrors the backend's reply_template_renderer. test_reply_template_variables_match_phone.py holds the tokens to it.
export const REPLY_TEMPLATE_VARIABLES: readonly ReplyTemplateVariable[] = [
  { token: "$name", fillsIn: "The person's name, or \"there\" if I don't know it" },
  { token: "$listing", fillsIn: "The listing title, or \"the room\"" },
  { token: "$dates", fillsIn: "The dates they asked for, or \"your requested dates\" if they haven't said" },
  { token: "$start_date", fillsIn: "The start date they asked for, or \"the start date you requested\"" },
  { token: "$end_date", fillsIn: "The end date they asked for, or \"the end date you requested\"" },
  { token: "$employer", fillsIn: "Their employer, or nothing if I don't know it" },
  { token: "$host_name", fillsIn: "Your name, or the first part of your email if you haven't set one" },
  { token: "$host_phone", fillsIn: "I leave this blank for now." },
];

export const REPLY_TEMPLATE_MESSAGES = {
  loadingList: "Loading your reply templates",
  loadingOne: "Loading this template",
  couldntLoadList: "I couldn't load your templates.",
  couldntLoadOne: "I couldn't load this template.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  cantFind: "I can't find that template.",
  maybeArchived: "It may have been archived.",
  back: "Back",
  noneHeading: "You don't have any reply templates.",
  noneBody: "Ones you make on the website show up here.",
  openWebsite: "Open on the website",
  manageOnWebsite: "I can't create or edit templates here yet. Open the website to change them.",
  subject: "Subject",
  message: "Message",
  variablesHeading: "Variables in this template",
} as const;
