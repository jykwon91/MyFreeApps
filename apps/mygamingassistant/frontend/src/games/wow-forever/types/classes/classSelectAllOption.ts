/** An extra choice after the classes, e.g. "All classes"; picking it calls `onSelect`. */
export interface ClassSelectAllOption {
  label: string;
  onSelect: () => void;
}
