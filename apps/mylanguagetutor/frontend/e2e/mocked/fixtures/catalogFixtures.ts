/**
 * The catalog as the backend's registries define it (app/domain/languages,
 * app/domain/scenarios), in the shapes GET /languages and GET /scenarios send.
 * Keep the titles and goals word for word with the backend: the skeleton
 * alignment tests prove the card heights only for this text, so a longer goal
 * in the backend has to land here too.
 */
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";

export const SPANISH: Language = {
  code: "es",
  display_name: "Spanish",
  dialect_label: "Latin American",
  stt_locale: "es-MX",
  tts_locale: "es-MX",
};

export const GREETINGS: Scenario = {
  slug: "greetings",
  title: "Greetings",
  goal: "Say hello and exchange names.",
  goals: ["Greet the tutor.", "Give your name.", "Ask the tutor's name."],
  order: 1,
};

export const FREE_TALK: Scenario = {
  slug: "free-talk",
  title: "Free talk",
  goal: "Chat about anything you like, at your own pace.",
  goals: [],
  order: 9,
};

/** The Spanish learning path, in order. */
export const SCENARIOS: Scenario[] = [
  GREETINGS,
  {
    slug: "repair-phrases",
    title: "Asking for help",
    goal: "Keep the conversation going when you don't understand.",
    goals: [
      "Use at least two of: ask the tutor to repeat, ask them to speak more slowly, say you don't understand.",
    ],
    order: 2,
  },
  {
    slug: "about-me",
    title: "About me",
    goal: "Say where you're from and share something about yourself.",
    goals: ["Say where you're from.", "Share one fact about yourself.", "Ask the tutor one question back."],
    order: 3,
  },
  {
    slug: "cafe",
    title: "At the café",
    goal: "Order something to eat or drink.",
    goals: ["Order politely (\"I'd like…\" / \"Could I have…, please\").", "Ask how much it costs."],
    order: 4,
  },
  {
    slug: "paying",
    title: "Paying",
    goal: "Understand a price when you hear it.",
    goals: ["Understand a spoken price.", "Say the price back to confirm it."],
    order: 5,
  },
  {
    slug: "directions",
    title: "Directions",
    goal: "Ask where something is and follow the answer.",
    goals: ["Ask where a place is.", "Repeat back one direction you were given."],
    order: 6,
  },
  {
    slug: "likes-weekend",
    title: "Likes and the weekend",
    goal: "Talk about what you like to do.",
    goals: ["Say something you like and give a reason.", "Ask the tutor a question."],
    order: 7,
  },
  {
    slug: "appointment",
    title: "Making an appointment",
    goal: "Set a day and time and confirm the details.",
    goals: ["Give a day and a time.", "Confirm one detail of the appointment."],
    order: 8,
  },
  FREE_TALK,
];
