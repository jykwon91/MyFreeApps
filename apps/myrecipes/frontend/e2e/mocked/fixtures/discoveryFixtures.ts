/** Discovery responses built to the api-client's types, for the no-backend discovery spec. */
import type {
  DiscoveredDetail,
  DiscoveredRecipe,
  DiscoveryResults,
} from "@myrecipes/api-client/types/recipe/discovery";

export const DISCOVERY_QUERY = "mexican flan";

/** A 1x1 PNG, enough for the browser to decode so a loaded thumbnail has a width. */
export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const FLAN_URL = "https://www.seriouseats.com/flan-napolitano";

export const NAPOLITANO: DiscoveredRecipe = {
  id: "aaaaaaaaaaaaaaaa",
  title: "Flan Napolitano",
  source_type: "website",
  site_name: "Serious Eats",
  url: FLAN_URL,
  image_url: "/discovery/image?url=https%3A%2F%2Fcdn.example%2Fflan.jpg&sig=stub",
  summary: "A cream-cheese-enriched flan with a dense, silky set.",
  why_notable: "The only version that water-baths at 325F.",
  total_minutes: 90,
  difficulty: "medium",
};

export const HOME_STYLE: DiscoveredRecipe = {
  id: "bbbbbbbbbbbbbbbb",
  title: "Authentic Mexican Flan",
  source_type: "blog",
  site_name: "Mexico in My Kitchen",
  url: "https://www.mexicoinmykitchen.com/flan",
  image_url: null,
  summary: "The home-style version, five ingredients.",
  why_notable: null,
  total_minutes: 75,
  difficulty: "easy",
};

export const VIDEO_FLAN: DiscoveredRecipe = {
  id: "cccccccccccccccc",
  title: "Perfect Flan Every Time",
  source_type: "youtube",
  site_name: "A Cooking Channel",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  image_url: "/discovery/image?url=https%3A%2F%2Fi.ytimg.com%2Fvi%2FdQw4w9WgXcQ%2Fhqdefault.jpg&sig=stub",
  summary: "Technique walkthrough, start to finish.",
  why_notable: "Watch the caramel stage rather than read it.",
  total_minutes: null,
  difficulty: null,
};

export const DISCOVERY_RESULTS: DiscoveryResults = {
  query: DISCOVERY_QUERY,
  recipes: [NAPOLITANO, HOME_STYLE, VIDEO_FLAN],
};

export const NAPOLITANO_DETAIL: DiscoveredDetail = {
  title: NAPOLITANO.title,
  source_type: "website",
  site_name: "Serious Eats",
  url: FLAN_URL,
  image_url: NAPOLITANO.image_url,
  summary: "A dense, cream-cheese flan set in a water bath.",
  draft: {
    title: "Flan Napolitano",
    description: "Silky and dense.",
    source: "Serious Eats",
    servings: "8",
    prep_minutes: 20,
    cook_minutes: 70,
    ingredients: [
      { name: "sweetened condensed milk", quantity: 1, unit: "can", note: null },
      { name: "cream cheese", quantity: 4, unit: "oz", note: "softened" },
      { name: "eggs", quantity: 5, unit: null, note: "room temperature" },
    ],
    steps: [
      { instruction: "Caramelize the sugar until deep amber." },
      { instruction: "Blend the custard until completely smooth." },
      { instruction: "Bake in a water bath at 325F for 70 minutes." },
    ],
  },
  tips: ["Do not let the caramel darken past amber."],
  community_notes: ["Commenters say to strain the custard twice."],
  sources: [FLAN_URL],
};
