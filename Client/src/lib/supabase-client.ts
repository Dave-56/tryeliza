import { createClient } from '@supabase/supabase-js';
import { useToast } from "@/hooks/use-toast";
import { useGmailIntegration } from "@/hooks/use-email";

// Initialize the Supabase client
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Store timezone in localStorage for use after redirect
export const TIMEZONE_KEY = 'user_timezone';

// Helper functions for auth
export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  return data.user;
};

export const signIn = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({ email, password });
};

export const signUp = async (email: string, password: string, name: string) => {
  // Get user's timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Use VITE_APP_URL for the redirect URL, fallback to localhost for development
  const redirectUrl = `${import.meta.env.VITE_APP_URL || 'http://localhost:3001'}/email-verify-callback`;

  console.log('Signing up user with:', { 
    email, 
    redirectUrl,
    timezone
  });

  try {
    // Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          contextual_drafting_enabled: true,
          action_item_conversion_enabled: true,
          timezone,
        },
        emailRedirectTo: redirectUrl
      }
    });

    if (authError) {
      // Check if user already exists
      if (authError.status === 400) {
        return { 
          data: null, 
          error: {
            name: "AuthError",
            message: "User already registered",
            status: 400
          }
        };
      }
      return { data: null, error: authError };
    }

    // Return the auth data without creating user profile
    // Profile creation will happen after email verification
    return { data: authData, error: null };
  } catch (error) {
    console.error('Signup error:', error);
    return { data: null, error: error instanceof Error ? error : new Error('An unexpected error occurred') };
  }
};

export const signOut = async () => {
  // Clear all local storage items set by Supabase
  const keys = ['supabase.auth.token', 'supabase.auth.refreshToken'];
  keys.forEach(key => localStorage.removeItem(key));
  
  // Sign out from Supabase
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  
  // Create a new Supabase client to ensure clean state
  const { createClient } = await import('@supabase/supabase-js');
  const newClient = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
  Object.assign(supabase, newClient);
};

// Function to delete user account
export const deleteAccount = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  try {
    // Get session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    // Call backend endpoint with full URL
    const apiUrl = `${import.meta.env.VITE_BACKEND_URL}/api/users/account`;
    const response = await fetch(apiUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      }
    });
  
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to delete account');
    }
  
    // Sign out locally after successful deletion
    await signOut();

    return { success: true, message: "Account deleted successfully"};
  } catch (error) {
    console.error('Account deletion error:', error);
    throw error;
  }
};

// Function to request a password reset
export const requestPasswordReset = async (email: string) => {
  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
};

// Function to update password after reset
export const updatePassword = async (newPassword: string) => {
  return await supabase.auth.updateUser({
    password: newPassword
  });
};

export const refreshSession = async () => {
  return await supabase.auth.refreshSession();
};

// Function to get current session
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return data.session;
};

// Function to update user data
export const updateUserMetadata = async (metadata: Record<string, any>) => {
  const { data, error } = await supabase.auth.updateUser({
    data: metadata
  });

  if (error) throw error;

  // If timezone is being updated, also update it in the users table
  if (metadata.timezone) {
    const { error: dbError } = await supabase
      .from('users')
      .update({ timezone: metadata.timezone })
      .eq('id', data.user.id);

    if (dbError) {
      console.error('Error updating user profile:', dbError);
      return { 
        data: null, 
        error: {
          name: "AuthError",
          message: "Failed to update user profile",
          status: 400,
          code: "42501"
        }
      };
    }
  }

  return { data, error };
};

// Function to sign in with Google
export const signInWithGoogle = async () => {
  // Store timezone before redirect
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  localStorage.setItem(TIMEZONE_KEY, userTimezone);
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      queryParams: {
        access_type: 'offline',
        prompt: 'consent select_account',  // Force consent screen and account selection
        scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      }
    }
  });

  if (error) {
    console.error('Google sign in error:', error);
    throw error;
  }

  // We'll update the user metadata in the auth callback component
  // since signInWithOAuth redirects to Google and doesn't return the user

  return { data, error };
};
