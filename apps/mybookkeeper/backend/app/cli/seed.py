"""
Test data seeding CLI for MyBookkeeper.

Usage:
    python -m app.cli.seed create-test-user --role admin
    python -m app.cli.seed create-test-user --role user
    python -m app.cli.seed reset
"""
import argparse
import uuid

from sqlalchemy import text

from app.cli.db import SyncSession

_CLEANUP_TABLES = frozenset({"documents", "extractions", "transactions", "system_events"})


def cmd_create_test_user(args):
    """Create a test user with a given role."""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    user_id = uuid.uuid4()
    email = f"test-{args.role}-{str(user_id)[:8]}@test.local"
    hashed = pwd_context.hash("testpassword123")

    with SyncSession() as session:
        # Create org first
        org_id = uuid.uuid4()
        session.execute(text("""
            INSERT INTO organizations (id, name, created_by, created_at, updated_at)
            VALUES (:id, :name, :created_by, NOW(), NOW())
        """), {"id": str(org_id), "name": f"Test Org ({args.role})", "created_by": str(user_id)})

        # Create user
        session.execute(text("""
            INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, name, role, created_at, updated_at)
            VALUES (:id, :email, :hashed, true, :is_super, true, :name, :role, NOW(), NOW())
        """), {
            "id": str(user_id),
            "email": email,
            "hashed": hashed,
            "is_super": args.role == "admin",
            "name": f"Test {args.role.title()}",
            "role": args.role.upper(),
        })

        # Link user to org
        session.execute(text("""
            INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
            VALUES (:id, :org_id, :user_id, 'OWNER', NOW())
        """), {"id": str(uuid.uuid4()), "org_id": str(org_id), "user_id": str(user_id)})

        session.commit()
        print(f"Created test user:")
        print(f"  Email: {email}")
        print(f"  Password: testpassword123")
        print(f"  Role: {args.role.upper()}")
        print(f"  User ID: {user_id}")
        print(f"  Org ID: {org_id}")


def cmd_reset(args):
    """Delete all test data (users with @test.local email)."""
    with SyncSession() as session:
        # Find test user IDs
        test_users = session.execute(text(
            "SELECT id FROM users WHERE email LIKE '%@test.local'"
        )).fetchall()

        if not test_users:
            print("No test data found.")
            return

        user_ids = [str(r[0]) for r in test_users]
        print(f"Found {len(user_ids)} test users. Cleaning up...")

        for uid in user_ids:
            # Cascade delete related data
            for table in _CLEANUP_TABLES:
                session.execute(text("DELETE FROM " + table + " WHERE user_id = :uid"), {"uid": uid})
            session.execute(text("DELETE FROM organization_members WHERE user_id = :uid"), {"uid": uid})
            session.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})

        # Clean up orphaned test orgs
        session.execute(text("DELETE FROM organizations WHERE name LIKE 'Test Org%'"))

        session.commit()
        print(f"Cleaned up {len(user_ids)} test users and related data.")


def main():
    parser = argparse.ArgumentParser(description="MyBookkeeper test data seeding CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p = subparsers.add_parser("create-test-user", help="Create a test user")
    p.add_argument("--role", choices=["admin", "user"], default="user", help="User role")

    subparsers.add_parser("reset", help="Delete all test data (@test.local users)")

    args = parser.parse_args()
    commands = {
        "create-test-user": cmd_create_test_user,
        "reset": cmd_reset,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
