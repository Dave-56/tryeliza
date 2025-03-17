// components/auth-callback-panel.tsx
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGmailIntegration } from '@/hooks/use-email';
import { Loader2 } from 'lucide-react';

export function AuthCallback() {
  const [_, navigate] = useLocation();
  const { mutate: connectGmail } = useGmailIntegration();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('Google OAuth error:', error);
      navigate('/settings');
      return;
    }

    if (code) {
      connectGmail(code, {
        onSuccess: () => {
          navigate('/settings');
        },
        onError: () => {
          navigate('/settings');
        }
      });
    } else {
      navigate('/settings');
    }
  }, []);

  return (
    <div className="container mx-auto max-w-7xl p-6 flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm text-muted-foreground">Connecting your Gmail account...</p>
      </div>
    </div>
  );
}