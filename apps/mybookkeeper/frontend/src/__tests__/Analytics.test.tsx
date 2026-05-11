import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '@/shared/store';
import Analytics from '@/app/pages/Analytics';
import UtilityTrends from '@/app/features/analytics/UtilityTrends';
import UtilitySummaryCards from '@/app/features/analytics/UtilitySummaryCards';
import AnalyticsFilters from '@/app/features/analytics/AnalyticsFilters';
import AnalyticsSkeleton from '@/app/features/analytics/AnalyticsSkeleton';
import PropertyMultiSelect from '@/shared/components/PropertyMultiSelect';
import type { UtilityTrendsResponse } from '@/shared/types/analytics';
import type { Property } from '@/shared/types/property/property';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='line-chart'>{children}</div>
  ),
  Line: () => <div data-testid='line' />,
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  Tooltip: () => <div data-testid='tooltip' />,
  Legend: () => <div data-testid='legend' />,
  CartesianGrid: () => <div data-testid='cartesian-grid' />,
}));

vi.mock('@/shared/store/analyticsApi', () => ({
  useGetUtilityTrendsQuery: vi.fn(() => ({
    data: undefined, isLoading: true, isError: false, refetch: vi.fn(),
  })),
}));

vi.mock('@/shared/store/propertiesApi', () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [], isLoading: false })),
  useCreatePropertyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdatePropertyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeletePropertyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

import { useGetUtilityTrendsQuery } from '@/shared/store/analyticsApi';
import { useGetPropertiesQuery } from '@/shared/store/propertiesApi';

const mockProperties: Property[] = [
  { id: 'prop-1', name: 'Beach House', address: '123 Ocean Dr', classification: 'investment', type: 'short_term', is_active: true, activity_periods: [], created_at: '2024-01-01T00:00:00Z' },
  { id: 'prop-2', name: 'Mountain Cabin', address: '456 Pine Rd', classification: 'investment', type: 'long_term', is_active: true, activity_periods: [], created_at: '2024-06-01T00:00:00Z' },
];

const mockTrendsData: UtilityTrendsResponse = {
  trends: [
    { period: '2025-01', property_id: 'prop-1', property_name: 'Beach House', sub_category: 'electricity', total: 120 },
    { period: '2025-02', property_id: 'prop-1', property_name: 'Beach House', sub_category: 'electricity', total: 135 },
    { period: '2025-01', property_id: 'prop-1', property_name: 'Beach House', sub_category: 'water', total: 45 },
    { period: '2025-02', property_id: 'prop-1', property_name: 'Beach House', sub_category: 'water', total: 50 },
  ],
  summary: { electricity: 255, water: 95 },
  total_spend: 350,
};

const singlePeriodData: UtilityTrendsResponse = {
  trends: [
    { period: '2025-01', property_id: 'prop-1', property_name: 'Beach House', sub_category: 'electricity', total: 120 },
  ],
  summary: { electricity: 120 },
  total_spend: 120,
};

function renderWithProviders(ui: React.ReactElement, initialEntries: string[] = ['/']) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </Provider>,
  );
}

// ---------------------------------------------------------------------------
// Analytics page shell
// ---------------------------------------------------------------------------
describe('Analytics page shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('analytics-info-dismissed');
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: mockTrendsData, isLoading: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: [], isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);
  });

  it('renders the Analytics heading', () => {
    renderWithProviders(<Analytics />);
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('shows Utility Trends tab with aria-selected true by default', () => {
    renderWithProviders(<Analytics />);
    expect(screen.getByRole('tab', { name: 'Utility Trends' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows Utility Trends tab as active when tab=utility-trends in URL', () => {
    renderWithProviders(<Analytics />, ['/?tab=utility-trends']);
    expect(screen.getByRole('tab', { name: 'Utility Trends' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows info banner when not dismissed', () => {
    renderWithProviders(<Analytics />);
    expect(screen.getByText(/I track your utility costs over time/)).toBeInTheDocument();
  });

  it('hides info banner when dismissed in localStorage', () => {
    localStorage.setItem('analytics-info-dismissed', '1');
    renderWithProviders(<Analytics />);
    expect(screen.queryByText(/I track your utility costs over time/)).not.toBeInTheDocument();
  });

  it('dismisses info banner on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Analytics />);

    expect(screen.getByText(/I track your utility costs over time/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText(/I track your utility costs over time/)).not.toBeInTheDocument();
    expect(localStorage.getItem('analytics-info-dismissed')).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// UtilityTrends
// ---------------------------------------------------------------------------
describe('UtilityTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: [], isLoading: false,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);
  });

  it('shows skeleton while loading', () => {
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: undefined, isLoading: true, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    const { container } = renderWithProviders(<UtilityTrends />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no utility data exists and no filters are active', () => {
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: { trends: [], summary: {}, total_spend: 0 }, isLoading: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    renderWithProviders(<UtilityTrends />);
    expect(screen.getByText(/I haven't found any utility expenses yet/)).toBeInTheDocument();
    expect(screen.getByText('Upload documents')).toBeInTheDocument();
  });

  it('empty state links to the documents page', () => {
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: { trends: [], summary: {}, total_spend: 0 }, isLoading: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    renderWithProviders(<UtilityTrends />);
    expect(screen.getByText('Upload documents').closest('a')).toHaveAttribute('href', '/documents');
  });

  it('shows no-data-in-range message when filters are active but trends are empty', () => {
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: { trends: [], summary: {}, total_spend: 0 }, isLoading: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    renderWithProviders(<UtilityTrends />, ['/?from=2025-01-01&to=2025-03-31']);
    expect(screen.getByText(/No utility expenses found between/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset date range/i })).toBeInTheDocument();
  });

  it('shows summary cards and chart when data with multiple periods exists', () => {
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: mockTrendsData, isLoading: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    renderWithProviders(<UtilityTrends />);
    expect(screen.getByLabelText('Utility spend summary')).toBeInTheDocument();
    expect(screen.getByText('Utility Spend Over Time')).toBeInTheDocument();
  });

  it('shows one-month notice when only a single period of data exists', () => {
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: singlePeriodData, isLoading: false, isError: false, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    renderWithProviders(<UtilityTrends />);
    expect(screen.getByText(/I only have one month of data/)).toBeInTheDocument();
  });

  it('shows error state with retry button on API error', () => {
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    renderWithProviders(<UtilityTrends />);
    expect(screen.getByText(/I ran into a problem loading your utility data/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('calls refetch when the Retry button is clicked', async () => {
    const mockRefetch = vi.fn();
    vi.mocked(useGetUtilityTrendsQuery).mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: mockRefetch,
    } as unknown as ReturnType<typeof useGetUtilityTrendsQuery>);
    renderWithProviders(<UtilityTrends />);
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });
}); 

// ---------------------------------------------------------------------------
// UtilitySummaryCards
// ---------------------------------------------------------------------------
describe('UtilitySummaryCards', () => {
  it('renders the total spend card with correct amount', () => {
    render(<UtilitySummaryCards totalSpend={1234.5} summary={{ electricity: 800, water: 434.5 }} />);
    const section = screen.getByLabelText('Utility spend summary');
    expect(within(section).getByText('Total Utilities')).toBeInTheDocument();
    expect(within(section).getByText('$1,234.50')).toBeInTheDocument();
  });

  it('renders a card for every utility sub-category', () => {
    render(<UtilitySummaryCards totalSpend={500} summary={{ electricity: 200, water: 100, gas: 80, internet: 60, trash: 40, sewer: 20 }} />);
    expect(screen.getByText('Electricity')).toBeInTheDocument();
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByText('Gas')).toBeInTheDocument();
    expect(screen.getByText('Internet')).toBeInTheDocument();
    expect(screen.getByText('Trash')).toBeInTheDocument();
    expect(screen.getByText('Sewer')).toBeInTheDocument();
  });

  it('shows zero dollars for sub-categories absent from summary', () => {
    render(<UtilitySummaryCards totalSpend={0} summary={{}} />);
    // 1 total + 6 sub-categories all showing $0.00
    const zeroCells = screen.getAllByText('$0.00');
    expect(zeroCells.length).toBe(7);
  });

  it('formats currency correctly for large amounts', () => {
    render(<UtilitySummaryCards totalSpend={10500} summary={{ electricity: 10500 }} />);
    // Scope to the total card to verify the top-level summary formats correctly
    const section = screen.getByLabelText('Utility spend summary');
    const totalCard = within(section).getByText('Total Utilities').closest('div');
    expect(within(totalCard!).getByText('$10,500.00')).toBeInTheDocument();
  });
}); 

// ---------------------------------------------------------------------------
// AnalyticsFilters
// ---------------------------------------------------------------------------
describe('AnalyticsFilters', () => {
  const defaultProps = {
    fromDate: '2025-01-01',
    toDate: '2025-12-31',
    granularity: 'monthly' as const,
    propertyIds: [],
    properties: [],
    onFromDate: vi.fn(),
    onToDate: vi.fn(),
    onGranularity: vi.fn(),
    onPropertyIds: vi.fn(),
    hasActiveFilters: false,
    onClear: vi.fn(),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('renders from and to date inputs', () => {
    render(<AnalyticsFilters {...defaultProps} />);
    expect(screen.getAllByLabelText('From date').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText('To date').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Monthly and Quarterly granularity radio buttons', () => {
    render(<AnalyticsFilters {...defaultProps} />);
    const firstGroup = screen.getAllByRole('radiogroup')[0];
    expect(within(firstGroup).getByRole('radio', { name: 'Monthly' })).toBeInTheDocument();
    expect(within(firstGroup).getByRole('radio', { name: 'Quarterly' })).toBeInTheDocument();
  });

  it('marks Monthly as aria-checked when granularity is monthly', () => {
    render(<AnalyticsFilters {...defaultProps} granularity='monthly' />);
    expect(screen.getAllByRole('radio', { name: 'Monthly' })[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('marks Quarterly as aria-checked when granularity is quarterly', () => {
    render(<AnalyticsFilters {...defaultProps} granularity='quarterly' />);
    expect(screen.getAllByRole('radio', { name: 'Quarterly' })[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('does not show Clear filters button when no active filters', () => {
    render(<AnalyticsFilters {...defaultProps} hasActiveFilters={false} />);
    expect(screen.queryByRole('button', { name: /Clear all filters/i })).not.toBeInTheDocument();
  });

  it('shows Clear filters button when filters are active', () => {
    render(<AnalyticsFilters {...defaultProps} hasActiveFilters={true} />);
    expect(screen.getAllByRole('button', { name: /Clear all filters/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('calls onClear when Clear filters button is clicked', async () => {
    const onClear = vi.fn();
    render(<AnalyticsFilters {...defaultProps} hasActiveFilters={true} onClear={onClear} />);
    await userEvent.click(screen.getAllByRole('button', { name: /Clear all filters/i })[0]);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('renders mobile Filters toggle button with aria-expanded false initially', () => {
    render(<AnalyticsFilters {...defaultProps} />);
    expect(screen.getByRole('button', { name: /^Filters$/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands mobile filters panel when toggle is clicked', async () => {
    render(<AnalyticsFilters {...defaultProps} />);
    const toggle = screen.getByRole('button', { name: /^Filters$/i });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('mobile-filters')).toBeInTheDocument();
  });
}); 

// ---------------------------------------------------------------------------
// AnalyticsSkeleton
// ---------------------------------------------------------------------------
describe('AnalyticsSkeleton', () => {
  it('renders skeleton pulse elements', () => {
    const { container } = render(<AnalyticsSkeleton />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the summary card grid section', () => {
    const { container } = render(<AnalyticsSkeleton />);
    expect(container.querySelectorAll('.grid').length).toBeGreaterThanOrEqual(1);
  });

  it('renders 7 cards in the summary grid matching the loaded layout', () => {
    const { container } = render(<AnalyticsSkeleton />);
    const section = container.querySelector('section.grid');
    expect(section).not.toBeNull();
    // 1 total card + 6 sub-category cards (one per UTILITY_SUB_CATEGORIES) = 7 direct children
    expect(section!.querySelectorAll(':scope > div').length).toBe(7);
  });

  it('renders chart area skeleton with height matching the loaded chart', () => {
    const { container } = render(<AnalyticsSkeleton />);
    // Skeleton uses h-[350px] — same default height as UtilityTrendsChart
    expect(Array.from(container.querySelectorAll('[class]')).some(el => el.className.includes('h-[350px]'))).toBe(true);
  });

  it('renders 6 legend skeleton items', () => {
    const { container } = render(<AnalyticsSkeleton />);
    const legendItems = Array.from(container.querySelectorAll('.animate-pulse')).filter(
      (el) => el.classList.contains('w-20') && el.classList.contains('h-3'),
    );
    expect(legendItems.length).toBeGreaterThanOrEqual(6);
  });
}); 

// ---------------------------------------------------------------------------
// PropertyMultiSelect
// ---------------------------------------------------------------------------
describe('PropertyMultiSelect', () => {
  // Note: 'shows property checkboxes when opened' is not testable in jsdom because
  // Radix DropdownMenu.Portal does not render portal content without a real DOM.
  // That behavior should be covered by E2E tests.
  it('renders trigger button with All Properties label when nothing is selected', () => {
    render(<PropertyMultiSelect properties={mockProperties} selectedIds={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Filter by property/i })).toBeInTheDocument();
    expect(screen.getByText('All Properties')).toBeInTheDocument();
  });

  it('shows the property name in the trigger when exactly one property is selected', () => {
    render(<PropertyMultiSelect properties={mockProperties} selectedIds={['prop-1']} onChange={vi.fn()} />);
    expect(screen.getByText('Beach House')).toBeInTheDocument();
  });

  it('shows the count label when multiple properties are selected', () => {
    render(<PropertyMultiSelect properties={mockProperties} selectedIds={['prop-1', 'prop-2']} onChange={vi.fn()} />);
    expect(screen.getByText('2 properties')).toBeInTheDocument();
  });
}); 
