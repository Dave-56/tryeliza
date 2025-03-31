import { useToast } from './use-toast';
import { useEffect, useRef } from 'react';
import { useUser } from '@/hooks/use-user';

const INACTIVE_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours
const WARNING_TIME = 5 * 60 * 1000; // 5 minutes

export function useSessionTimeout() {
  const { logout } = useUser();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout>();
  const warningRef = useRef<NodeJS.Timeout>();

  const resetTimeout = () => {
    // Clear existing timeouts
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Set warning timeout
    warningRef.current = setTimeout(() => {
      toast({
        description: "Your session will expire in 5 minutes due to inactivity. Click anywhere to stay logged in.",
      });
    }, INACTIVE_TIMEOUT - WARNING_TIME);

    // Set logout timeout
    timeoutRef.current = setTimeout(async () => {
      await logout();
      toast({
        description: "You've been logged out due to inactivity",
      });
      window.location.href = '/login';
    }, INACTIVE_TIMEOUT);
  };

  useEffect(() => {
    // Set up event listeners for user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'mousemove'];
    
    const handleActivity = () => {
      resetTimeout();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    // Initial timeout setup
    resetTimeout();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, []);
}