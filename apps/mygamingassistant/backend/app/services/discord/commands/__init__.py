"""Per-command handler modules for the MGA Discord bot.

  raid.py        → /raid        (everyone: ping, list, prefs)
  raid_admin.py  → /raid-admin  (organisers: setup, create, edit, cancel)

The dispatcher in app/services/discord/dispatcher.py maps command names
to their handler functions.
"""
