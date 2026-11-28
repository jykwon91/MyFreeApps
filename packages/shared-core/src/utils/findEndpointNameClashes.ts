import { baseApi } from "../store/baseApi";

/**
 * Loads store modules with every baseApi injection set to throw on an endpoint name already taken, and returns one
 * line per module that clashed. Two modules can't share a name: RTK Query keeps the first injection and skips the
 * second, so the second module's hook calls the first one's URL, and it only says so in development.
 */
export async function findEndpointNameClashes(loaders: Record<string, () => Promise<unknown>>): Promise<string[]> {
  const inject = baseApi.injectEndpoints;
  // The same call with one option changed; TypeScript can't carry injectEndpoints' generic signature through a wrapper.
  baseApi.injectEndpoints = ((options) => inject({ ...options, overrideExisting: "throw" })) as typeof inject;
  const clashes: string[] = [];
  try {
    for (const [path, load] of Object.entries(loaders)) {
      try {
        await load();
      } catch (error) {
        clashes.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    baseApi.injectEndpoints = inject;
  }
  return clashes;
}
