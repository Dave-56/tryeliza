import { BackendResponse, User, Integration } from '../types/model';
import { supabase } from './supabase-client';

class ApiClient {
  private static instance: ApiClient;
  private baseUrl: string = import.meta.env.VITE_BACKEND_URL || ''; // Use environment variable

  private constructor() {
    // No need to initialize tokens from localStorage anymore
    // Supabase handles token storage
  }

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  public async fetchWithAuth<T>(url: string, options: RequestInit = {}): Promise<BackendResponse<T>> {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');

    try {
      // Get session from Supabase - this is now the primary auth method
      const { data: sessionData } = await supabase.auth.getSession();

      if (sessionData?.session?.access_token) {
        // Use Supabase token if available
        headers.set('Authorization', `Bearer ${sessionData.session.access_token}`);
      }
    } catch (error) {
      // Silently handle auth session missing error
      console.log('No active Supabase session, proceeding without authentication token');
    }

    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        ...options,
        headers
      });

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      let data: BackendResponse<T>;
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Handle non-JSON responses (like text)
        const textResponse = await response.text();
        data = { 
          isSuccess: response.ok,
          error: response.ok ? undefined : textResponse
        } as BackendResponse<T>;
      }

      // Handle authentication errors
      if (response.status === 401) {
        console.log('Authentication failed. Redirecting to login...');
        // Let the app handle the redirect based on the error
        throw new Error('Your session has expired. Please log in again.');
      }

      if (!response.ok) {
        // Use the error message from the backend if available
        let errorMessage = data.error || response.statusText || 'An error occurred';
        
        // Provide more specific messages for common errors
        if (response.status === 403) {
          errorMessage = 'Access denied. Please log out and log in again to access this feature.';
        } else if (response.status === 404) {
          errorMessage = 'The requested resource was not found.';
        } else if (response.status >= 500) {
          errorMessage = 'A server error occurred. Please try again later.';
        }
        
        console.error('API error:', errorMessage);
        throw new Error(errorMessage);
      }

      return data;
    } catch (e) {
      console.error('Error in API request:', e);
      throw e;
    }
  }

  // USER ENDPOINTS
  async getUser(): Promise<BackendResponse<User>> {
    return this.fetchWithAuth<User>('/api/users/me');
  }

  async updateUserSettings(settings: { 
    contextual_drafting_enabled?: boolean; 
    action_item_conversion_enabled?: boolean;
  }): Promise<BackendResponse<User>> {
    return this.fetchWithAuth<User>('/api/users/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings)
    });
  }

  // EMAIL ACCOUNT ENDPOINTS
  async getEmailAccounts(): Promise<BackendResponse<Integration[]>> {
    return this.fetchWithAuth<Integration[]>('/api/users/email-accounts');
  }

  // Check if user is authenticated via Supabase
  isAuthenticated(): Promise<boolean> {
    return supabase.auth.getSession().then(({ data }) => {
      return !!data.session;
    });
  }
}

export const apiClient = ApiClient.getInstance();