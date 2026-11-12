import "@testing-library/jest-dom/vitest";

// jsdom lacks pointer capture, which Radix Toast's swipe handling calls.
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.hasPointerCapture = () => false;
