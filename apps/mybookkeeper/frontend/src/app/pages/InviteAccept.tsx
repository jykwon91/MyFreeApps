import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAcceptInviteMutation, useGetInviteInfoQuery } from "@/shared/store/membersApi";
import { login, notifyAuthChange } from "@/shared/lib/auth";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Skeleton from "@/shared/components/ui/Skeleton";
import TurnstileWidget from "@/shared/components/ui/TurnstileWidget";
import api from "@/shared/lib/api";

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}


export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [acceptInvite] = useAcceptInviteMutation();

  const { data: inviteInfo, isLoading: infoLoading, error: infoError } = useGetInviteInfoQuery(
    token ?? "",
    { skip: !token },
  );

  // Login form state
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Register form state
  const [name, setName] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const handleTurnstileVerify = useCallback((t: string) => setTurnstileToken(t), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(""), []);

  const { user } = useCurrentUser();
  const authedEmail = user?.email ?? null;
  const isCorrectUser = authedEmail != null && inviteInfo != null && authedEmail.toLowerCase() === inviteInfo.email.toLowerCase();
  const isWrongUser = authedEmail != null && inviteInfo != null && authedEmail.toLowerCase() !== inviteInfo.email.toLowerCase();

  // Auto-accept when already authenticated as the correct user
  useEffect(() => {
    if (!token || !inviteInfo || inviteInfo.is_expired || !isCorrectUser) return;

    let cancelled = false;
    async function accept() {
      try {
        await acceptInvite(token!).unwrap();
        if (!cancelled) navigate("/", { replace: true });
      } catch {
        if (!cancelled) navigate("/", { replace: true });
      }
    }
    accept();
    return () => { cancelled = true; };
  }, [token, inviteInfo, isCorrectUser, acceptInvite, navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteInfo || !token) return;
    setLoginError("");
    setIsSubmitting(true);
    try {
      const result = await login(inviteInfo.email, password);
      if (result.detail === "totp_required") {
        setLoginError("This account has two-factor authentication. Please sign in from the login page.");
        setIsSubmitting(false);
        return;
      }
      await acceptInvite(token).unwrap();
      navigate("/", { replace: true });
    } catch (err) {
      setLoginError(extractErrorMessage(err) || "Invalid password");
      setIsSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteInfo || !token) return;
    setRegError("");

    if (regPassword.length < 12) {
      setRegError("Password must be at least 12 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/auth/register", {
        email: inviteInfo.email,
        password: regPassword,
        name: name.trim() || null,
      }, {
        headers: turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {},
      });
      await login(inviteInfo.email, regPassword);
      await acceptInvite(token).unwrap();
      navigate("/", { replace: true });
    } catch (err) {
      setRegError(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  // Loading state
  if (infoLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-full mt-2" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    );
  }

  // Error or not found
  if (infoError || !inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-xl font-semibold mb-2 text-destructive">Invite not found</h1>
          <p className="text-sm text-muted-foreground">
            This invite link is invalid or has already been used.
          </p>
        </div>
      </div>
    );
  }

  // Expired invite
  if (inviteInfo.is_expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-xl font-semibold mb-2 text-destructive">Invite expired</h1>
          <p className="text-sm text-muted-foreground">
            This invite has expired. Ask {inviteInfo.inviter_name} to send a new one.
          </p>
        </div>
      </div>
    );
  }

  const inviteHeader = (
    <div className="mb-6">
      <p className="text-sm text-muted-foreground mb-1">
        {inviteInfo.inviter_name} invited you to join
      </p>
      <h1 className="text-2xl font-semibold">{inviteInfo.org_name}</h1>
      <p className="text-sm text-muted-foreground mt-1">
        as <span className="font-medium text-foreground">{roleLabel(inviteInfo.org_role)}</span>
      </p>
    </div>
  );

  // Logged in as the correct user — show accepting state while useEffect auto-accepts
  if (isCorrectUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center space-y-3">
          <h1 className="text-lg font-semibold">Joining {inviteInfo!.org_name}...</h1>
          <Skeleton className="h-4 w-40 mx-auto" />
        </div>
      </div>
    );
  }

  // Logged in as a different user — offer to switch
  if (isWrongUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
          {inviteHeader}
          <p className="text-sm text-muted-foreground mb-4">
            You&apos;re signed in as <span className="font-medium text-foreground">{authedEmail}</span>, but this invite is for <span className="font-medium text-foreground">{inviteInfo!.email}</span>.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("token");
              notifyAuthChange();
              window.location.reload();
            }}
            className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            Sign out and continue as {inviteInfo!.email}
          </button>
        </div>
      </div>
    );
  }

  // Returning user — show login form
  if (inviteInfo.user_exists) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
          {inviteHeader}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={inviteInfo.email}
                disabled
                className="w-full border rounded-md px-3 py-2 text-sm bg-muted text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>
            {loginError ? <p className="text-destructive text-sm">{loginError}</p> : null}
            <LoadingButton type="submit" isLoading={isSubmitting} loadingText="Signing in..." className="w-full">
              Sign in &amp; join {inviteInfo.org_name}
            </LoadingButton>
          </form>
        </div>
      </div>
    );
  }

  // New user — show registration form
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
        {inviteHeader}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={inviteInfo.email}
              disabled
              className="w-full border rounded-md px-3 py-2 text-sm bg-muted text-muted-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
              minLength={12}
              disabled={isSubmitting}
            />
          </div>
          <TurnstileWidget onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} />
          {regError ? <p className="text-destructive text-sm">{regError}</p> : null}
          <LoadingButton type="submit" isLoading={isSubmitting} loadingText="Creating account..." className="w-full">
            Create account &amp; join {inviteInfo.org_name}
          </LoadingButton>
        </form>
      </div>
    </div>
  );
}
