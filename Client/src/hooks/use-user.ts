import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoginCredentials, SignupCredentials, User } from '@/types/model';
import { useLocation } from 'wouter';
import { useToast } from './use-toast';
import { supabase, signIn, signUp, signOut, getUser, deleteAccount } from '@/lib/supabase-client';
import { AuthError } from '@supabase/supabase-js';

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

  const { data: user, isLoading } = useQuery<UserState>({
    queryKey: ['user'],
    queryFn: async () => {
      const supabaseUser = await getUser();
      if(!supabaseUser) return null;
      
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
          await supabase.auth.signOut(); // Sign out the user
          return null;
        }
        throw error; // For other errors, throw to trigger error boundary
      }

      if (!userData) {
        console.error('No user data found after successful query');
        return null;
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
    staleTime: 1000 * 60 * 5, // 5 minutes,
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
      console.log('Logout successful');
      queryClient.clear();
      setLocation('/login');
    },
    onError: (error) => {
      console.error('Logout error:', error.message);
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

  const mutation = useMutation<{ success: boolean }, Error, void>({
    mutationFn: async () => {
      // Check if user is logged in
      if (!user || !user.id) {
        toast({
          variant: "destructive",
          description: "Please log in to delete account",
        });
        setLocation('/login');
        return { success: false };
      }
      
      return await deleteAccount();
    },
    onSuccess: () => {
      toast({
        description: "Account deleted successfully",
      });
      
      // Clear local state
      queryClient.setQueryData(['user'], null);
      queryClient.invalidateQueries({ queryKey: ['user'] });
      
      // Redirect to home page
      window.location.href = '/';
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