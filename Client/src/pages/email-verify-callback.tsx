// src/pages/auth/callback.tsx
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handleEmailVerification = async () => {
      try {
        // Get the session to check if email is verified
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;

        if (session?.user?.email_confirmed_at) {
          // Get timezone from identity_data or fallback to browser timezone
          const userTimezone = session.user.identities?.[0]?.identity_data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
          
          console.log('Debug - User data:', {
            metadata: session.user.user_metadata,
            identityData: session.user.identities?.[0]?.identity_data,
            timezone: userTimezone,
            rawUser: session.user
          });
          
          // First check if user profile already exists
          const { data: existingUser } = await supabase
            .from('users')
            .select('id, timezone')
            .eq('id', session.user.id)
            .single();

          if (!existingUser) {
            // Create new user profile
            const { error: profileError } = await supabase
              .from('users')
              .insert({
                id: session.user.id,
                email: session.user.email,
                name: session.user.user_metadata.name,
                timezone: userTimezone,
                contextual_drafting_enabled: true,
                action_item_conversion_enabled: true,
                created_at: new Date().toISOString(),
              });

            if (profileError) {
              console.error('Error creating user profile:', profileError);
              setError("I couldn't complete your profile setup. Please contact support.");
              return;
            }
          } else if (existingUser.timezone === 'UTC' && userTimezone !== 'UTC') {
            // Update timezone if it's still UTC and we have a non-UTC value
            const { error: updateError } = await supabase
              .from('users')
              .update({ timezone: userTimezone })
              .eq('id', session.user.id);

            if (updateError) {
              console.error('Error updating timezone:', updateError);
            }
          }

          // Show welcome message
          toast({
            title: "Welcome to Eliza AI! 🎉",
            description: "Your account is now verified and ready to use. Let's get started!",
            duration: 5000,
          });

          // Redirect to home page
          setLocation('/');
        } else {
          setError("Please verify your email before continuing.");
        }
      } catch (error) {
        console.error('Verification error:', error);
        setError("I encountered an issue during verification. Please try again.");
      }
    };

    handleEmailVerification();
  }, [setLocation, toast]);

  return (
    <div className="container flex items-center justify-center min-h-screen py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Verifying Your Account</CardTitle>
          <CardDescription>
            {error ? (
              error
            ) : (
              "Just a moment while I verify your account..."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center p-6">
          {!error && <Loader2 className="h-6 w-6 animate-spin" />}
        </CardContent>
      </Card>
    </div>
  );
}