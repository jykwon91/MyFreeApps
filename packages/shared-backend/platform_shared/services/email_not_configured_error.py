class EmailNotConfiguredError(RuntimeError):
    """Email can't be sent: an SMTP setting is empty, a login setting isn't
    ASCII, or email is set to the console backend outside development and test.

    ``platform_shared.core.boot_guards.check_email_configured`` raises it at
    boot for any of these, so a deploy fails loud instead of users seeing
    "registration succeeded but no email arrived". ``EmailService.send_or_raise``
    raises it on a send when an SMTP setting is empty or not ASCII, which that
    guard should have stopped. Both raise this one class, so
    ``except EmailNotConfiguredError`` catches either.
    """
