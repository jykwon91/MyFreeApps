import { createContext } from "react";

/** Lets a card on Home hand over how to refetch what it shows. Returns how to take it back. */
export type RegisterHomeRefetch = (refetch: () => unknown) => () => void;

/** Outside Home (a card on its own) there is nothing to refresh with. */
export const HomeRefreshContext = createContext<RegisterHomeRefetch>(() => () => undefined);
