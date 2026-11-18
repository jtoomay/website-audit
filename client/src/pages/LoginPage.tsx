import { useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { Logo } from '../components/Layout';

type Mode = 'password' | 'magic';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('password');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const isLocal = /127\.0\.0\.1|localhost/.test(import.meta.env.VITE_SUPABASE_URL ?? '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) throw error;
        setMessage({
          kind: 'info',
          text: isLocal
            ? 'Magic link sent. Running locally, so open the Mailpit inbox at http://127.0.0.1:54324 to click it.'
            : 'Check your inbox for a sign-in link.',
        });
      } else if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) setMessage({ kind: 'info', text: 'Account created. Check your email to confirm it.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/app` } });
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">{isSignUp && mode === 'password' ? 'Create your account' : 'Sign in'}</h1>
          <p className="mt-1 text-sm text-muted">Find out what any website is built with, then quote with confidence.</p>

          {!supabaseConfigured && (
            <p className="mt-4 rounded-lg bg-warn-soft p-3 text-xs text-warn">
              Supabase isn't configured. Run <code>npm run db:start</code> then <code>npm run db:env</code>, and restart{' '}
              <code>npm run dev</code>.
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 rounded-lg border border-line p-0.5 text-sm">
            {(['password', 'magic'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md py-1.5 ${mode === m ? 'bg-accent-soft font-medium text-accent' : 'text-muted'}`}
              >
                {m === 'password' ? 'Password' : 'Magic link'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <input className="input" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {mode === 'password' && (
              <input
                className="input"
                type="password"
                required
                minLength={6}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            )}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'magic' ? 'Email me a link' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          {import.meta.env.VITE_ENABLE_GOOGLE === 'true' && (
            <button className="btn-ghost mt-3 w-full" onClick={google}>
              Continue with Google
            </button>
          )}

          {message && (
            <p className={`mt-4 rounded-lg p-3 text-sm ${message.kind === 'error' ? 'bg-bad-soft text-bad' : 'bg-accent-soft text-accent'}`}>
              {message.text}
            </p>
          )}

          {mode === 'password' && (
            <p className="mt-4 text-center text-sm text-muted">
              {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
              <button className="font-medium text-accent hover:underline" onClick={() => setIsSignUp(!isSignUp)}>
                {isSignUp ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          )}
        </div>
        {isLocal && (
          <p className="mt-4 text-center text-xs text-muted">
            Local dev account: <code>demo@example.com</code> / <code>password123</code>
          </p>
        )}
      </div>
    </div>
  );
}
