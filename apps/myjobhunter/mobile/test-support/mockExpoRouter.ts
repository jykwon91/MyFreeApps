import { mockRouter } from "./mockRouter";

/** expo-router's `router`, for jest.mock, sending each call to mockRouter so tests can see where the screen went. */
export const mockExpoRouter = {
  router: { back: () => mockRouter.back(), push: (path: string) => mockRouter.push(path) },
};
