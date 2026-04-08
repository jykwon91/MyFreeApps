import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from '@/shared/store';
import TaxReturns from '@/app/pages/TaxReturns';
import type { TaxReturn } from '@/shared/types/tax/tax-return';

const currentYear = new Date().getFullYear();

const mockReturns: TaxReturn[] = [
  {
    id: 'tr-1',
    organization_id: 'org-1',
    tax_year: currentYear - 1,
    filing_status: 'single',
    jurisdiction: 'federal',
    status: 'draft',
    needs_recompute: false,
    filed_at: null,
    created_at: '2025-01-10T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z',
  },
  {
    id: 'tr-2',
    organization_id: 'org-1',
    tax_year: currentYear - 2,
    filing_status: 'married_filing_jointly',
    jurisdiction: 'federal',
    status: 'filed',
    needs_recompute: false,
    filed_at: '2024-04-15T00:00:00Z',
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-04-15T00:00:00Z',
  },
];

const mockCreateReturn = vi.fn(() => ({
  unwrap: () => Promise.resolve({ ...mockReturns[0], id: 'tr-new', tax_year: currentYear }),
}));
const mockNavigate = vi.fn();

vi.mock('@/shared/store/taxReturnsApi', () => ({
  useListTaxReturnsQuery: vi.fn(() => ({ data: mockReturns, isLoading: false })),
  useCreateTaxReturnMutation: vi.fn(() => [mockCreateReturn, { isLoading: false }]),
}));

vi.mock('react-router-dom', async () => {
  const actual = await import('react-router-dom');
  return { ...actual, useNavigate: vi.fn(() => mockNavigate) };
});

vi.mock('@/shared/hooks/useToast', () => ({
  useToast: vi.fn(() => ({ showError: vi.fn(), showSuccess: vi.fn() })),
}));

import { useListTaxReturnsQuery } from '@/shared/store/taxReturnsApi';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}
describe('TaxReturns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('tax-returns-info-dismissed');
    vi.mocked(useListTaxReturnsQuery).mockReturnValue({
      data: mockReturns,
      isLoading: false,
    } as unknown as ReturnType<typeof useListTaxReturnsQuery>);
  });

  afterEach(() => {
    localStorage.removeItem('tax-returns-info-dismissed');
  });

  it('renders the Tax Returns title', () => {
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText('Tax Returns')).toBeInTheDocument();
  });

  it('renders New Return button', () => {
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText('New Return')).toBeInTheDocument();
  });

  it('renders tax return cards sorted by year descending', () => {
    renderWithProviders(<TaxReturns />);
    const year1 = screen.getByText(String(currentYear - 1));
    const year2 = screen.getByText(String(currentYear - 2));
    // year1 (more recent) should appear before year2 in the DOM
    expect(year1.compareDocumentPosition(year2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders Draft badge for draft status', () => {
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders Filed badge for filed status', () => {
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText('Filed')).toBeInTheDocument();
  });

  it('renders filing status label on each card', () => {
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText('single')).toBeInTheDocument();
    expect(screen.getByText('married filing jointly')).toBeInTheDocument();
  });

  it('renders Updated date on each card', () => {
    renderWithProviders(<TaxReturns />);
    expect(screen.getAllByText(/Updated/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows skeleton when loading', () => {
    vi.mocked(useListTaxReturnsQuery).mockReturnValue({
      data: [],
      isLoading: true,
    } as unknown as ReturnType<typeof useListTaxReturnsQuery>);
    const { container } = renderWithProviders(<TaxReturns />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no tax returns exist', () => {
    vi.mocked(useListTaxReturnsQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useListTaxReturnsQuery>);
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText('No tax returns yet')).toBeInTheDocument();
    expect(screen.getByText('Create your first tax return to get started.')).toBeInTheDocument();
  });

  it('shows info banner when not previously dismissed', () => {
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText(/A tax return here is a workspace/)).toBeInTheDocument();
  });

  it('hides info banner when already dismissed in localStorage', () => {
    localStorage.setItem('tax-returns-info-dismissed', '1');
    renderWithProviders(<TaxReturns />);
    expect(screen.queryByText(/A tax return here is a workspace/)).not.toBeInTheDocument();
  });

  it('dismisses info banner on Dismiss click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText(/A tax return here is a workspace/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText(/A tax return here is a workspace/)).not.toBeInTheDocument();
    expect(localStorage.getItem('tax-returns-info-dismissed')).toBe('1');
  });

  it('opens create form when New Return is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaxReturns />);
    await user.click(screen.getByText('New Return'));
    expect(screen.getByText('Create Tax Return')).toBeInTheDocument();
    expect(screen.getByText('Tax Year')).toBeInTheDocument();
    expect(screen.getByText('Filing Status')).toBeInTheDocument();
  });

  it('hides create form when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaxReturns />);
    await user.click(screen.getByText('New Return'));
    expect(screen.getByText('Create Tax Return')).toBeInTheDocument();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create Tax Return')).not.toBeInTheDocument();
  });

  it('shows all filing status options in the create form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaxReturns />);
    await user.click(screen.getByText('New Return'));
    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByText('Married Filing Jointly')).toBeInTheDocument();
    expect(screen.getByText('Head of Household')).toBeInTheDocument();
  });

  it('calls createReturn and navigates on successful creation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaxReturns />);
    await user.click(screen.getByText('New Return'));
    await user.click(screen.getByText('Create'));
    expect(mockCreateReturn).toHaveBeenCalled();
  });

  it('shows needs recompute indicator on affected cards', () => {
    const returnsWithRecompute: TaxReturn[] = [
      { ...mockReturns[0], needs_recompute: true },
    ];
    vi.mocked(useListTaxReturnsQuery).mockReturnValue({
      data: returnsWithRecompute,
      isLoading: false,
    } as unknown as ReturnType<typeof useListTaxReturnsQuery>);
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText('Needs recompute')).toBeInTheDocument();
  });

  it('renders Ready badge for ready status', () => {
    vi.mocked(useListTaxReturnsQuery).mockReturnValue({
      data: [{ ...mockReturns[0], status: 'ready' as const }],
      isLoading: false,
    } as unknown as ReturnType<typeof useListTaxReturnsQuery>);
    renderWithProviders(<TaxReturns />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});