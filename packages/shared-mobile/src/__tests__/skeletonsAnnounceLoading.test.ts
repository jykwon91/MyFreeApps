/// <reference types="node" />
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "../../../..");
const SOURCE_ROOTS = ["apps/mybookkeeper/mobile/src", "apps/myjobhunter/mobile/src", "apps/mylanguagetutor/mobile/src", "apps/myrecipes/mobile/src", "packages/shared-mobile/src"].map((root) => join(REPO_ROOT, root));

/**
 * Files that render a Skeleton outside a LoadingRegion on purpose, and why. Each is shown only
 * where something else already tells a screen reader the screen is loading; wrapping it as well
 * would have the reader say "Loading" again for every row.
 */
const ANNOUNCED_ELSEWHERE: Record<string, string> = {
  "apps/mybookkeeper/mobile/src/features/vendors/VendorSkeletonRow.tsx": "Row; rendered only inside VendorsSkeleton's LoadingRegion and VendorsScreen's load-more LoadingRegion.",
  "apps/mybookkeeper/mobile/src/features/listings/ListingSkeletonRow.tsx": "Row; rendered only inside ListingsSkeleton's LoadingRegion and ListingsScreen's load-more LoadingRegion.",
  "apps/mybookkeeper/mobile/src/features/inquiries/InquiriesSkeleton.tsx": "InquirySkeletonRow, exported from here, is rendered only inside InquiriesSkeleton's LoadingRegion and InquiriesScreen's load-more LoadingRegion.",
  "apps/mybookkeeper/mobile/src/features/applicants/ApplicantsSkeleton.tsx": "ApplicantSkeletonRow, exported from here, is rendered only inside ApplicantsSkeleton's LoadingRegion and the load-more LoadingRegions of the applicants, tenants and leases lists.",
  "apps/mybookkeeper/mobile/src/features/leaseTemplates/LeaseTemplatesSkeleton.tsx": "LeaseTemplateSkeletonRow, exported from here, is rendered only inside LeaseTemplatesSkeleton's LoadingRegion and the template pickers' load-more LoadingRegion (PagedListFooter).",
  "apps/mybookkeeper/mobile/src/features/receipts/ReceiptSkeletonRow.tsx": "Row; rendered only inside ReceiptsSkeleton's LoadingRegion and ReceiptsScreen's load-more LoadingRegion (PagedListFooter).",
  "apps/mybookkeeper/mobile/src/features/welcomeManuals/WelcomeManualsSkeleton.tsx": "WelcomeManualSkeletonRow, exported from here, is rendered only inside WelcomeManualsSkeleton's LoadingRegion and WelcomeManualsScreen's load-more LoadingRegion (PagedListFooter).",
  "apps/mybookkeeper/mobile/src/features/shell/PagedChoicesFooter.tsx": "Row; passed to PagedListFooter, which renders it only inside a load-more LoadingRegion.",
  "apps/mybookkeeper/mobile/src/features/mortgages/MortgageSkeletonRow.tsx": "Row; rendered only inside MortgagesSkeleton's LoadingRegion and MortgagesScreen's load-more LoadingRegion (PagedListFooter).",
  "apps/mybookkeeper/mobile/src/features/utilityPlans/UtilityPlanSkeletonRow.tsx": "Row; rendered only inside UtilityPlansSkeleton's LoadingRegion and UtilityPlansScreen's load-more LoadingRegion (PagedListFooter).",
  "apps/mybookkeeper/mobile/src/features/documents/DocumentSkeletonRow.tsx": "Row; rendered only inside DocumentsSkeleton's LoadingRegion and DocumentsScreen's load-more LoadingRegion (PagedListFooter).",
  "apps/mybookkeeper/mobile/src/features/insurance/PolicySkeletonRow.tsx": "Row; rendered only inside PoliciesSkeleton's LoadingRegion and PoliciesScreen's load-more LoadingRegion (PagedListFooter).",
  "apps/mybookkeeper/mobile/src/features/transactions/TransactionsSkeleton.tsx": "TransactionSkeletonRow, exported from here, is rendered only inside TransactionsSkeleton's LoadingRegion and the load-more LoadingRegions (PagedListFooter) of TransactionsScreen and DrillDownScreen.",
  "apps/myjobhunter/mobile/src/features/discover/ButtonRowSkeleton.tsx": "Part of a card; rendered only by DiscoveredJobSkeletonCard.",
  "apps/myjobhunter/mobile/src/features/discover/DiscoveredJobSkeletonCard.tsx": "Card; rendered only inside DiscoverJobsSkeleton's LoadingRegion.",
  "apps/myjobhunter/mobile/src/features/discover/SavedSearchSkeletonRow.tsx": "Row; rendered only inside SavedSearchesSection's loading LoadingRegion.",
  "apps/myjobhunter/mobile/src/features/companyDetail/CompanyApplicationSkeletonRows.tsx": "Rows; rendered only inside LoadingRegions: CompanyApplicationsSection's first load and load-more, and CompanyDetailSkeleton.",
  "apps/myjobhunter/mobile/src/features/companyDetail/ResearchSkeleton.tsx": "Rendered inside CompanyResearchSection's and CompanyDetailSkeleton's LoadingRegions, and under ResearchBody's running note, a polite live region beside a busy Run button.",
  "apps/myjobhunter/mobile/src/features/dashboard/BoardCardSkeleton.tsx": "Card; rendered only inside DashboardSkeleton's LoadingRegion.",
  "apps/myjobhunter/mobile/src/features/applications/ApplicationSkeletonRow.tsx": "Row; rendered only inside ApplicationsSkeleton's and ApplicationsListFooter's LoadingRegions.",
  "apps/myjobhunter/mobile/src/features/analyze/AnalysisSkeletonFlags.tsx": "Part of AnalysisSkeleton; rendered only there.",
  "apps/myjobhunter/mobile/src/features/analyze/AnalysisSkeleton.tsx": "Hidden on purpose: rendered only by AnalyzeProgress, which announces what the AI is doing and labels its spinner.",
  "apps/myjobhunter/mobile/src/features/documents/DocumentSkeletonCard.tsx": "Card; rendered only inside DocumentsSkeleton's LoadingRegion.",
  "apps/myjobhunter/mobile/src/features/companies/CompanySkeletonRow.tsx": "Row; rendered only inside CompaniesSkeleton's LoadingRegion.",
  "apps/myrecipes/mobile/src/features/versions/VersionHistoryScreen.tsx": "The compare bar's stand-in shows only while the list below shows VersionListSkeleton, whose LoadingRegion announces the load.",
  "apps/myrecipes/mobile/src/features/versions/DiffSkeletonRow.tsx": "Row; rendered only inside VersionDiffSkeleton's LoadingRegion.",
  "apps/myrecipes/mobile/src/features/recipes/RecipeTitleBlock.tsx": "The title's stand-in shows only above RecipeDetailSkeleton, whose LoadingRegion announces the load.",
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__" || entry.name === "node_modules") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** True when some `<Skeleton>` in the source sits outside every `<LoadingRegion>` element. */
export function hasUnannouncedSkeleton(source: string): boolean {
  return [...source.matchAll(/<Skeleton(?=[\s/>])/g)].some((match) => {
    const before = source.slice(0, match.index);
    const opened = before.match(/<LoadingRegion(?=[\s>])/g)?.length ?? 0;
    const closed = before.match(/<\/LoadingRegion>/g)?.length ?? 0;
    return opened <= closed;
  });
}

const files = SOURCE_ROOTS.flatMap(sourceFiles).map((path) => ({ path: path.replace(`${REPO_ROOT}/`, ""), source: readFileSync(path, "utf8") }));

describe("skeletons announce loading", () => {
  it("spots a Skeleton outside a LoadingRegion", () => {
    expect(hasUnannouncedSkeleton("<View><Skeleton height={20} /></View>")).toBe(true);
    expect(hasUnannouncedSkeleton("<LoadingRegion><Skeleton /></LoadingRegion>")).toBe(false);
    expect(hasUnannouncedSkeleton('<LoadingRegion label="x"><View><Skeleton /></View></LoadingRegion>')).toBe(false);
    expect(hasUnannouncedSkeleton("<LoadingRegion><Skeleton /></LoadingRegion>{busy ? <Skeleton /> : null}")).toBe(true);
    expect(hasUnannouncedSkeleton("import { Skeleton } from 'x'; <SkeletonRow />")).toBe(false);
  });

  it("finds the source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("is true of every Skeleton in the apps and shared-mobile: it sits in a LoadingRegion, or its file says what announces it instead", () => {
    const offenders = files.filter(({ path, source }) => hasUnannouncedSkeleton(source) && !(path in ANNOUNCED_ELSEWHERE)).map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("keeps no stale allowlist entries", () => {
    const stillNeeded = new Set(files.filter(({ source }) => hasUnannouncedSkeleton(source)).map(({ path }) => path));

    expect(Object.keys(ANNOUNCED_ELSEWHERE).filter((path) => !stillNeeded.has(path))).toEqual([]);
  });
});
