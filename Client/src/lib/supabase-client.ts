import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

  // Determine the redirect URL based on environment
  const redirectUrl = import.meta.env.DEV 
    ? 'http://localhost:3001/email-verify-callback'
    : 'https://app.tryeliza.ai/email-verify-callback';

  console.log('Signing up user with:', { 
    email, 
    redirectUrl,
    timezone,
    isDev: import.meta.env.DEV 
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
  return await supabase.auth.signOut();
};

// Function to delete user account
export const deleteAccount = async () => {
  // We need to make a backend call since Supabase user deletion requires admin privileges
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch('/api/users/account', {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Account deletion error:', error);
    throw new Error(error || 'Failed to delete account');
  }

  // Sign out the user after successful deletion
  await signOut();

  return { success: true };
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