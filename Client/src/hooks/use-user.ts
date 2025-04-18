import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoginCredentials, SignupCredentials, User } from '@/types/model';
import { useLocation } from 'wouter';
import { useToast } from './use-toast';
import { supabase, signIn, signUp, signOut, getUser, deleteAccount, TIMEZONE_KEY } from '@/lib/supabase-client';
import { AuthError } from '@supabase/supabase-js';
import { useEmailAccounts } from '@/hooks/use-email';
import { useSupabaseGoogleIntegration } from '@/hooks/use-supabase-google';
import { useEffect, useRef, useState } from 'react';

type RequestResult = {
  ok: true;
} | {
  ok: false;
  message: string;
};
// Using the proper User type from your model
type UserState = User | null;

export function useUser() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const supabaseGoogleIntegration = useSupabaseGoogleIntegration();
  const { data: emailAccounts, isLoading: isLoadingAccounts } = useEmailAccounts();
  // const integrationAttempted = useRef(false);

  // Handle Google integration when email accounts finish loading
  useEffect(() => {
    const setupGoogleIntegration = async () => {
      // if (integrationAttempted.current) return;
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        return;
      }

      // Return early if no session (user logged out)
      if (!session) {
        return;
      }

      const providerToken = session.provider_token;
      const providerRefreshToken = session.provider_refresh_token;
      const hasActiveGoogleAccount = emailAccounts?.find(account => account.provider === 'google')?.isActive ?? false;

      if (!isLoadingAccounts && 
          providerToken && 
          providerRefreshToken && 
          !hasActiveGoogleAccount) {
        try {
          // Update user metadata if needed for first-time Google sign-in
          const { user } = session;
          const identityData = user.identities?.[0]?.identity_data;
          console.log('Checking Google sign-in conditions:', {
            isGoogleProvider: user.app_metadata.provider === 'google',
            identityData,
            currentMetadata: user.user_metadata
          });
          if (user.app_metadata.provider === 'google' && providerToken) {
            if (!identityData?.email) {
              console.error('No identity data found for Google user');
              return;
            }

            try {
              // Use userinfo endpoint instead of People API
              const response = await fetch(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                {
                  headers: {
                    'Authorization': `Bearer ${providerToken}`
                  }
                }
              );
              
              const profile = await response.json();
              console.log('Google profile:', profile);
              
              const displayName = profile.name || identityData.email.split('@')[0];
              const storedTimezone = localStorage.getItem(TIMEZONE_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone;

              console.log("timezone", storedTimezone);
              
              await supabase.auth.updateUser({
                data: {
                  name: displayName,
                  timezone: storedTimezone,
                  contextual_drafting_enabled: true,
                  action_item_conversion_enabled: true
                }
              });
            } catch (error) {
              console.error('Error fetching Google profile:', error);
              // Fallback to email username if Google API fails
              const storedTimezone = localStorage.getItem(TIMEZONE_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone;
              await supabase.auth.updateUser({
                data: {
                  name: identityData.email.split('@')[0],
                  timezone: storedTimezone,
                  contextual_drafting_enabled: true,
                  action_item_conversion_enabled: true
                }
              });
            }
          }

          await supabaseGoogleIntegration.mutateAsync({
            accessToken: providerToken,
            refreshToken: providerRefreshToken
          });
          
          // Invalidate queries in sequence
          await queryClient.invalidateQueries({ queryKey: ['/api/users/email-accounts'] });
          await queryClient.invalidateQueries({ queryKey: ['daily-summaries'] });
          
          console.log('Gmail integration set up successfully');
          toast({
            description: "Gmail integration set up automatically! Please reload the page to see your summaries.",
          });
          
          // Invalidate queries in sequence
          await queryClient.invalidateQueries({ queryKey: ['daily-summaries'] });
        } catch (error) {
          console.error('Error setting up Gmail:', error);
          toast({
            variant: "destructive",
            description: "Failed to set up Gmail integration. You can try again in Settings.",
          });
        }
      }
    };

    setupGoogleIntegration();
  }, [isLoadingAccounts, emailAccounts]);

  const { data: user, isLoading } = useQuery<UserState>({
    queryKey: ['user'],
    queryFn: async () => {
      const session = await supabase.auth.getSession();
      console.log('Session:', session);
      if (!session.data.session) return null;

      const supabaseUser = await getUser();
      if (!supabaseUser) return null;

      // Now that we have a valid session, check for stored timezone
      const storedTimezone = localStorage.getItem(TIMEZONE_KEY);
      if (storedTimezone) {
        console.log('Found stored timezone:', storedTimezone);
        localStorage.removeItem(TIMEZONE_KEY);
      }
      
      // Fetch the user's data from the users table
      const { data: userData, error } = await supabase
        .from('users')
        .select('name, email, contextual_drafting_enabled, action_item_conversion_enabled, timezone, is_active, created_at')
        .eq('id', supabaseUser.id)
        .single();
      
      if (error) {
        console.error('Error fetching user data:', error);
        // If no user data found, return null to trigger re-authentication
        if (error.code === 'PGRST116') {
          console.log('User authenticated but profile not found in users table');
          await supabase.auth.signOut();
          return null;
        }
        throw error; // For other errors, throw to trigger error boundary
      }

      if (!userData) {
        console.error('No user data found after successful query');
        return null;
      }

      // If we have a stored timezone and it's different from the user's current timezone,
      // update it in the database
      if (storedTimezone && storedTimezone !== userData.timezone) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ timezone: storedTimezone })
          .eq('id', supabaseUser.id);

        if (updateError) {
          console.error('Error updating timezone:', updateError);
          toast({
            variant: "destructive",
            description: "Failed to update timezone. You can update it in Settings.",
          });
        } else {
          userData.timezone = storedTimezone;
          console.log('Updated timezone in database:', storedTimezone);
        }
      }

      // Map Supabase user to your User type, using data from users table
      return {
        id: supabaseUser.id,
        email: userData.email,
        name: userData.name,
        contextual_drafting_enabled: userData.contextual_drafting_enabled,
        action_item_conversion_enabled: userData.action_item_conversion_enabled,
        timezone: userData.timezone,
        is_active: userData.is_active,
        created_at: userData.created_at,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const loginMutation = useMutation<RequestResult, Error, LoginCredentials>({
    mutationFn: async (credentials) => {
      try {
        const { data, error } = await signIn(credentials.email, credentials.password);
        
        if (error) {
          // For security, Supabase returns 'Invalid login credentials' for both wrong password
          // and non-existent user. We'll check the error status to differentiate.
          if (error.status === 400 && error.message === 'Invalid login credentials') {
            return { ok: false, message: "The email or password you entered is incorrect. If you don\'t have an account, please sign up." };
          }
          
          if (error.message === 'Invalid login credentials') {
            return { ok: false, message: 'Incorrect password' };
          }
          
          if (error.message === 'Email not confirmed') {
            return { ok: false, message: 'Please verify your email address' };
          }
          
          // For session errors, ask user to try again
          if (error.message.includes('Auth session missing')) {
            return { ok: false, message: 'Session expired. Please try signing in again.' };
          }
          
          console.error('Unexpected auth error:', error);
          throw error;
        }
        
        if (data.user) {
          // Check if user profile exists in users table
          const { data: userData, error: profileError } = await supabase
            .from('users')
            .select('id')
            .eq('id', data.user.id)
            .single();
            
          if (profileError?.code === 'PGRST116' || !userData) {
            // This handles the case where the user authenticated successfully
            // but doesn't have a corresponding entry in your users table
            // Profile doesn't exist, sign out and ask to verify email
            await supabase.auth.signOut();
            return { 
              ok: false, 
              message: 'Your account requires additional setup. Please complete registration or contact support.' 
            };
          }
          
          queryClient.invalidateQueries({ queryKey: ['user'] });
          setLocation('/');
          return { ok: true };
        }
        
        return { ok: false, message: 'Unable to sign in' };
      } catch (error) {
        console.error('Login error:', error);
        return {
          ok: false,
          message: 'An unexpected error occurred. Please try again.'
        }
      }
    }
  });

  const logoutMutation = useMutation<void, Error>({
    mutationFn: async () => {
      try {
        await signOut();
      } catch (error) {
        console.error('Logout API error:', error);
        throw error;
      } 
    },
    onSuccess: () => {
      // Clear all queries from the cache on logout
      queryClient.clear();
      // Use replace to prevent back navigation to authenticated routes
      window.location.replace('/login');
    },
    onError: (error) => {
      console.error('Logout error:', error.message);
      const { toast } = useToast();
      toast({
        variant: "destructive",
        title: "Logout Failed",
        description: "Please try again"
      });
    }
  });

  const registerMutation = useMutation<void, AuthError | Error, SignupCredentials>({
    mutationFn: async (credentials) => {
      const { data, error } = await signUp(
        credentials.email, 
        credentials.password,
        credentials.name
      );
      
      // Pass through the Supabase error directly to maintain status codes and messages
      if (error) {
        if ('status' in error) {
          throw error; // This is a Supabase AuthError
        } else {
          // For other errors, wrap them to include status
          throw new Error(error.message || 'Registration failed');
        }
      }

      // Only proceed if we have a user
      if (!data?.user) {
        throw new Error('Registration failed. Please try again.');
      }

      // Success - update queries and redirect
      queryClient.invalidateQueries({ queryKey: ['user'] });
      setLocation('/verify-email');
    }
  });

  // Update user profile in Supabase
  const updateUserProfile = async (updatedUser: Partial<User>) => {
    if (!user) return;
    
    const { error } = await supabase.auth.updateUser({
      data: updatedUser
    });
    
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    }
  };

  return {
    user,
    isLoading,
    isIntegratingGoogle: supabaseGoogleIntegration.isPending,
    isGoogleSyncing: supabaseGoogleIntegration.isGoogleSyncing,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    updateUserProfile,
  };
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const { user } = useUser();

  const mutation = useMutation<{ success: boolean, message: string }, Error, void>({
    mutationFn: async () => {
      // Check if user is logged in
      if (!user || !user.id) {
        toast({
          variant: "destructive",
          description: "Please log in to delete account",
        });
        setLocation('/login');
        return { success: false, message: "Please log in to delete account" };
      }
      
      return await deleteAccount();
    },
    onSuccess: (data) => {
      toast({
        description: data.message || "Account deleted successfully",
      });
      
      // Clear local state
      queryClient.setQueryData(['user'], null);
      queryClient.invalidateQueries({ queryKey: ['user'] });
      
      // Add a small delay before redirect to allow toast to be shown
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    },
    onError: (error) => {
      console.error('Error deleting account:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete account",
      });
    },
  });

  return {
    deleteAccount: mutation.mutate,
    isDeleting: mutation.isPending
  };
}