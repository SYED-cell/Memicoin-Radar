import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Spinner } from '../components/ui/LoadingState';
import { useAuth } from '../context/AuthContext';
import { AuthShell } from './AuthPage';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { verifyEmail, reload, status: authStatus } = useAuth();
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    verifyEmail(token)
      .then(async () => {
        setState('ok');
        await reload();
      })
      .catch((e: unknown) => {
        setState('error');
        setMessage(e instanceof Error ? e.message : 'Verification failed.');
      });
  }, [token, verifyEmail, reload]);

  return (
    <AuthShell title="Email verification">
      <div className="mt-6 flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
        {state === 'pending' && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Verifying your email…
          </p>
        )}
        {state === 'ok' && (
          <>
            <CheckCircle2 className="size-12 text-primary" />
            <p className="text-sm">Your email is verified. Paper trading and Telegram alerts are now enabled.</p>
            <Link to={authStatus === 'authenticated' ? '/dashboard' : '/login'} className="btn btn-primary w-full">
              {authStatus === 'authenticated' ? 'Open dashboard' : 'Sign in'}
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <XCircle className="size-12 text-danger" />
            <p className="text-sm text-muted">{message}</p>
            <p className="text-xs text-subtle">Links expire after 24 hours and work once. Sign in and use “Resend email” to get a new one.</p>
            <Link to="/login" className="btn btn-outline w-full">
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
