const MESSAGE =
  "colors.destructive is the button fill (2.0:1 on the dark background). Use colors.destructiveText for text, icons and thin indicators.";

/** Flat-config block shared by every phone app: bans the button-fill token as a text `color`. */
export const destructiveTextRule = {
  files: ["app/**", "src/**"],
  rules: {
    "no-restricted-syntax": [
      "error",
      { selector: "Property[key.name='color'] MemberExpression[property.name='destructive']", message: MESSAGE },
      { selector: "JSXAttribute[name.name='color'] MemberExpression[property.name='destructive']", message: MESSAGE },
    ],
  },
};
