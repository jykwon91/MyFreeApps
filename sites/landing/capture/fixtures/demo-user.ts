/**
 * The fictional demo account every seeded app shares. It only ever exists in
 * the local, throwaway portfolio_demo_* databases, never in a deployed app.
 * Set DEMO_PASSWORD to override the local placeholder.
 */
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_NAME = "Alex Rivera";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Portfolio-Demo-Local-2026!"; // gitleaks:allow
