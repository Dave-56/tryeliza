import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { Integration } from '../types/model';
import { useRef } from 'react';
import { useToast } from './use-toast';

const MAX_SYNC_TIME = 1000 * 60 * 10; // 10 minutes

interface IntegrationResponse {
    data: Integration;
    isSuccess: boolean;  // This is what we should check
}

export const useSupabaseGoogleIntegration = () => {
    const syncStartTime = useRef<number | null>(null);
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: async (tokens: { accessToken: string; refreshToken: string }) => {
            console.log('Supabase Google integration tokens:', tokens);
            const response = await apiClient.fetchWithAuth<IntegrationResponse>('/api/email-accounts/supabase-google', {
                method: 'POST',
                body: JSON.stringify(tokens),
            });

            if (!response.data) {
                throw new Error('Invalid response format from server');
            }

            return response;
        },
        onMutate: () => {
            syncStartTime.current = null;
            console.log('Starting Google integration...');
        },
        onError: (error) => {
            syncStartTime.current = null;
            console.error('Google integration failed:', error);
        },
        onSuccess: () => {
            syncStartTime.current = Date.now();
            console.log('Google integration completed, starting sync...');
        }
    });

    // Check if sync is still in progress
    const isSyncing = mutation.isPending || (
        mutation.data !== undefined && !mutation.data.isSuccess
    );

    // Show timeout warning if we've exceeded the max sync time
    if (syncStartTime.current && Date.now() - syncStartTime.current >= MAX_SYNC_TIME) {
        console.warn('Gmail sync timeout exceeded');
        toast({
            variant: "destructive",
            title: "Gmail Sync Warning",
            description: "Gmail sync is taking longer than expected. You can refresh the page to check the status.",
        });
        syncStartTime.current = null; // Reset to prevent multiple toasts
    }

    return {
        ...mutation,
        isGoogleSyncing: isSyncing
    };
};