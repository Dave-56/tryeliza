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
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        contextual_drafting_enabled: false,
        action_item_conversion_enabled: false,
      }
    }
  });
};

export const signOut = async () => {
  return await supabase.auth.signOut();
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
  return await supabase.auth.updateUser({
    data: metadata
  });
};