import SectionHeader from "@/shared/components/ui/SectionHeader";

export default function UserActivity() {
  const dashboardUrl = import.meta.env.VITE_POSTHOG_DASHBOARD_URL;

  return (
    <div className="p-4 sm:p-8 h-full flex flex-col space-y-6">
      <SectionHeader
        title="User Activity"
        subtitle="Live product analytics via PostHog"
      />
      {dashboardUrl ? (
        <iframe
          src={dashboardUrl}
          title="PostHog User Activity Dashboard"
          className="w-full flex-1 min-h-[600px] border rounded-lg bg-card shadow-sm"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center border rounded-lg bg-card p-8">
          <div className="max-w-md text-center space-y-3">
            <h3 className="text-lg font-semibold">PostHog dashboard not configured</h3>
            <p className="text-sm text-muted-foreground">
              Create a shared dashboard in PostHog, then set{" "}
              <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">
                VITE_POSTHOG_DASHBOARD_URL
              </code>{" "}
              in your frontend environment to embed it here.
            </p>
            <p className="text-sm text-muted-foreground">
              In the meantime, visit{" "}
              <a
                href="https://us.posthog.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                posthog.com
              </a>{" "}
              directly to view activity.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
