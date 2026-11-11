import { educationRecord } from "./educationRecord";
import { profileRecord } from "./profileRecord";
import { screeningAnswerRecord } from "./screeningAnswerRecord";
import { skillRecord } from "./skillRecord";
import type { FakeRoute } from "./types/FakeRoute";
import type { ProfileSeed } from "./types/ProfileSeed";
import { workHistoryRecord } from "./workHistoryRecord";

/** The id each list gives the item a test adds. */
export const NEW_IDS = { workHistory: "wh-new", education: "ed-new", skill: "sk-new", answer: "sa-new" } as const;

/**
 * List, add, edit and delete for one profile list, held in memory so a write shows in the refetch.
 * Routes exist for every seeded id and for the added item's.
 */
function listRoutes<Item extends { id: string }>(
  path: string,
  initial: readonly Item[],
  newId: string,
  build: (id: string, body: Record<string, unknown>) => Item,
): Record<string, FakeRoute> {
  let items = [...initial];
  const routes: Record<string, FakeRoute> = {
    [`GET ${path}`]: () => ({ status: 200, data: { items, total: items.length } }),
    [`POST ${path}`]: (body) => {
      const created = build(newId, body);
      items = [...items, created];
      return { status: 201, data: created };
    },
  };
  for (const id of [...initial.map((item) => item.id), newId]) {
    routes[`PATCH ${path}/${id}`] = (body) => {
      const current = items.find((item) => item.id === id);
      if (!current) return { status: 404, data: { detail: "Not found" } };
      const changed = { ...current, ...body } as Item;
      items = items.map((item) => (item.id === id ? changed : item));
      return { status: 200, data: changed };
    };
    routes[`DELETE ${path}/${id}`] = () => {
      items = items.filter((item) => item.id !== id);
      return { status: 204 };
    };
  }
  return routes;
}

/** Every request the Profile tab makes, answered from `seed`. */
export function profileRoutes(seed: ProfileSeed = {}): Record<string, FakeRoute> {
  let profile = seed.profile ?? profileRecord();
  return {
    "GET /profile": () => ({ status: 200, data: profile }),
    "PATCH /profile": (body) => {
      profile = { ...profile, ...body };
      return { status: 200, data: profile };
    },
    ...listRoutes("/work-history", seed.workHistory ?? [], NEW_IDS.workHistory, (id, body) => workHistoryRecord({ id, ...body })),
    ...listRoutes("/education", seed.education ?? [], NEW_IDS.education, (id, body) => educationRecord({ id, ...body })),
    ...listRoutes("/skills", seed.skills ?? [], NEW_IDS.skill, (id, body) => skillRecord({ id, name: String(body.name), ...body })),
    ...listRoutes("/screening-answers", seed.answers ?? [], NEW_IDS.answer, (id, body) =>
      screeningAnswerRecord({ id, question_key: String(body.question_key), ...body }),
    ),
  };
}
