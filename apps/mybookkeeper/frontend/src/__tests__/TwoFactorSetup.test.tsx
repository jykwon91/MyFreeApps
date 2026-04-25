import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { store } from '@/shared/store';
import TwoFactorSetup from '@/app/features/security/TwoFactorSetup';

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <img data-testid="qr-code" alt={`QR code for ${value}`} />
  ),
}));

vi.mock('@/shared/lib/toast-store', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const mockSetupTotp = vi.fn();
const mockVerifyTotp = vi.fn();
const mockDisableTotp = vi.fn();

vi.mock('@/shared/store/totpApi', () => ({
  useGetTotpStatusQuery: vi.fn(),
  useSetupTotpMutation: vi.fn(() => [mockSetupTotp, { isLoading: false }]),
  useVerifyTotpMutation: vi.fn(() => [mockVerifyTotp, { isLoading: false }]),
  useDisableTotpMutation: vi.fn(() => [mockDisableTotp, { isLoading: false }]),
}));

import {
  useGetTotpStatusQuery,
  useSetupTotpMutation,
  useVerifyTotpMutation,
  useDisableTotpMutation,
} from '@/shared/store/totpApi';
import { showSuccess } from '@/shared/lib/toast-store';

function renderComponent() {
  return render(
    <Provider store={store}>
      <TwoFactorSetup />
    </Provider>,
  );
}

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

describe('TwoFactorSetup — initial load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton while status is loading', () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    const { container } = renderComponent();

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('Enable 2FA')).not.toBeInTheDocument();
  });

  it('shows Enable 2FA button when 2FA is disabled', () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    renderComponent();

    expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
  });

  it('shows Disable 2FA button when 2FA is already enabled', () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    renderComponent();

    expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
  });

  it('shows protected account message when 2FA is enabled', () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    renderComponent();

    expect(screen.getByText('Your account is protected with 2FA.')).toBeInTheDocument();
  });

  it('shows upsell message when 2FA is disabled', () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    renderComponent();

    expect(screen.getByText('Add an extra layer of security to your account.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Setup flow
// ---------------------------------------------------------------------------

describe('TwoFactorSetup — setup flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
  });

  it('clicking Enable 2FA calls the setup mutation', async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ secret: 'ABCDEF123456', provisioning_uri: 'otpauth://totp/test' }),
    });

    renderComponent();

    await user.click(screen.getByText('Enable 2FA'));

    expect(mockSetupTotp).toHaveBeenCalledWith();
  });

  it('shows QR code and secret after setup mutation succeeds', async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.resolve({
        secret: 'MYSECRET123',
        provisioning_uri: 'otpauth://totp/test?secret=MYSECRET123',
      }),
    });

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));

    await screen.findByTestId('qr-code');
    expect(screen.getByTestId('qr-code')).toBeInTheDocument();
    expect(screen.getByText('MYSECRET123')).toBeInTheDocument();
  });

  it('shows the 6-digit code input label after setup', async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ secret: 'ABCDEF', provisioning_uri: 'otpauth://totp/test' }),
    });

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));

    await screen.findByText('Enter the 6-digit code from your app');
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('stays on the status step when setup mutation fails', async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.reject(new Error('Setup failed, please try again')),
    });

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));

    await waitFor(() => {
      expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
    expect(screen.getByText('Setup failed, please try again')).toBeInTheDocument();
  });

  it('Cancel button from verify step returns to status view', async () => {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ secret: 'ABCDEF', provisioning_uri: 'otpauth://totp/test' }),
    });

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));
    await screen.findByText('Cancel');

    await user.click(screen.getByText('Cancel'));

    await screen.findByText('Enable 2FA');
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Code input constraints
// ---------------------------------------------------------------------------

describe('TwoFactorSetup — code input constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ secret: 'ABCDEF', provisioning_uri: 'otpauth://totp/test' }),
    });
  });

  it('only allows digits in the verify code input', async () => {
    const user = userEvent.setup();

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));
    await screen.findByPlaceholderText('000000');

    const input = screen.getByPlaceholderText('000000');
    await user.type(input, '12abc34');

    expect(input).toHaveValue('1234');
  });

  it('caps verify code input at 6 characters', async () => {
    const user = userEvent.setup();

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));
    await screen.findByPlaceholderText('000000');

    const input = screen.getByPlaceholderText('000000');
    await user.type(input, '12345678');

    expect(input).toHaveValue('123456');
  });

  it('Verify and Enable button is disabled until 6 digits are entered', async () => {
    const user = userEvent.setup();

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));
    await screen.findByText('Verify & Enable');

    const verifyButton = screen.getByText('Verify & Enable').closest('button')!;
    expect(verifyButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('000000'), '12345');
    expect(verifyButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('000000'), '6');
    expect(verifyButton).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Verify flow
// ---------------------------------------------------------------------------

describe('TwoFactorSetup — verify flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
  });

  async function advanceToVerifyStep() {
    const user = userEvent.setup();
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ secret: 'ABCDEF', provisioning_uri: 'otpauth://totp/test' }),
    });

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));
    await screen.findByPlaceholderText('000000');
    return user;
  }

  it('submits the typed code to the verify mutation', async () => {
    const user = await advanceToVerifyStep();
    mockVerifyTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ verified: true, recovery_codes: ['AAAA-BBBB', 'CCCC-DDDD'] }),
    });

    await user.type(screen.getByPlaceholderText('000000'), '654321');
    await user.click(screen.getByText('Verify & Enable'));

    await waitFor(() => {
      expect(mockVerifyTotp).toHaveBeenCalledWith({ code: '654321' });
    });
  });

  it('shows recovery codes after successful verification', async () => {
    const user = await advanceToVerifyStep();
    mockVerifyTotp.mockReturnValue({
      unwrap: () => Promise.resolve({
        verified: true,
        recovery_codes: ['AAAA-1111', 'BBBB-2222', 'CCCC-3333'],
      }),
    });

    await user.type(screen.getByPlaceholderText('000000'), '654321');
    await user.click(screen.getByText('Verify & Enable'));

    await screen.findByText('AAAA-1111');
    expect(screen.getByText('BBBB-2222')).toBeInTheDocument();
    expect(screen.getByText('CCCC-3333')).toBeInTheDocument();
  });

  it('fires success toast after 2FA is enabled', async () => {
    const user = await advanceToVerifyStep();
    mockVerifyTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ verified: true, recovery_codes: ['AAAA-1111'] }),
    });

    await user.type(screen.getByPlaceholderText('000000'), '654321');
    await user.click(screen.getByText('Verify & Enable'));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith('2FA enabled successfully');
    });
  });

  it('shows error message when verification code is wrong', async () => {
    const user = await advanceToVerifyStep();
    mockVerifyTotp.mockReturnValue({
      unwrap: () => Promise.reject(new Error('Invalid TOTP code')),
    });

    await user.type(screen.getByPlaceholderText('000000'), '000000');
    await user.click(screen.getByText('Verify & Enable'));

    await screen.findByText('Invalid TOTP code');
  });

  it('clears error when starting a new verify attempt', async () => {
    const user = await advanceToVerifyStep();
    mockVerifyTotp
      .mockReturnValueOnce({
        unwrap: () => Promise.reject(new Error('Invalid TOTP code')),
      })
      .mockReturnValueOnce({
        unwrap: () => Promise.resolve({ verified: true, recovery_codes: ['AAAA-1111'] }),
      });

    const input = screen.getByPlaceholderText('000000');

    await user.type(input, '000000');
    await user.click(screen.getByText('Verify & Enable'));
    await screen.findByText('Invalid TOTP code');

    await user.clear(input);
    await user.type(input, '111111');
    await user.click(screen.getByText('Verify & Enable'));

    await waitFor(() => {
      expect(screen.queryByText('Invalid TOTP code')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Recovery codes display
// ---------------------------------------------------------------------------

describe('TwoFactorSetup — recovery codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function advanceToRecoveryStep() {
    const user = userEvent.setup();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ secret: 'ABCDEF', provisioning_uri: 'otpauth://totp/test' }),
    });
    mockVerifyTotp.mockReturnValue({
      unwrap: () => Promise.resolve({
        verified: true,
        recovery_codes: ['CODE-0001', 'CODE-0002', 'CODE-0003', 'CODE-0004'],
      }),
    });

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));
    await screen.findByPlaceholderText('000000');
    await user.type(screen.getByPlaceholderText('000000'), '123456');
    await user.click(screen.getByText('Verify & Enable'));
    await screen.findByText('CODE-0001');
    return user;
  }

  it('displays all recovery codes', async () => {
    await advanceToRecoveryStep();

    expect(screen.getByText('CODE-0001')).toBeInTheDocument();
    expect(screen.getByText('CODE-0002')).toBeInTheDocument();
    expect(screen.getByText('CODE-0003')).toBeInTheDocument();
    expect(screen.getByText('CODE-0004')).toBeInTheDocument();
  });

  it('shows save your recovery codes prompt', async () => {
    await advanceToRecoveryStep();

    expect(screen.getByText('Save your recovery codes')).toBeInTheDocument();
  });

  it('copy button writes all recovery codes to clipboard joined by newlines', async () => {
    const user = await advanceToRecoveryStep();
    const clipboardSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    await user.click(screen.getByText('Copy all codes'));

    expect(clipboardSpy).toHaveBeenCalledWith(
      'CODE-0001\nCODE-0002\nCODE-0003\nCODE-0004'
    );

    clipboardSpy.mockRestore();
  });

  it('copy button label changes to Copied after clicking', async () => {
    const user = await advanceToRecoveryStep();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await user.click(screen.getByText('Copy all codes'));

    expect(screen.getByText('Copied!')).toBeInTheDocument();
    expect(screen.queryByText('Copy all codes')).not.toBeInTheDocument();
  });

  it('clicking I have saved my codes returns to status view with 2FA enabled', async () => {
    const user = await advanceToRecoveryStep();

    // After recovery, status query should reflect enabled=true. Re-mock it.
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);

    await user.click(screen.getByText("I've saved my codes"));

    expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
    expect(screen.queryByText('CODE-0001')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Disable flow
// ---------------------------------------------------------------------------

describe('TwoFactorSetup — disable flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
  });

  it('clicking Disable 2FA shows authenticator code input', async () => {
    const user = userEvent.setup();

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    expect(
      screen.getByText(
        'Enter a code from your authenticator app to disable 2FA.'
      )
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
  });

  it('only allows digits in the disable code input', async () => {
    const user = userEvent.setup();

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    const input = screen.getByPlaceholderText('000000');
    await user.type(input, 'abc123def');

    expect(input).toHaveValue('123');
  });

  it('caps disable code input at 6 characters', async () => {
    const user = userEvent.setup();

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    const input = screen.getByPlaceholderText('000000');
    await user.type(input, '1234567890');

    expect(input).toHaveValue('123456');
  });

  it('Disable 2FA confirm button is disabled until 6 digits are entered', async () => {
    const user = userEvent.setup();

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    const allButtons = screen.getAllByRole('button', { name: /Disable 2FA/i });
    const confirmButton = allButtons[allButtons.length - 1];
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('000000'), '12345');
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText('000000'), '6');
    expect(confirmButton).not.toBeDisabled();
  });

  it('submits the typed code to the disable mutation', async () => {
    const user = userEvent.setup();
    mockDisableTotp.mockReturnValue({ unwrap: () => Promise.resolve() });

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    await user.type(screen.getByPlaceholderText('000000'), '654321');
    const allButtons = screen.getAllByRole('button', { name: /Disable 2FA/i });
    await user.click(allButtons[allButtons.length - 1]);

    await waitFor(() => {
      expect(mockDisableTotp).toHaveBeenCalledWith({ code: '654321' });
    });
  });

  it('returns to status view after successful disable (disable form disappears)', async () => {
    const user = userEvent.setup();
    mockDisableTotp.mockReturnValue({ unwrap: () => Promise.resolve() });

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    await user.type(screen.getByPlaceholderText('000000'), '654321');
    const allButtons = screen.getAllByRole('button', { name: /Disable 2FA/i });
    await user.click(allButtons[allButtons.length - 1]);

    // The disable step exits (step returns to "status") — the code input is gone
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
    });
    // The status description text confirms we're back on the status step
    expect(screen.queryByText('Enter a code from your authenticator app to disable 2FA.')).not.toBeInTheDocument();
  });

  it('fires success toast after disabling 2FA', async () => {
    const user = userEvent.setup();
    mockDisableTotp.mockReturnValue({ unwrap: () => Promise.resolve() });

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    await user.type(screen.getByPlaceholderText('000000'), '654321');
    const allButtons = screen.getAllByRole('button', { name: /Disable 2FA/i });
    await user.click(allButtons[allButtons.length - 1]);

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith('2FA has been disabled');
    });
  });

  it('shows error message when disable code is invalid', async () => {
    const user = userEvent.setup();
    mockDisableTotp.mockReturnValue({
      unwrap: () => Promise.reject(new Error('Invalid code')),
    });

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    await user.type(screen.getByPlaceholderText('000000'), '000000');
    const allButtons = screen.getAllByRole('button', { name: /Disable 2FA/i });
    await user.click(allButtons[allButtons.length - 1]);

    await screen.findByText('Invalid code');
  });

  it('Cancel button from disable step returns to status view without disabling', async () => {
    const user = userEvent.setup();

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));
    await screen.findByText('Cancel');

    await user.click(screen.getByText('Cancel'));

    await screen.findByText('Disable 2FA');
    expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument();
  });

  it('canceling disable clears the error from a previous failed attempt', async () => {
    const user = userEvent.setup();
    mockDisableTotp.mockReturnValue({
      unwrap: () => Promise.reject(new Error('Invalid code')),
    });

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    await user.type(screen.getByPlaceholderText('000000'), '000000');
    const allButtons = screen.getAllByRole('button', { name: /Disable 2FA/i });
    await user.click(allButtons[allButtons.length - 1]);
    await screen.findByText('Invalid code');

    await user.click(screen.getByText('Cancel'));
    await screen.findByText('Disable 2FA');

    await user.click(screen.getByText('Disable 2FA'));

    expect(screen.queryByText('Invalid code')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// useSetupTotpMutation / useVerifyTotpMutation / useDisableTotpMutation loading states
// ---------------------------------------------------------------------------

describe('TwoFactorSetup — mutation loading states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Setting up... on the button while setup mutation is in flight', () => {
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
    vi.mocked(useSetupTotpMutation).mockReturnValue([mockSetupTotp, { isLoading: true }] as unknown as ReturnType<typeof useSetupTotpMutation>);

    renderComponent();

    expect(screen.getByText('Setting up...')).toBeInTheDocument();
  });

  it('shows Verifying... on the button while verify mutation is in flight', async () => {
    const user = userEvent.setup();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: false },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
    // Ensure setup mutation is NOT in-flight so "Enable 2FA" is clickable
    vi.mocked(useSetupTotpMutation).mockReturnValue(
      [mockSetupTotp, { isLoading: false }] as unknown as ReturnType<typeof useSetupTotpMutation>,
    );
    // Setup resolves immediately to advance to verify step
    mockSetupTotp.mockReturnValue({
      unwrap: () => Promise.resolve({ secret: 'ABCDEF', provisioning_uri: 'otpauth://totp/test' }),
    });
    // Verify mutation is in-flight (never resolves)
    vi.mocked(useVerifyTotpMutation).mockReturnValue(
      [mockVerifyTotp, { isLoading: true }] as unknown as ReturnType<typeof useVerifyTotpMutation>,
    );

    renderComponent();
    await user.click(screen.getByText('Enable 2FA'));
    // Once on the verify step, the button shows the loading text from isVerifying=true
    await screen.findByText('Verifying...');
  });

  it('shows Disabling... on the button while disable mutation is in flight', async () => {
    const user = userEvent.setup();
    vi.mocked(useGetTotpStatusQuery).mockReturnValue({
      data: { enabled: true },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetTotpStatusQuery>);
    vi.mocked(useDisableTotpMutation).mockReturnValue([mockDisableTotp, { isLoading: true }] as unknown as ReturnType<typeof useDisableTotpMutation>);

    renderComponent();
    await user.click(screen.getByText('Disable 2FA'));

    expect(screen.getByText('Disabling...')).toBeInTheDocument();
  });
});
