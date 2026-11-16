import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
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

    expect(screen.queryByRole('heading', { name: 'Check your inbox' })).not.toBeInTheDocument();
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
      expect(api.post).toHaveBeenCalledWith(
        '/auth/forgot-password',
        { email: 'user@example.com' },
        expect.any(Object),
      );
    });
  });

  it('shows the success screen after a successful submission', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByRole('heading', { name: 'Check your inbox' });
  });

  it('includes the submitted email in the success message', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'janet@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByRole('heading', { name: 'Check your inbox' });
    expect(screen.getByText('janet@example.com')).toBeInTheDocument();
  });

  it('hides the form on the success screen', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByRole('heading', { name: 'Check your inbox' });
    expect(emailInput(container)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument();
  });

  it('shows a Back to sign in link on the success screen pointing to /login', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await screen.findByRole('heading', { name: 'Check your inbox' });
    const link = screen.getByRole('link', { name: 'Back to sign in' });
    expect(link).toHaveAttribute('href', '/login');
  });
});

// ---------------------------------------------------------------------------
// Failures — never claim an email was sent
// ---------------------------------------------------------------------------

function axiosFailure(status: number | null, data: unknown = ''): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  if (status === null) return new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
  return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_RESPONSE, config, undefined, {
    status, statusText: '', headers: {}, config, data,
  });
}

describe('ForgotPassword — API failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['a 500', axiosFailure(500), 'Something went wrong. Please try again.'],
    ['a network error', axiosFailure(null), 'Something went wrong. Please try again.'],
    ['a 429 rate limit', axiosFailure(429, { detail: 'Too many attempts' }), 'Too many attempts. Wait a few minutes and try again.'],
  ])('shows an error, not the success screen, on %s', async (_label, failure, message) => {
    vi.mocked(api.post).mockRejectedValue(failure);
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('heading', { name: 'Check your inbox' })).not.toBeInTheDocument();
    expect(emailInput(container)).toHaveValue('user@example.com');
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Turnstile CAPTCHA
// ---------------------------------------------------------------------------

describe('ForgotPassword — Turnstile', () => {
  const renderMock = vi.fn((_el: HTMLElement, _options: Record<string, unknown>) => 'widget-1');
  const resetMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key');
    window.turnstile = { render: renderMock, reset: resetMock, remove: vi.fn() };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
  });

  function solveCaptcha(token: string) {
    const options = renderMock.mock.calls[renderMock.mock.calls.length - 1][1];
    act(() => (options.callback as (t: string) => void)(token));
  }

  it('renders the Turnstile widget', () => {
    renderForgotPassword();
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('keeps Send reset link disabled until the captcha is solved', async () => {
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');

    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled();
  });

  it('sends X-Turnstile-Token header after widget verifies', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    solveCaptcha('test-token');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/auth/forgot-password',
        { email: 'user@example.com' },
        { headers: { 'X-Turnstile-Token': 'test-token' } },
      );
    });
  });

  it('re-challenges the captcha after a captcha refusal', async () => {
    vi.mocked(api.post).mockRejectedValue(axiosFailure(400, { detail: 'captcha_expired_please_retry' }));
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    solveCaptcha('test-token');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The captcha check expired. Please complete it again and retry.',
    );
    expect(resetMock).toHaveBeenCalledWith('widget-1');
    expect(screen.queryByRole('heading', { name: 'Check your inbox' })).not.toBeInTheDocument();
  });
});

describe('ForgotPassword — Turnstile off (no site key)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends empty headers object when there is no token', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderForgotPassword();

    await user.type(emailInput(container), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/auth/forgot-password',
        { email: 'user@example.com' },
        { headers: {} },
      );
    });
  });
});
