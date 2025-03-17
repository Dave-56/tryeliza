import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useQueryClient } from "@tanstack/react-query";

interface WebSocketContextType {
  isConnected: boolean;
  lastMessage: any;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [hasShownError, setHasShownError] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();
  const queryClient = useQueryClient();

  const setupWebSocket = useCallback(() => {
    if (!user) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    ws.onopen = () => {
      setIsConnected(true);
      if (hasShownError) {
        setHasShownError(false);
        toast({
          description: "Connection restored successfully",
          duration: 3000
        });
      }
      console.log('WebSocket connected');
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      setLastMessage(data);

      // Handle different types of messages
      switch (data.type) {
        case 'new_email':
          toast({
            title: "New Email",
            description: `New email received: ${data.data.subject}`,
          });
          await queryClient.invalidateQueries(['emails']);
          break;

        case 'emails_synced':
          toast({
            description: `Synced ${data.data.synced} new emails`,
          });
          await queryClient.invalidateQueries(['emails']);
          break;

        case 'sync_error':
          if (!hasShownError) {
            toast({
              variant: "destructive",
              description: data.error || "Failed to sync emails"
            });
          }
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected, attempting to reconnect...');
      setTimeout(setupWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (!hasShownError) {
        setHasShownError(true);
        toast({
          variant: "destructive",
          description: "Connection error. Attempting to reconnect..."
        });
      }
    };

    return () => {
      ws.close();
    };
  }, [toast, queryClient, user, hasShownError]);

  useEffect(() => {
    const cleanup = setupWebSocket();
    return () => {
      if (cleanup) cleanup();
    };
  }, [setupWebSocket]);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
