import { QueryClient } from "@tanstack/react-query";
import { apiClient } from "./api-client";

// Custom fetch function that handles token refresh
const customFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const res = await fetch(url, options);
    
    // If the response is 401 Unauthorized, try to refresh the token
    if (res.status === 401) {
      try {
        // Try to refresh the token
        const refreshResponse = await apiClient.refreshAuthToken();
        
        if (refreshResponse.data) {
          // If token was refreshed successfully, retry the original request with the new token
          const newOptions = { ...options };
          if (newOptions.headers && apiClient.getAccessToken()) {
            newOptions.headers = {
              ...newOptions.headers,
              'Authorization': apiClient.getAccessToken()!
            };
          }
          
          // Retry the original request with new token
          return fetch(url, newOptions);
        }
      } catch (error) {
        console.error("Token refresh failed:", error);
        // Let the original 401 response continue to be returned
      }
    }
    
    return res;
  } catch (error) {
    console.error("Request failed:", error);
    throw error;
  }
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await customFetch(queryKey[0] as string, {
          credentials: "include",
        });

        if (!res.ok) {
          if (res.status >= 500) {
            throw new Error(`${res.status}: ${res.statusText}`);
          }

          throw new Error(`${res.status}: ${await res.text()}`);
        }

        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    }
  },
});