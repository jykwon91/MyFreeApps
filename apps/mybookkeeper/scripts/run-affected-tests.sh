#!/usr/bin/env bash
# run-affected-tests.sh — Run only tests affected by the current changes.
#
# Usage:
#   bash scripts/run-affected-tests.sh              # diff against main
#   bash scripts/run-affected-tests.sh HEAD~1        # diff against last commit
#   bash scripts/run-affected-tests.sh --full        # force full suite
#
# Exit code: 0 if all tests pass, 1 if any fail, 2 on script error.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_MAP="$SCRIPT_DIR/test-map.json"

# Convert to Windows path for Python on Windows (Git Bash uses /c/ paths)
if command -v cygpath &>/dev/null; then
  TEST_MAP_PY=$(cygpath -w "$TEST_MAP")
else
  TEST_MAP_PY="$TEST_MAP"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse args
DIFF_BASE="${1:-main}"
FORCE_FULL=false

if [[ "$DIFF_BASE" == "--full" ]]; then
  FORCE_FULL=true
fi

# Verify test map exists
if [[ ! -f "$TEST_MAP" ]]; then
  echo -e "${RED}Error: test-map.json not found at $TEST_MAP${NC}"
  exit 2
fi

# Get changed files
if [[ "$FORCE_FULL" == true ]]; then
  echo -e "${CYAN}=== Running FULL test suite (--full flag) ===${NC}"
else
  CHANGED_FILES=$(git diff --name-only "$DIFF_BASE" 2>/dev/null || git diff --name-only HEAD 2>/dev/null || echo "")

  # Also include unstaged and staged changes
  STAGED=$(git diff --name-only --cached 2>/dev/null || echo "")
  UNSTAGED=$(git diff --name-only 2>/dev/null || echo "")
  UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || echo "")

  ALL_CHANGED=$(echo -e "$CHANGED_FILES\n$STAGED\n$UNSTAGED\n$UNTRACKED" | sort -u | grep -v '^$' || true)

  # Filter out non-code files that don't affect tests
  ALL_CHANGED=$(echo "$ALL_CHANGED" | grep -v -E '^(CLAUDE\.md|README\.md|TECH_DEBT\.md|\.github/|scripts/|deploy/|docker/|\.claude/|\.gitignore)' || true)

  if [[ -z "$ALL_CHANGED" ]]; then
    echo -e "${GREEN}No testable code changes detected. Nothing to test.${NC}"
    exit 0
  fi

  echo -e "${CYAN}=== Changed files ===${NC}"
  echo "$ALL_CHANGED" | sed 's/^/  /'
  echo ""
fi

# Detect Python command — try python3 first, fall back to python, then check venv
if python3 --version &>/dev/null; then
  PYTHON_CMD="python3"
elif python --version &>/dev/null; then
  PYTHON_CMD="python"
elif [[ -f "$REPO_ROOT/backend/.venv/Scripts/python.exe" ]]; then
  PYTHON_CMD="$REPO_ROOT/backend/.venv/Scripts/python.exe"
elif [[ -f "$REPO_ROOT/backend/.venv/bin/python" ]]; then
  PYTHON_CMD="$REPO_ROOT/backend/.venv/bin/python"
else
  echo -e "${RED}Error: Python not found${NC}"
  exit 2
fi

# Check if any shared path was modified (triggers full suite)
check_shared_paths() {
  local shared_paths
  shared_paths=$($PYTHON_CMD -c "
import json, sys
with open(r'$TEST_MAP_PY') as f:
    data = json.load(f)
for p in data.get('shared_paths', []):
    print(p)
")

  while IFS= read -r changed_file; do
    while IFS= read -r shared_path; do
      if [[ "$changed_file" == "$shared_path"* ]] || [[ "$changed_file" == "$shared_path" ]]; then
        echo "$changed_file"
        return 0
      fi
    done <<< "$shared_paths"
  done <<< "$ALL_CHANGED"

  return 1
}

# Resolve affected tests from the domain map
resolve_affected_tests() {
  $PYTHON_CMD -c "
import json, sys

with open(r'$TEST_MAP_PY') as f:
    data = json.load(f)

changed_files = '''$ALL_CHANGED'''.strip().split('\n')
changed_files = [f for f in changed_files if f]

backend_tests = set()
frontend_tests = set()
e2e_specs = set()

for domain_name, domain in data.get('domains', {}).items():
    source_paths = domain.get('source_paths', [])
    matched = False

    for changed in changed_files:
        for src in source_paths:
            # Directory match (source_path ends with /)
            if src.endswith('/') and changed.startswith(src):
                matched = True
                break
            # Exact file match
            if changed == src:
                matched = True
                break
            # File within directory match
            if changed.startswith(src.rstrip('/') + '/'):
                matched = True
                break
        if matched:
            break

    if matched:
        backend_tests.update(domain.get('backend_tests', []))
        frontend_tests.update(domain.get('frontend_tests', []))
        e2e_specs.update(domain.get('e2e_specs', []))

# Output as newline-separated, prefixed by section
if backend_tests:
    print('BACKEND:' + ','.join(sorted(backend_tests)))
if frontend_tests:
    print('FRONTEND:' + ','.join(sorted(frontend_tests)))
if e2e_specs:
    print('E2E:' + ','.join(sorted(e2e_specs)))
if not backend_tests and not frontend_tests and not e2e_specs:
    print('NONE')
"
}

# Track overall result
OVERALL_EXIT=0

run_backend_tests() {
  local test_files="$1"
  echo -e "${CYAN}=== Backend tests ===${NC}"

  cd "$REPO_ROOT/backend"

  # Activate venv if it exists
  if [[ -f ".venv/Scripts/activate" ]]; then
    source .venv/Scripts/activate
  elif [[ -f ".venv/bin/activate" ]]; then
    source .venv/bin/activate
  fi

  if [[ "$test_files" == "ALL" ]]; then
    echo -e "  Running: ${YELLOW}all backend tests${NC}"
    if python -m pytest tests/ -v; then
      echo -e "  ${GREEN}Backend tests passed${NC}"
    else
      echo -e "  ${RED}Backend tests FAILED${NC}"
      OVERALL_EXIT=1
    fi
  else
    local pytest_args=""
    IFS=',' read -ra FILES <<< "$test_files"
    for f in "${FILES[@]}"; do
      pytest_args="$pytest_args tests/$f"
    done
    echo -e "  Running: ${YELLOW}${#FILES[@]} test file(s)${NC}"
    echo "$test_files" | tr ',' '\n' | sed 's/^/    /'

    if python -m pytest $pytest_args -v; then
      echo -e "  ${GREEN}Backend tests passed${NC}"
    else
      echo -e "  ${RED}Backend tests FAILED${NC}"
      OVERALL_EXIT=1
    fi
  fi
  echo ""
}

run_frontend_tests() {
  local test_files="$1"
  echo -e "${CYAN}=== Frontend unit tests ===${NC}"

  cd "$REPO_ROOT/frontend"
  if [[ "$test_files" == "ALL" ]]; then
    echo -e "  Running: ${YELLOW}all frontend unit tests${NC}"
    if npx vitest run; then
      echo -e "  ${GREEN}Frontend unit tests passed${NC}"
    else
      echo -e "  ${RED}Frontend unit tests FAILED${NC}"
      OVERALL_EXIT=1
    fi
  else
    # Use vitest with specific test file patterns
    local vitest_args=""
    IFS=',' read -ra FILES <<< "$test_files"
    for f in "${FILES[@]}"; do
      vitest_args="$vitest_args $f"
    done
    echo -e "  Running: ${YELLOW}${#FILES[@]} test file(s)${NC}"
    echo "$test_files" | tr ',' '\n' | sed 's/^/    /'

    if npx vitest run $vitest_args; then
      echo -e "  ${GREEN}Frontend unit tests passed${NC}"
    else
      echo -e "  ${RED}Frontend unit tests FAILED${NC}"
      OVERALL_EXIT=1
    fi
  fi
  cd "$REPO_ROOT"
  echo ""
}

run_e2e_tests() {
  local spec_files="$1"
  echo -e "${CYAN}=== E2E tests ===${NC}"

  cd "$REPO_ROOT/frontend"
  if [[ "$spec_files" == "ALL" ]]; then
    echo -e "  Running: ${YELLOW}all E2E tests${NC}"
    if npx playwright test; then
      echo -e "  ${GREEN}E2E tests passed${NC}"
    else
      echo -e "  ${RED}E2E tests FAILED${NC}"
      OVERALL_EXIT=1
    fi
  else
    local pw_args=""
    IFS=',' read -ra FILES <<< "$spec_files"
    for f in "${FILES[@]}"; do
      pw_args="$pw_args e2e/$f"
    done
    echo -e "  Running: ${YELLOW}${#FILES[@]} spec file(s)${NC}"
    echo "$spec_files" | tr ',' '\n' | sed 's/^/    /'

    if npx playwright test $pw_args; then
      echo -e "  ${GREEN}E2E tests passed${NC}"
    else
      echo -e "  ${RED}E2E tests FAILED${NC}"
      OVERALL_EXIT=1
    fi
  fi
  cd "$REPO_ROOT"
  echo ""
}

# Main logic
if [[ "$FORCE_FULL" == true ]]; then
  run_backend_tests "ALL"
  run_frontend_tests "ALL"
  run_e2e_tests "ALL"
else
  # Check for shared path changes
  SHARED_HIT=$(check_shared_paths || true)
  if [[ -n "$SHARED_HIT" ]]; then
    echo -e "${YELLOW}Shared infrastructure changed — running FULL test suite:${NC}"
    echo "$SHARED_HIT" | sed 's/^/  /'
    echo ""
    run_backend_tests "ALL"
    run_frontend_tests "ALL"
    run_e2e_tests "ALL"
  else
    # Resolve affected tests
    AFFECTED=$(resolve_affected_tests)

    if [[ "$AFFECTED" == "NONE" ]]; then
      echo -e "${YELLOW}Changed files don't match any domain in test-map.json.${NC}"
      echo -e "${YELLOW}Running full suite as fallback.${NC}"
      echo ""
      run_backend_tests "ALL"
      run_frontend_tests "ALL"
      run_e2e_tests "ALL"
    else
      echo -e "${CYAN}=== Affected tests ===${NC}"
      echo "$AFFECTED" | sed 's/^/  /'
      echo ""

      # Parse and run each layer
      BACKEND=$(echo "$AFFECTED" | grep '^BACKEND:' | sed 's/^BACKEND://' || true)
      FRONTEND=$(echo "$AFFECTED" | grep '^FRONTEND:' | sed 's/^FRONTEND://' || true)
      E2E=$(echo "$AFFECTED" | grep '^E2E:' | sed 's/^E2E://' || true)

      # Check if any changed files are backend files not in map — run all backend if so
      BACKEND_CHANGED=$(echo "$ALL_CHANGED" | grep '^backend/' || true)
      FRONTEND_CHANGED=$(echo "$ALL_CHANGED" | grep '^frontend/' || true)

      if [[ -n "$BACKEND_CHANGED" && -n "$BACKEND" ]]; then
        run_backend_tests "$BACKEND"
      elif [[ -n "$BACKEND_CHANGED" && -z "$BACKEND" ]]; then
        echo -e "${YELLOW}Backend files changed but no mapped tests — running all backend tests${NC}"
        run_backend_tests "ALL"
      fi

      if [[ -n "$FRONTEND_CHANGED" && -n "$FRONTEND" ]]; then
        run_frontend_tests "$FRONTEND"
      elif [[ -n "$FRONTEND_CHANGED" && -z "$FRONTEND" ]]; then
        echo -e "${YELLOW}Frontend files changed but no mapped unit tests — running all frontend tests${NC}"
        run_frontend_tests "ALL"
      fi

      if [[ -n "$E2E" ]]; then
        run_e2e_tests "$E2E"
      elif [[ -n "$FRONTEND_CHANGED" || -n "$BACKEND_CHANGED" ]]; then
        echo -e "${YELLOW}No E2E specs mapped for these changes — skipping E2E${NC}"
        echo ""
      fi
    fi
  fi
fi

# Summary
echo -e "${CYAN}=== Summary ===${NC}"
if [[ $OVERALL_EXIT -eq 0 ]]; then
  echo -e "  ${GREEN}All affected tests passed${NC}"
else
  echo -e "  ${RED}Some tests FAILED${NC}"
fi

exit $OVERALL_EXIT
