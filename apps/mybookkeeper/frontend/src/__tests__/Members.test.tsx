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

vi.mock('@mybookkeeper/api-client/store/membersApi', () => ({
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

import { useListMembersQuery, useListInvitesQuery } from '@mybookkeeper/api-client/store/membersApi';
import { useActiveOrgId } from '@/shared/hooks/useCurrentOrg';
import { useIsOrgAdmin } from '@/shared/hooks/useOrgRole';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

// The RTK Query states this page reads. After an org switch `data` still holds the old
// org's list while `currentData` is undefined until the new one arrives.
const LOADED = { data: [], currentData: [], isLoading: false, isFetching: false };
const FIRST_LOAD = { data: undefined, currentData: undefined, isLoading: true, isFetching: true };
const REFETCHING = { data: [], currentData: [], isLoading: false, isFetching: true };
const SWITCHED_ORG = { data: [{ id: 'old-org-row' }], currentData: undefined, isLoading: false, isFetching: true };
// RTK Query keeps `error` from a failed load until a later load succeeds, retries included.
const FAILED = { data: undefined, currentData: undefined, isLoading: false, isFetching: false, isError: true, error: { status: 500 } };
const RETRYING = { data: undefined, currentData: undefined, isLoading: false, isFetching: true, isError: false, error: { status: 500 } };

function membersState(state: object) {
  vi.mocked(useListMembersQuery).mockReturnValue(state as unknown as ReturnType<typeof useListMembersQuery>);
}

function invitesState(state: object) {
  vi.mocked(useListInvitesQuery).mockReturnValue(state as unknown as ReturnType<typeof useListInvitesQuery>);
}
describe('Members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membersState(LOADED);
    invitesState(LOADED);
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

  it('shows skeleton on the first load of members', () => {
    membersState(FIRST_LOAD);
    renderWithProviders(<Members />);
    expect(screen.getByTestId('members-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Team members')).not.toBeInTheDocument();
  });

  it('shows skeleton for admin on the first load of invites', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    invitesState(FIRST_LOAD);
    renderWithProviders(<Members />);
    expect(screen.getByTestId('members-skeleton')).toBeInTheDocument();
  });

  it('ignores the invites load for a non-admin, who never fetches invites', () => {
    invitesState(FIRST_LOAD);
    renderWithProviders(<Members />);
    expect(screen.queryByTestId('members-skeleton')).not.toBeInTheDocument();
  });

  it('shows skeleton after an org switch instead of the old org\'s members', () => {
    membersState(SWITCHED_ORG);
    renderWithProviders(<Members />);
    expect(screen.getByTestId('members-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('member-list')).not.toBeInTheDocument();
  });

  it('shows skeleton for admin after an org switch instead of the old org\'s invites', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    invitesState(SWITCHED_ORG);
    renderWithProviders(<Members />);
    expect(screen.getByTestId('members-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-invites')).not.toBeInTheDocument();
  });

  it.each([
    ['failed', FAILED],
    ['is retrying', RETRYING],
  ])('shows the page, not the skeleton, when the members load %s, so the list can say so', (_, state) => {
    membersState(state);
    renderWithProviders(<Members />);
    expect(screen.queryByTestId('members-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-list')).toBeInTheDocument();
  });

  it.each([
    ['failed', FAILED],
    ['is retrying', RETRYING],
  ])('shows the page, not the skeleton, when the invites load %s, keeping the invite form', (_, state) => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    invitesState(state);
    renderWithProviders(<Members />);
    expect(screen.queryByTestId('members-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('pending-invites')).toBeInTheDocument();
    expect(screen.getByTestId('invite-form')).toBeInTheDocument();
  });

  it('keeps the same invite form while members and invites refetch in the background', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    const { rerender } = renderWithProviders(<Members />);
    const form = screen.getByTestId('invite-form');

    membersState(REFETCHING);
    invitesState(REFETCHING);
    rerender(
      <Provider store={store}>
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      </Provider>,
    );

    expect(screen.queryByTestId('members-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('invite-form')).toBe(form);
  });

  it('remounts the page content when the active org changes', () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(true);
    const { rerender } = renderWithProviders(<Members />);
    const form = screen.getByTestId('invite-form');

    vi.mocked(useActiveOrgId).mockReturnValue('org-2');
    rerender(
      <Provider store={store}>
        <BrowserRouter>
          <Members />
        </BrowserRouter>
      </Provider>,
    );

    expect(screen.getByTestId('invite-form')).not.toBe(form);
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