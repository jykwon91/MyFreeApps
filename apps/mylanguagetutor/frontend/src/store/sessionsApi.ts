import { tutorBaseApi } from "@/store/tutorBaseApi";
import type { SessionCreate } from "@/types/tutor/session-create";
import type { TutorSession } from "@/types/tutor/tutor-session";

// Practice sessions. Turns stream over SSE (features/tutor-stream), not here.
const sessionsApi = tutorBaseApi.injectEndpoints({
  endpoints: (build) => ({
    createSession: build.mutation<TutorSession, SessionCreate>({
      query: (body) => ({ url: "/sessions", method: "POST", data: body }),
    }),
    endSession: build.mutation<TutorSession, string>({
      query: (sessionId) => ({ url: `/sessions/${sessionId}/end`, method: "POST" }),
    }),
  }),
});

export const { useCreateSessionMutation, useEndSessionMutation } = sessionsApi;
