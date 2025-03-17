import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoginCredentials, SignupCredentials, User } from '../../../Backend/src/Types/model';
import { apiClient } from '../lib/api-client';
import { useLocation } from 'wouter';
import { getUser, signIn, signOut, signUp, supabase } from '../lib/supabase-client';
import { useToast } from './use-toast';

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
        .select('name, email, contextual_drafting_enabled, action_item_conversion_enabled')
        .eq('id', supabaseUser.id)
        .single();
      
      if (error) {
        console.error('Error fetching user data:', error);
      }
      
      // Map Supabase user to your User type, using data from users table when available
      return {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        // Prioritize name from the users table, fall back to metadata or email username
        name: userData?.name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || '',
        contextual_drafting_enabled: userData?.contextual_drafting_enabled || supabaseUser.user_metadata?.contextual_drafting_enabled || false,
        action_item_conversion_enabled: userData?.action_item_conversion_enabled || supabaseUser.user_metadata?.action_item_conversion_enabled || false,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes,
  });

  const loginMutation = useMutation<RequestResult, Error, LoginCredentials>({
    mutationFn: async (credentials) => {
      try {
        const { data, error } = await signIn(credentials.email, credentials.password);
        
        if (error) throw new Error(error.message);
        
        if (data.user) {
          queryClient.invalidateQueries({ queryKey: ['user'] });
          console.log("Login successful")
          setLocation('/');
          return { ok: true };
        }
        
        return { ok: false, message: 'Login failed' };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Login failed'
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

  const registerMutation = useMutation<RequestResult, Error, SignupCredentials>({
    mutationFn: async (credentials) => {
      try {
        const { data, error } = await signUp(
          credentials.email, 
          credentials.password,
          credentials.name
        );
        
        if (error) throw new Error(error.message);
        
        if (data.user) {
          queryClient.invalidateQueries({ queryKey: ['user'] });
          setLocation('/');
          return { ok: true };
        }
        
        return { ok: false, message: 'Registration failed' };
      } catch (error) {
        return { 
          ok: false, 
          message: error instanceof Error ? error.message : 'Registration failed' 
        };
      }
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
      
      // For Supabase, we need to use a backend endpoint to delete a user
      // as the admin APIs are not available in the client
      const response = await fetch('/api/user', {
        method: 'DELETE',
        credentials: 'include',
      });
  
      if (!response.ok) {
        if (response.status === 401) {
          toast({
            variant: "destructive",
            description: "Please log in to delete account",
          });
          setLocation('/login');
          return { success: false };
        }
        throw new Error('Failed to delete account');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      // Sign out the user after account deletion
      supabase.auth.signOut();
      
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
        description: "Failed to delete account",
      });
    },
  });

  return {
    deleteAccount: mutation.mutate,
    isDeleting: mutation.isPending
  };
}