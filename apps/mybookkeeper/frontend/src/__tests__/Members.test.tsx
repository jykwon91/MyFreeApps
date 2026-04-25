import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from '@/shared/store';
import Members from '@/app/pages/Members';

// Stub sub-components that have their own API calls — tested in their own files
vi.mock('@/app/features/organizations/MemberList', () => ({
  default: () => <div data-testid='member-list'>MemberList</div>,
}));

vi.mock('@/app/features/organizations/InviteForm', () => ({
  default: () => <div data-testid='invite-form'>InviteForm</div>,
}));

vi.mock('@/app/features/organizations/PendingInvites', () => ({
  default: () => <div data-testid='pending-invites'>PendingInvites</div>,
}));

vi.mock('@/app/features/organizations/MembersSkeleton', () => ({
  default: () => <div data-testid='members-skeleton' className='animate-pulse'>MembersSkeleton</div>,
}));

vi.mock('@/shared/store/membersApi', () => ({
  useListMembersQuery: vi.fn(() => ({ isLoading: false, isFetching: false })),
  useListInvitesQuery: vi.fn(() => ({ isLoading: false, isFetching: false })),
}));

vi.mock('@/shared/hooks/useCurrentOrg', () => ({
  useActiveOrgId: vi.fn(() => 'org-1'),
}));

vi.mock('@/shared/hooks/useOrgRole', () => ({
  useIsOrgAdmin: vi.fn(() => false),
  useCanWrite: vi.fn(() => true),
}));

vi.mock('@/shared/hooks/useToast', () => ({
  useToast: vi.fn(() => ({ showError: vi.fn(), showSuccess: vi.fn() })),
}));

import { useListMembersQuery, useListInvitesQuery } from '@/shared/store/membersApi';
import { useActiveOrgId } from '@/shared/hooks/useCurrentOrg';
import { useIsOrgAdmin } from '@/shared/hooks/useOrgRole';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}
describe('Members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListMembersQuery).mockReturnValue({ isLoading: false, isFetching: false } as unknown as ReturnType<typeof useListMembersQuery>);
    vi.mocked(useListInvitesQuery).mockReturnValue({ isLoading: false, isFetching: false } as unknown as ReturnType<typeof useListInvitesQuery>);
    vi.mocked(useIsOrgAdmin).mockReturnValue(false);
    vi.mocked(useActiveOrgId).mockReturnValue('org-1');
  });

  it('renders the Members title', () => {
    renderWithProviders(<Members />);
    expect(screen.getByText('Members')).toBeInTheDocument();
  });

  it('renders the subtitle about managing access', () => {
    renderWithProviders(<Members />);
    expect(screen.getByText('Manage who has access to this organization')).toBeInTheDocument();
  });

  it('renders Team members card heading', () => {
    renderWithProviders(<Members />);
    expect(screen.getByText('Team members')).toBeInTheDocument();
  });

  it('renders MemberList component', () => {
    renderWithProviders(<Members />);
    expect(screen.getByTestId('member-list')).toBeInTheDocument();
  });

  it('does not render InviteForm for non-admin user', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(false);
    renderWithProviders(<Members />);
    expect(screen.queryByTestId('invite-form')).not.toBeInTheDocument();
  });

  it('does not render PendingInvites for non-admin user', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(false);
    renderWithProviders(<Members />);
    expect(screen.queryByTestId('pending-invites')).not.toBeInTheDocument();
  });

  it('does not render admin-only card headings for non-admin user', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(false);
    renderWithProviders(<Members />);
    expect(screen.queryByText('Invite a new member')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending invites')).not.toBeInTheDocument();
  });

  it('renders InviteForm for admin user', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    renderWithProviders(<Members />);
    expect(screen.getByTestId('invite-form')).toBeInTheDocument();
  });

  it('renders PendingInvites for admin user', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    renderWithProviders(<Members />);
    expect(screen.getByTestId('pending-invites')).toBeInTheDocument();
  });

  it('renders Invite a new member card heading for admin', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    renderWithProviders(<Members />);
    expect(screen.getByText('Invite a new member')).toBeInTheDocument();
  });

  it('renders Pending invites card heading for admin', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    renderWithProviders(<Members />);
    expect(screen.getByText('Pending invites')).toBeInTheDocument();
  });

  it('shows skeleton when members are loading', () => {
    vi.mocked(useListMembersQuery).mockReturnValue({ isLoading: true, isFetching: false } as unknown as ReturnType<typeof useListMembersQuery>);
    const { container } = renderWithProviders(<Members />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows skeleton when members are fetching', () => {
    vi.mocked(useListMembersQuery).mockReturnValue({ isLoading: false, isFetching: true } as unknown as ReturnType<typeof useListMembersQuery>);
    const { container } = renderWithProviders(<Members />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows skeleton for admin when invites are loading', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    vi.mocked(useListInvitesQuery).mockReturnValue({ isLoading: true, isFetching: false } as unknown as ReturnType<typeof useListInvitesQuery>);
    const { container } = renderWithProviders(<Members />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders main layout without skeleton when loaded', () => {
    renderWithProviders(<Members />);
    // The main layout card is visible, not the skeleton
    expect(screen.getByText('Team members')).toBeInTheDocument();
    expect(screen.queryByTestId('members-skeleton')).not.toBeInTheDocument();
  });

  it('renders without crashing when orgId is null', () => {
    vi.mocked(useActiveOrgId).mockReturnValue(null);
    renderWithProviders(<Members />);
    // Page should still render the layout without data
    expect(screen.getByText('Members')).toBeInTheDocument();
  });
});