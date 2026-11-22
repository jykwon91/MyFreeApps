interface ElementWithParent {
  parent: ElementWithParent | null;
  props: { accessible?: boolean };
}

/** A screen reader reads an accessible parent as one stop, so a heading inside one never reaches the headings list. */
export function isInsideAccessibleParent(element: ElementWithParent): boolean {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (parent.props.accessible === true) return true;
  }
  return false;
}
