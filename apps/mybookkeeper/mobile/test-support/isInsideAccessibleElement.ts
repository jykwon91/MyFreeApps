interface TreeNode {
  props: { accessible?: unknown };
  parent: TreeNode | null;
}

/** True when something above `element` is `accessible`, which on iOS folds `element` into it so VoiceOver can't reach it on its own. */
export function isInsideAccessibleElement(element: { parent: TreeNode | null }): boolean {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (parent.props.accessible === true) return true;
  }
  return false;
}
