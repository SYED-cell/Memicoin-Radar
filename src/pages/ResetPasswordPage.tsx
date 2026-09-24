import { CheckCircle2, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/ui/LoadingState';
import { useAuth } from '../context/AuthContext';
import { cn } from '../utils/cn';
import { AuthShell, FieldWrap, StrengthMeter } from './AuthPage';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || !/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) return setError('Use at least 8 characters with letters and numbers.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="All other sessions will be signed out.">
      {done ? (
        <div className="mt-6 space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-12 text-primary" />
          <p className="text-sm">Password updated. Sign in with your new password.</p>
          <Link to="/login" className="btn btn-primary w-full">
            Sign in
          </Link>
        </div>
      ) : !token ? (
        <p className="mt-6 text-sm text-danger">This reset link is missing its token. Request a new one from the sign-in page.</p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <FieldWrap id="new-password" label="New password" icon={<Lock className="size-4" />}>
            <input id="new-password" type="password" autoComplete="new-password" className={cn('input pl-10', error && 'input-error')} value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
          </FieldWrap>
          <StrengthMeter password={password} />
          <FieldWrap id="confirm-password" label="Confirm password" icon={<Lock className="size-4" />}>
            <input id="confirm-password" type="password" autoComplete="new-password" className={cn('input pl-10', error && 'input-error')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </FieldWrap>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full py-3" disabled={busy}>
            {busy && <Spinner />} Update password
          </button>
        </form>
      )}
    </AuthShell>
  );
}
