/** The longest each text field may be, by field. */
export type FieldLimits<Values> = { [Field in keyof Values]?: number };
