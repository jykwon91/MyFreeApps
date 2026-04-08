import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from '@/shared/store';
import Documents from '@/app/pages/Documents';
import type { Document } from '@/shared/types/document/document';

const mockDocuments: Document[] = [
  {
    id: 'doc-1',
    user_id: 'user-1',
    property_id: 'prop-1',
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:05:00Z',
    file_name: 'invoice_jan.pdf',
    file_type: 'pdf',
    document_type: 'invoice',
    file_mime_type: 'application/pdf',
    email_message_id: null,
    external_id: null,
    external_source: null,
    source: 'upload',
    status: 'completed',
    error_message: null,
    batch_id: null,
    is_escrow_paid: false,
    deleted_at: null,
  },
  {
    id: 'doc-2',
    user_id: 'user-1',
    property_id: null,
    created_at: '2025-02-01T09:00:00Z',
    updated_at: '2025-02-01T09:10:00Z',
    file_name: 'water_bill.pdf',
    file_type: 'pdf',
    document_type: 'utility_bill',
    file_mime_type: 'application/pdf',
    email_message_id: 'msg-123',
    external_id: null,
    external_source: null,
    source: 'email',
    status: 'failed',
    error_message: 'Could not parse document',
    batch_id: null,
    is_escrow_paid: false,
    deleted_at: null,
  },
];

const mockDeleteDocument = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
const mockBulkDelete = vi.fn(() => ({ unwrap: () => Promise.resolve({ deleted: 2 }) }));
const mockToggleEscrow = vi.fn(() => ({
  unwrap: () => Promise.resolve({ is_escrow_paid: true, transactions_removed: 0 }),
}));

vi.mock('@/shared/store/documentsApi', () => ({
  useGetDocumentsQuery: vi.fn(() => ({ data: mockDocuments, isLoading: false })),
  useDeleteDocumentMutation: vi.fn(() => [mockDeleteDocument, { isLoading: false }]),
  useBulkDeleteDocumentsMutation: vi.fn(() => [mockBulkDelete, { isLoading: false }]),
  useToggleEscrowPaidMutation: vi.fn(() => [mockToggleEscrow, { isLoading: false }]),
}));

vi.mock('@/shared/hooks/useDocumentColumns', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useDocumentColumns: vi.fn(({ onDelete }: { onDelete: (id: string) => void }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { createColumnHelper } = require('@tanstack/react-table') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const helper = createColumnHelper();
    return [
      helper.accessor('file_name', {
        id: 'file_name',
        header: 'File',
        enableColumnFilter: true,
        filterFn: 'includesString',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cell: ({ getValue }: any) => <span>{getValue() ?? '~'}</span>,
      }),
      helper.accessor('status', {
        id: 'status',
        header: 'Status',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cell: ({ getValue }: any) => <span>{getValue()}</span>,
      }),
      helper.display({
        id: 'actions',
        header: () => null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cell: ({ row }: any) => (
          <button onClick={() => onDelete(row.original.id)}>Delete</button>
        ),
      }),
    ];
  }),
}));

vi.mock('@/shared/hooks/useToast', () => ({
  useToast: vi.fn(() => ({ showError: vi.fn(), showSuccess: vi.fn() })),
}));

vi.mock('@/app/features/documents/DocumentUploadZone', () => ({
  default: () => <div data-testid='upload-zone'>Upload Zone</div>,
}));

vi.mock('@/app/features/documents/DocumentViewer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid='document-viewer'>
      <button onClick={onClose}>Close viewer</button>
    </div>
  ),
}));

vi.mock('@/shared/hooks/useOrgRole', () => ({
  useCanWrite: vi.fn(() => true),
}));

import { useGetDocumentsQuery } from '@/shared/store/documentsApi';
import { useCanWrite } from '@/shared/hooks/useOrgRole';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe('Documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('docs-info-dismissed');
    vi.mocked(useGetDocumentsQuery).mockReturnValue({
      data: mockDocuments,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetDocumentsQuery>);
    vi.mocked(useCanWrite).mockReturnValue(true);
  });

  afterEach(() => {
    localStorage.removeItem('docs-info-dismissed');
  });

  it('renders the Documents title', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('renders the upload zone', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByTestId('upload-zone')).toBeInTheDocument();
  });

  it('renders the file name search input', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByPlaceholderText('Search by file name...')).toBeInTheDocument();
  });

  it('renders document file names from API data', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText('invoice_jan.pdf')).toBeInTheDocument();
    expect(screen.getByText('water_bill.pdf')).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    vi.mocked(useGetDocumentsQuery).mockReturnValue({
      data: [],
      isLoading: true,
    } as unknown as ReturnType<typeof useGetDocumentsQuery>);
    const { container } = renderWithProviders(<Documents />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows info banner when not previously dismissed', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText("Upload your financial documents and I'll extract the data automatically.")).toBeInTheDocument();
  });

  it('hides info banner when already dismissed in localStorage', () => {
    localStorage.setItem('docs-info-dismissed', '1');
    renderWithProviders(<Documents />);
    expect(screen.queryByText("Upload your financial documents and I'll extract the data automatically.")).not.toBeInTheDocument();
  });

  it('dismisses info banner on Dismiss click and persists to localStorage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Documents />);
    expect(screen.getByText("Upload your financial documents and I'll extract the data automatically.")).toBeInTheDocument();
    const dismissButtons = screen.getAllByLabelText('Dismiss');
    await user.click(dismissButtons[0]);
    expect(screen.queryByText("Upload your financial documents and I'll extract the data automatically.")).not.toBeInTheDocument();
    expect(localStorage.getItem('docs-info-dismissed')).toBe('1');
  });

  it('shows warning banner when one document has failed status', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText(/I had trouble with water_bill.pdf/)).toBeInTheDocument();
  });

  it('shows count-based warning when multiple documents have failed', () => {
    const twoFailed: Document[] = [
      { ...mockDocuments[1], id: 'doc-3', file_name: 'doc_a.pdf' },
      { ...mockDocuments[1], id: 'doc-4', file_name: 'doc_b.pdf' },
    ];
    vi.mocked(useGetDocumentsQuery).mockReturnValue({
      data: twoFailed,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetDocumentsQuery>);
    renderWithProviders(<Documents />);
    expect(screen.getByText(/I had trouble with 2 documents/)).toBeInTheDocument();
  });

  it('does not show failed docs banner when no documents failed', () => {
    vi.mocked(useGetDocumentsQuery).mockReturnValue({
      data: [mockDocuments[0]],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetDocumentsQuery>);
    renderWithProviders(<Documents />);
    expect(screen.queryByText(/I had trouble with/)).not.toBeInTheDocument();
  });

  it('shows Show failed filter button inside the warning banner', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText('Show failed')).toBeInTheDocument();
  });

  it('opens confirm dialog with file name when Delete is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Documents />);
    const deleteButtons = screen.getAllByText('Delete');
    await user.click(deleteButtons[0]);
    expect(screen.getByText('Delete document')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete invoice_jan.pdf/)).toBeInTheDocument();
  });

  it('cancels single-document deletion when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Documents />);
    const deleteButtons = screen.getAllByText('Delete');
    await user.click(deleteButtons[0]);
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete document')).not.toBeInTheDocument();
  });

  it('does not show bulk action bar when nothing is selected', () => {
    renderWithProviders(<Documents />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('still renders search bar when no documents are returned', () => {
    vi.mocked(useGetDocumentsQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useGetDocumentsQuery>);
    renderWithProviders(<Documents />);
    expect(screen.getByPlaceholderText('Search by file name...')).toBeInTheDocument();
  });
});

describe('Documents — viewer role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('docs-info-dismissed');
    vi.mocked(useGetDocumentsQuery).mockReturnValue({
      data: mockDocuments,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetDocumentsQuery>);
    vi.mocked(useCanWrite).mockReturnValue(false);
  });

  afterEach(() => {
    localStorage.removeItem('docs-info-dismissed');
  });

  it('hides upload zone for viewer', () => {
    renderWithProviders(<Documents />);
    expect(screen.queryByTestId('upload-zone')).not.toBeInTheDocument();
  });

  it('still renders the document table for viewer', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByText('invoice_jan.pdf')).toBeInTheDocument();
  });

  it('still renders the search bar for viewer', () => {
    renderWithProviders(<Documents />);
    expect(screen.getByPlaceholderText('Search by file name...')).toBeInTheDocument();
  });
});
