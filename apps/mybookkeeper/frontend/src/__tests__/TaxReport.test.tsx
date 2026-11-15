import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from '@/shared/store';
import TaxReport from '@/app/pages/TaxReport';
import type { TaxSummaryResponse } from '@mybookkeeper/api-client/types/summary/TaxSummaryResponse';

const currentYear = new Date().getFullYear();

const mockTaxSummary: TaxSummaryResponse = {
  year: currentYear - 1,
  gross_revenue: 24000,
  total_deductions: 8500,
  net_taxable_income: 15500,
  by_category: {
    repairs: 3000,
    utilities: 2000,
    insurance: 1500,
    uncategorized: 2000,
  },
  by_property: [
    {
      property_id: 'prop-1',
      name: 'Beach House',
      revenue: 14000,
      expenses: 5000,
      net_income: 9000,
    },
    {
      property_id: 'prop-2',
      name: 'Mountain Cabin',
      revenue: 10000,
      expenses: 3500,
      net_income: 6500,
    },
  ],
  w2_income: [
    {
      employer: 'Acme Corp',
      ein: '12-3456789',
      wages: 75000,
      federal_withheld: 12000,
      social_security_wages: 75000,
      social_security_withheld: 4650,
      medicare_wages: 75000,
      medicare_withheld: 1088,
      state_wages: 75000,
      state_withheld: 4500,
    },
  ],
  w2_total: 75000,
  total_income: 99000,
};


vi.mock('@mybookkeeper/api-client/store/summaryApi', () => ({
  useGetTaxSummaryQuery: vi.fn(() => ({ currentData: mockTaxSummary, isLoading: false })),
}));

vi.mock('@/shared/utils/download', () => ({
  downloadFile: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/shared/hooks/useToast', () => ({
  useToast: vi.fn(() => ({ showError: vi.fn(), showSuccess: vi.fn() })),
}));

import { useGetTaxSummaryQuery } from '@mybookkeeper/api-client/store/summaryApi';
import { downloadFile } from '@/shared/utils/download';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}
describe('TaxReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('tax-report-info-dismissed');
    vi.mocked(useGetTaxSummaryQuery).mockReturnValue({
      currentData: mockTaxSummary,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxSummaryQuery>);
  });

  afterEach(() => {
    localStorage.removeItem('tax-report-info-dismissed');
  });

  it('marks mortgage principal as not deductible', () => {
    vi.mocked(useGetTaxSummaryQuery).mockReturnValue({
      currentData: { ...mockTaxSummary, by_category: { mortgage_interest: 300, mortgage_principal: 200 } },
      isLoading: false,
    } as never);
    render(<Provider store={store}><BrowserRouter><TaxReport /></BrowserRouter></Provider>);
    expect(screen.getAllByText('Not deductible')).toHaveLength(1);
  });

  it('renders the Tax Report title', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Tax Report')).toBeInTheDocument();
  });

  it('renders Export PDF button', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Export PDF')).toBeInTheDocument();
  });

  it('renders Schedule E export button', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Schedule E')).toBeInTheDocument();
  });

  it('renders year selector with current and prior years', () => {
    renderWithProviders(<TaxReport />);
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('shows skeleton when loading', () => {
    vi.mocked(useGetTaxSummaryQuery).mockReturnValue({
      currentData: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetTaxSummaryQuery>);
    const { container } = renderWithProviders(<TaxReport />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('lays the skeleton\'s summary cards out on the same grid as the loaded report', () => {
    const loaded = renderWithProviders(<TaxReport />);
    const loadedGrid = screen.getByText('Rental Revenue').closest('section')!.className;
    loaded.unmount();

    vi.mocked(useGetTaxSummaryQuery).mockReturnValue({
      currentData: undefined,
      isFetching: true,
    } as unknown as ReturnType<typeof useGetTaxSummaryQuery>);
    renderWithProviders(<TaxReport />);
    expect(screen.getByTestId('tax-report-skeleton-summary-cards').className).toBe(loadedGrid);
  });

  it('renders Rental Revenue summary card', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Rental Revenue')).toBeInTheDocument();
  });

  it('renders Rental Deductions summary card', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Rental Deductions')).toBeInTheDocument();
  });

  it('renders Total Income card when W-2 income is present', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Total Income')).toBeInTheDocument();
  });

  it('renders W-2 Income card when w2_total is nonzero', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('W-2 Income')).toBeInTheDocument();
  });

  it('does not render W-2 Income card when w2_total is zero', () => {
    vi.mocked(useGetTaxSummaryQuery).mockReturnValue({
      currentData: { ...mockTaxSummary, w2_total: 0, w2_income: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxSummaryQuery>);
    renderWithProviders(<TaxReport />);
    expect(screen.queryByText('W-2 Income')).not.toBeInTheDocument();
  });

  it('shows Net Taxable Income label when no W-2 income', () => {
    vi.mocked(useGetTaxSummaryQuery).mockReturnValue({
      currentData: { ...mockTaxSummary, w2_total: 0, w2_income: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxSummaryQuery>);
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Net Taxable Income')).toBeInTheDocument();
  });

  it('renders W-2 employment income table with employer name', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Employment Income (W-2)')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/EIN: 12-3456789/)).toBeInTheDocument();
  });

  it('does not render W-2 table when w2_income is empty', () => {
    vi.mocked(useGetTaxSummaryQuery).mockReturnValue({
      currentData: { ...mockTaxSummary, w2_total: 0, w2_income: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxSummaryQuery>);
    renderWithProviders(<TaxReport />);
    expect(screen.queryByText('Employment Income (W-2)')).not.toBeInTheDocument();
  });

  it('renders deductions table with category rows', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Repairs')).toBeInTheDocument();
    expect(screen.getByText('Utilities')).toBeInTheDocument();
  });

  it('renders uncategorized row with needs review warning', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Needs review before filing')).toBeInTheDocument();
  });

  it('renders By Property section with property names', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('By Property')).toBeInTheDocument();
    expect(screen.getByText('Beach House')).toBeInTheDocument();
    expect(screen.getByText('Mountain Cabin')).toBeInTheDocument();
  });

  it('renders property Revenue, Expenses, Net Income columns', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByText('Net Income')).toBeInTheDocument();
  });

  it('shows empty state message when by_category is empty', () => {
    vi.mocked(useGetTaxSummaryQuery).mockReturnValue({
      currentData: { ...mockTaxSummary, by_category: {}, by_property: [] },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTaxSummaryQuery>);
    renderWithProviders(<TaxReport />);
    expect(screen.getByText(/No tax data for/)).toBeInTheDocument();
    expect(screen.getByText(/Approve some tax-relevant documents/)).toBeInTheDocument();
  });

  it('shows info banner when not dismissed', () => {
    renderWithProviders(<TaxReport />);
    expect(screen.getByText(/This is your tax summary for the selected year/)).toBeInTheDocument();
  });

  it('hides info banner when dismissed in localStorage', () => {
    localStorage.setItem('tax-report-info-dismissed', '1');
    renderWithProviders(<TaxReport />);
    expect(screen.queryByText(/This is your tax summary for the selected year/)).not.toBeInTheDocument();
  });

  it('dismisses info banner on Dismiss click and persists to localStorage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaxReport />);
    expect(screen.getByText(/This is your tax summary for the selected year/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText(/This is your tax summary for the selected year/)).not.toBeInTheDocument();
    expect(localStorage.getItem('tax-report-info-dismissed')).toBe('1');
  });

  it('calls downloadFile with correct PDF path when Export PDF is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaxReport />);
    await user.click(screen.getByText('Export PDF'));
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(
      expect.stringContaining('/exports/tax-summary/'),
      expect.stringContaining('tax_summary_'),
    );
  });

  it('calls downloadFile with correct Schedule E path when Schedule E is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaxReport />);
    await user.click(screen.getByText('Schedule E'));
    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(
      expect.stringContaining('/exports/schedule-e/'),
      expect.stringContaining('schedule_e_'),
    );
  });

  describe('after a different year is picked', () => {
    const shownYear = currentYear - 1;
    const pickedYear = currentYear - 2;
    const refetch = vi.fn();

    /**
     * What RTK's hook returns: the shown year's settled answer for its own year,
     * and for any other year `data` still holding the shown year's figures
     * (it keeps the last result) while `currentData` has nothing yet.
     */
    function answerShownYearOnly(pickedYearState: { isFetching: boolean; error?: unknown }) {
      vi.mocked(useGetTaxSummaryQuery).mockImplementation(((year: number) =>
        year === shownYear
          ? { data: mockTaxSummary, currentData: mockTaxSummary, isLoading: false, isFetching: false, refetch }
          : {
              data: mockTaxSummary,
              currentData: undefined,
              isLoading: false,
              isError: pickedYearState.error !== undefined,
              refetch,
              ...pickedYearState,
            }) as unknown as typeof useGetTaxSummaryQuery);
    }

    async function pickYear() {
      renderWithProviders(<TaxReport />);
      expect(screen.getByText('$24,000.00')).toBeInTheDocument();
      await userEvent.setup().selectOptions(screen.getByRole('combobox'), String(pickedYear));
    }

    function expectNoShownYearFigures() {
      expect(screen.queryByText('Rental Revenue')).not.toBeInTheDocument();
      expect(screen.queryByText('$24,000.00')).not.toBeInTheDocument();
      expect(screen.queryByText('W-2 Income')).not.toBeInTheDocument();
      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
    }

    it('shows the skeleton, not the previous year\'s figures, while it loads', async () => {
      answerShownYearOnly({ isFetching: true });
      await pickYear();

      expectNoShownYearFigures();
      expect(screen.getByTestId('tax-report-skeleton')).toBeInTheDocument();
      // The year selector stays put, showing the year being loaded.
      expect(screen.getByRole('combobox')).toHaveValue(String(pickedYear));
    });

    it('shows an error with Retry, not the previous year\'s figures, when it fails', async () => {
      answerShownYearOnly({ isFetching: false, error: { status: 500 } });
      await pickYear();

      expectNoShownYearFigures();
      expect(screen.queryByTestId('tax-report-skeleton')).not.toBeInTheDocument();
      expect(screen.getByText(`I couldn't load your ${pickedYear} tax summary. Want me to try again?`)).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('keeps the error up, retrying, while Retry refetches', async () => {
      answerShownYearOnly({ isFetching: true, error: { status: 500 } });
      await pickYear();

      expect(screen.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
      expect(screen.queryByTestId('tax-report-skeleton')).not.toBeInTheDocument();
    });
  });
});
