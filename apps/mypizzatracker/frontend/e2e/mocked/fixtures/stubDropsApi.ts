/**
 * Stubs the operator's drops API (app/api/drops.py) over state the writes
 * change: GET /drops filters by ?status= and lists newest date first (then
 * newest created), like drop_repo.list_drops; POST /drops adds a planning
 * drop; any other method on /drops is FastAPI's 405; PATCH /drops/{id} merges
 * the body; POST /drops/{id}/slots adds a slot. Anything else is the
 * catch-all's 404.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { Drop, DropCreateBody, DropUpdateBody, SlotCreateBody } from "@/types/drop/drop";
import type { DropsApiStub } from "../types/DropsApiStub";
import { apiPath, pathId } from "@platform/ui/test-support/apiPath";
import { dropFromCreate, newestFirst, sampleDrops, slotFromCreate } from "./dropFixtures";
import { dropIdAt } from "./fixtureIds";
import { recordWrite } from "@platform/ui/test-support/recordWrite";

const DROPS = /^\/drops$/;
const DROP = /^\/drops\/([^/]+)$/;
const SLOTS = /^\/drops\/([^/]+)\/slots$/;
const NOT_FOUND = { detail: "Not Found" };
const METHOD_NOT_ALLOWED = { detail: "Method Not Allowed" };
/** New records number past every fixture's, so ids never collide. */
const FIRST_NEW = 100;

export async function stubDropsApi(page: Page, drops: Drop[] = sampleDrops()): Promise<DropsApiStub> {
  const stub: DropsApiStub = { writes: [], listStatuses: [] };
  let state = drops.map((drop) => ({ ...drop, slots: [...drop.slots] }));
  let created = FIRST_NEW;

  await page.route(apiPath(DROPS), (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const status = new URL(request.url()).searchParams.get("status") ?? "";
      stub.listStatuses.push(status);
      const listed = newestFirst(state);
      return route.fulfill(json(status ? listed.filter((d) => d.status === status) : listed));
    }
    if (request.method() !== "POST") return route.fulfill(json(METHOD_NOT_ALLOWED, 405));
    const drop = dropFromCreate(dropIdAt(created++), recordWrite(stub.writes, request) as DropCreateBody);
    state = [...state, drop];
    return route.fulfill(json(drop, 201));
  });

  await page.route(apiPath(DROP), (route) => {
    const request = route.request();
    const id = pathId(DROP, request);
    const drop = state.find((d) => d.id === id);
    if (!drop) return route.fulfill(json(NOT_FOUND, 404));
    if (request.method() === "GET") return route.fulfill(json(drop));
    const body = recordWrite(stub.writes, request) as DropUpdateBody;
    const updated: Drop = { ...drop, ...body };
    state = state.map((d) => (d.id === id ? updated : d));
    return route.fulfill(json(updated));
  });

  await page.route(apiPath(SLOTS), (route) => {
    const request = route.request();
    const id = pathId(SLOTS, request);
    const drop = state.find((d) => d.id === id);
    if (!drop || request.method() !== "POST") return route.fulfill(json(NOT_FOUND, 404));
    const slot = slotFromCreate(drop.id, created++, recordWrite(stub.writes, request) as SlotCreateBody);
    state = state.map((d) => (d.id === id ? { ...d, slots: [...d.slots, slot] } : d));
    return route.fulfill(json(slot, 201));
  });

  return stub;
}
