class SmsNotConfiguredError(RuntimeError):
    """SMS isn't set up for this deployment.

    ``platform_shared.core.boot_guards.check_sms_configured`` raises it at
    boot, so a misconfigured deploy fails loud instead of texts silently never
    arriving. That function's docstring lists the cases. A sender's
    ``send_or_raise`` raises it when its credentials or sending number are
    missing. Both raise this one class, so ``except SmsNotConfiguredError``
    catches either.
    """
