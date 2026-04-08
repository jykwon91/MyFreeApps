"""
Worker management CLI for MyBookkeeper.

Usage:
    python -m app.cli.workers status
    python -m app.cli.workers logs <worker> --tail 50
    python -m app.cli.workers restart <worker>
    python -m app.cli.workers restart-all
    python -m app.cli.workers queue-depth
"""
import argparse
import subprocess
import sys

WORKERS = {
    "api": "uvicorn",
    "email-sync": "dramatiq-worker",
    "scheduler": "dramatiq-scheduler",
    "upload-processor": "upload-processor",
}


def _run(cmd: str) -> str:
    """Run a shell command and return output."""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout.strip()


def _is_systemd() -> bool:
    """Check if we're on a system with systemd."""
    return subprocess.run("systemctl --version", shell=True, capture_output=True).returncode == 0


def cmd_status(args):
    """Show health status of all workers."""
    if not _is_systemd():
        # Local dev — check if processes are running
        print("Local development mode (no systemd)\n")
        for name, service in WORKERS.items():
            if service == "uvicorn":
                result = _run("curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/health 2>/dev/null")
                status = "running" if result == "200" else "not running"
            else:
                result = _run(f"pgrep -f '{service}' 2>/dev/null")
                status = "running" if result else "not running"
            print(f"  {name:<20} {status}")
        return

    print(f"{'Worker':<20} {'Status':<15} {'Active':<10} {'Last Error'}")
    print("-" * 80)
    for name, service in WORKERS.items():
        active = _run(f"systemctl is-active {service} 2>/dev/null") or "unknown"
        # Get last error from journal
        last_error = _run(
            f"journalctl -u {service} --no-pager -p err -n 1 --output=short-iso 2>/dev/null"
        )
        error_summary = last_error[:50] if last_error else "none"
        print(f"  {name:<20} {service:<15} {active:<10} {error_summary}")


def cmd_logs(args):
    """Show logs for a specific worker."""
    service = WORKERS.get(args.worker)
    if not service:
        print(f"Unknown worker: {args.worker}. Choose from: {', '.join(WORKERS.keys())}")
        sys.exit(1)

    if _is_systemd():
        subprocess.run(f"journalctl -u {service} -n {args.tail} --no-pager", shell=True)
    else:
        # Local dev — check common log locations
        log_file = f"/tmp/mybookkeeper-{service}.log"
        subprocess.run(f"tail -n {args.tail} {log_file} 2>/dev/null || echo 'No log file found at {log_file}'", shell=True)


def cmd_restart(args):
    """Restart a specific worker."""
    service = WORKERS.get(args.worker)
    if not service:
        print(f"Unknown worker: {args.worker}. Choose from: {', '.join(WORKERS.keys())}")
        sys.exit(1)

    if _is_systemd():
        subprocess.run(f"sudo systemctl restart {service}", shell=True)
        print(f"Restarted {args.worker} ({service})")
    else:
        print(f"Cannot restart {args.worker} — not running under systemd (local dev mode).")


def cmd_restart_all(args):
    """Restart all workers."""
    if not _is_systemd():
        print("Cannot restart workers — not running under systemd (local dev mode).")
        return
    for name, service in WORKERS.items():
        subprocess.run(f"sudo systemctl restart {service}", shell=True)
        print(f"Restarted {name} ({service})")


def cmd_queue_depth(args):
    """Show Dramatiq queue depth from PostgreSQL broker."""
    from sqlalchemy import text
    from app.cli.db import SyncSession

    with SyncSession() as session:
        try:
            rows = session.execute(text("""
                SELECT queue_name, COUNT(*) as pending
                FROM dramatiq_messages
                WHERE status = 'pending'
                GROUP BY queue_name
                ORDER BY pending DESC
            """)).fetchall()

            if not rows:
                print("Queue is empty — no pending messages.")
                return

            print(f"{'Queue':<30} {'Pending Messages'}")
            print("-" * 50)
            for r in rows:
                print(f"  {r[0]:<30} {r[1]}")
        except Exception as e:
            print(f"Could not query queue: {e}")
            print("(dramatiq_messages table may not exist if using a different broker)")


def main():
    parser = argparse.ArgumentParser(description="MyBookkeeper worker management CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("status", help="Show all worker health status")

    p = subparsers.add_parser("logs", help="Show logs for a worker")
    p.add_argument("worker", choices=list(WORKERS.keys()), help="Worker name")
    p.add_argument("--tail", type=int, default=50, help="Number of lines")

    p = subparsers.add_parser("restart", help="Restart a worker")
    p.add_argument("worker", choices=list(WORKERS.keys()), help="Worker name")

    subparsers.add_parser("restart-all", help="Restart all workers")
    subparsers.add_parser("queue-depth", help="Show Dramatiq queue depth")

    args = parser.parse_args()
    commands = {
        "status": cmd_status,
        "logs": cmd_logs,
        "restart": cmd_restart,
        "restart-all": cmd_restart_all,
        "queue-depth": cmd_queue_depth,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
