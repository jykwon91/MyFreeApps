/**
 * Direction values accepted by the navigation API. The literal values
 * have to match the backend ``NavigateRequest.direction`` field
 * exactly — it's a Pydantic ``Literal["next", "prev"]``.
 */
export const NavDirection = {
  NEXT: "next",
  PREV: "prev",
} as const;

export type NavDirection = (typeof NavDirection)[keyof typeof NavDirection];
