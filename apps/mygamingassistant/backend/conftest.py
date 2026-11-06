"""Root-level conftest: ensures the monorepo's shared-backend source tree is on
sys.path BEFORE any test module or plugin loads it from the venv's editable
install.

This fixes a local-worktree issue: when the branch has changes to
packages/shared-backend that are not yet reflected in the main-repo venv (e.g.
a new function added in the same PR), the editable install still points at the
main-repo copy.  Inserting the local path first makes the working-tree version
win.

In CI the venv is built fresh from the branch, so the same path will already be
installed correctly and this insertion is harmless.
"""
import pathlib
import sys

_shared = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "packages" / "shared-backend"
if _shared.exists() and str(_shared) not in sys.path:
    sys.path.insert(0, str(_shared))
