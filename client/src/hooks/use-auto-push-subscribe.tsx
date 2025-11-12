import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePushNotifications } from "./use-push-notifications";

export function useAutoPushSubscribe() {
  const { data: user } = useQuery({
    queryKey: ['/api/auth/me'],
    retry: false,
  });

  const {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    subscribe
  } = usePushNotifications();

  const subscribeAttemptedRef = useRef(false);
  const lastAttemptRef = useRef<number>(0);

  useEffect(() => {
    if (!user || !isSupported || isLoading || isSubscribed) {
      return;
    }

    if (permission === 'granted' && !isSubscribed && !subscribeAttemptedRef.current) {
      const now = Date.now();
      const timeSinceLastAttempt = now - lastAttemptRef.current;
      
      if (timeSinceLastAttempt < 60000) {
        console.log('[Push] Auto-subscribe rate limited - waiting 1 minute between attempts');
        return;
      }

      const attemptSubscribe = async () => {
        subscribeAttemptedRef.current = true;
        lastAttemptRef.current = Date.now();
        
        try {
          const success = await subscribe();
          if (!success) {
            subscribeAttemptedRef.current = false;
          }
        } catch (error) {
          console.log('[Push] Auto-subscribe to already-granted push notifications failed:', error);
          subscribeAttemptedRef.current = false;
        }
      };

      const timer = setTimeout(() => {
        attemptSubscribe();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [user, isSupported, isLoading, isSubscribed, permission, subscribe]);

  return {
    isSubscribed,
    permission,
    isSupported
  };
}
