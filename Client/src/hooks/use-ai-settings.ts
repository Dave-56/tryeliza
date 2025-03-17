import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase-client'; // Your Supabase client
import { useUser } from '@/hooks/use-user';

export interface AISettings {
    action_item_detection: boolean;
    contextual_drafting: boolean;
    // email summarization: boolean
    // Add other AI features here
}

// Map between our frontend feature names and database column names
const featureToColumnMap: Record<keyof AISettings, string> = {
  action_item_detection: 'action_item_conversion_enabled',
  contextual_drafting: 'contextual_drafting_enabled'
};

// Hook to fetch AI settings
export function useAISettings() {
  const { user } = useUser();
  const { toast } = useToast();
  
  return useQuery<AISettings>({
    queryKey: ['ai-settings'],
    queryFn: async () => {
      // Fetch from Supabase users table
      const { data, error } = await supabase
        .from('users')
        .select('contextual_drafting_enabled, action_item_conversion_enabled')
        .eq('id', user?.id)
        .single();
        
      if (error) {
        throw error;
      }
      
      // Map database column names to our frontend feature names
      return {
        contextual_drafting: data?.contextual_drafting_enabled ?? false,
        action_item_detection: data?.action_item_conversion_enabled ?? false
      };
    },
    enabled: !!user,
    staleTime: 5000,
  });
}

// Hook to update AI settings
export function useUpdateAISettings() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { toast } = useToast();
  
  const mutation = useMutation({
    mutationFn: async ({ feature, enabled }: { feature: keyof AISettings, enabled: boolean }) => {
      // Get the corresponding database column name
      const columnName = featureToColumnMap[feature];
      
      // Update the specific column in the users table
      const { data, error } = await supabase
        .from('users')
        .update({ [columnName]: enabled })
        .eq('id', user?.id)
        .select()
        .single();
        
      if (error) {
        throw error;
      }
      
      return data;
    },
    onMutate: async ({ feature, enabled }) => {
      // Optimistic update logic
      await queryClient.cancelQueries({ queryKey: ['ai-settings'] });
      const previousValue = queryClient.getQueryData<AISettings>(['ai-settings']);

      if (previousValue) {
        queryClient.setQueryData<AISettings>(['ai-settings'], {
          ...previousValue,
          [feature]: enabled,
        });
      }

      return { previousValue };
    },
    onError: (err, variables, context: any) => {
      // Rollback on error
      if (context?.previousValue) {
        queryClient.setQueryData(['ai-settings'], context.previousValue);
      }
      toast({
        variant: "destructive",
        description: `Failed to update ${variables.feature.replace('_', ' ')} setting`,
      });
    },
    onSuccess: (_, variables) => {
      toast({
        description: `${variables.feature.replace('_', ' ')} setting updated successfully`,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
    },
  });
  
  // Return the mutation with a renamed isPending property for backward compatibility
  return {
    ...mutation,
    isLoading: mutation.isPending
  };
}