/** A search box's text, debounced into a URL param. */
export interface DebouncedSearchParam {
  /** What's in the box, as typed. */
  text: string;
  setText: (text: string) => void;
  /** The param's value (trimmed text, once the box stops changing); "" for none. */
  value: string;
}
