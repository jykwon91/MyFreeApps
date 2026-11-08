/** The resource a class uses: from ChrClasses.DisplayPower (0 = mana, 1 = rage, 3 = energy). */
export type ClassResource = "mana" | "rage" | "energy";

/** Game-file details for one class: its icon and primary resource. */
export interface ClassDetail {
  /** IconFileDataID from ChrClasses — passed to GameIcon as a file icon. */
  icon: number;
  resource: ClassResource;
}
