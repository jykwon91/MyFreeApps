import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import ForgotPassword from '@/app/pages/ForgotPassword';

vi.mock('@/shared/lib/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from '@/shared/lib/api';

function renderForgotPassword() {
  return render(
    <BrowserRouter>
      <ForgotPassword />
    </BrowserRouter>
  );
}

function emailInput(container: HTMLElement) {
  return container.querySelector('input[type="email"]') as HTMLElement;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ForgotPassword — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the email input', () => {
    const { container } = renderForgotPassword();

    expect(emailInput(container)).toBeInTheDocument();
  });

  it('renders the Send reset link button', () => {
    renderForgotPassword();

    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
  });

  it('renders a Back to sign in link pointing to /login', () => {
    renderForgotPassword();

    const link = screen.getByRole('link', { name: 'Back to sign in' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('does not show the success screen initially', () => {
    renderForgotPassword();

    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('does not show an error before any submission attempt', () => {
    renderForgotPassword();

    expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('ForgotPassword — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error when submitting with no email entered', async () => {
    const { container } = renderForgotPassword();
    // Remove HTML5 required to let JS validation fire
    const input = emailInput(container) as HTMLInputElement;
    input.removeAttribute('required');
    input.type = 'text';

    fireEvent.submit(container.querySelector('form')!);

    await screen.findByText('Email is required');
  });

  it('does not call the API when email is empty', async () => {
    const { container } = renderForgotPassword();
    const input = emailInput(container) as HTMLInputElement;
    input.removeAttribute('required');
    input.type = 'text';

    fireEvent.submit(container.querySelector('form')!);

    await screen.findByText('Email is required');
    expect(api.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Submit — happy path
// ---------------------------------------------------------------------------

describe('ForgotPassword — submit success', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the forgot-password endpoint with the provided email', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'user@example.com' });
    });
  });

  it('shows the success screen after a successful submission', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByText('Check your email');
  });

  it('includes the submitted email in the success message', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'janet@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByText('Check your email');
    expect(screen.getByText('janet@example.com')).toBeInTheDocument();
  });

  it('hides the form on the success screen', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByText('Check your email');
    expect(emailInput(container)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument();
  });

  it('shows a Back to sign in link on the success screen pointing to /login', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByText('Check your email');
    const link = screen.getByRole('link', { name: 'Back to sign in' });
    expect(link).toHaveAttribute('href', '/login');
  });
});

// ---------------------------------------------------------------------------
// API error suppression (email enumeration prevention)
// ---------------------------------------------------------------------------

describe('ForgotPassword — API error suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the success screen even when the API call throws', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Not found'));
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByText('Check your email');
  });

  it('does not display the API error message to prevent email enumeration', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('User not found'));
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'ghost@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByText('Check your email');
    expect(screen.queryByText('User not found')).not.toBeInTheDocument();
  });
});
