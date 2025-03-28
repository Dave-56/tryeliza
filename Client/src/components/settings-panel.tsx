import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Mail, Wand2, Loader2, Trash2, Archive, CheckSquare } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLocation } from "wouter";
import { useUser, useDeleteAccount } from "@/hooks/use-user";
import { useGmailIntegration, useEmailAccounts, useDisconnectGmail} from "@/hooks/use-email"
import { useAISettings, useUpdateAISettings, AISettings } from "@/hooks/use-ai-settings";

type SyncStatus = {
  connected: boolean;
};

interface GoogleAuthButtonProps {
  isConnected?: boolean;
}

const GoogleAuthButton = ({ isConnected }: GoogleAuthButtonProps) => {
  const [authError, setAuthError ] = useState('');
  const { mutate: connectGmail, isPending } = useGmailIntegration();
  const { mutate: disconnectGmail, isPending: isDisconnecting } = useDisconnectGmail();
  const { data: emailAccounts, isLoading: isLoadingAccounts } = useEmailAccounts();
  const activeAccount = emailAccounts?.find(account => account.isActive);
  const { toast } = useToast();

  useEffect(() => {
    // Check for error parameters in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    
    if (error) {
      setAuthError(errorDescription || 'Failed to authenticate with Google');
      toast({
        variant: "destructive",
        description: errorDescription || 'Failed to authenticate with Google'
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Handle the redirect from Google OAuth
  useEffect(() => {
    // Check if we have a code in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      connectGmail(code, {
        onSuccess: () => {
          // Clean up URL and reset error state
          setAuthError('');
          window.history.replaceState({}, document.title, window.location.pathname);
        },
        onError: (error) => {
          setAuthError(error.message);
          toast({
            variant: "destructive",
            description: `Failed to connect Gmail: ${error.message}`
          });
        }
      });
    }
  }, [connectGmail]);

  if (activeAccount) {
    return (
      <div className="flex flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-green-50 text-green-700">
              Active
          </span>
          {/* <p className="text-sm text-muted-foreground">
              {activeAccount.emailAddress}
          </p> */}
          <Button 
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => disconnectGmail(activeAccount.id)}
            disabled={isDisconnecting}
          >
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  const handleGoogleLogin = () => {
    // Redirect to Google OAuth
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
    const scope = import.meta.env.VITE_GOOGLE_OAUTH_SCOPE;
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    
    window.location.href = googleAuthUrl;
  };

  if (isLoadingAccounts) {
    return <Button disabled className="w-full sm:w-auto">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading...
    </Button>;
  }

  return (
    <button 
      onClick={handleGoogleLogin}
      disabled={isPending}
      className="flex items-center gap-4 rounded-lg border bg-white px-4 py-3 text-gray-700 hover:bg-gray-50"
    >
      {isPending ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Connecting...</span>
        </>
      ) : (
        <>
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span className="text-base">Add Google Account</span>
        </>
      )}
    </button>
  );
};

export function SettingsPanel() {
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();
  const { user, isLoading: isLoadingUser } = useUser();

  // Query Gmail connection status
  const { data: gmailStatus } = useQuery<SyncStatus>({
    queryKey: ['/api/gmail/status'],
    enabled: !!user, // Only run query if user is authenticated
  });

  // Query AI feature settings
  const { data: aiSettings, isLoading: isLoadingAISettings } = useAISettings();

  // Mutation for updating AI features
  const { mutate: updateAIFeature, isLoading: isUpdating } = useUpdateAISettings();
  
  // Get delete account function
  const { deleteAccount, isDeleting } = useDeleteAccount();

  const AIFeatureToggle = ({ 
    feature, 
    icon: Icon,
    title,
    description,
    defaultEnabled = false
  }: { 
    feature: keyof AISettings;
    icon: any;
    title: string;
    description: string;
    defaultEnabled?: boolean;
  }) => {
    // Use the provided default or false if not specified
    const isEnabled = aiSettings?.[feature] ?? defaultEnabled;
    
    return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span>{title}</span>
        </div>
        <Badge 
          className={isEnabled 
            ? "bg-green-100 text-green-800" 
            : "bg-gray-100 text-gray-800"
          }
        >
          {isEnabled ? 'enabled' : 'disabled'}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mt-2">
        {description}
      </p>
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-muted-foreground">
          {isEnabled ? 'Feature enabled' : 'Feature disabled'}
        </span>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${feature}-toggle`} className="text-sm">
            {isEnabled ? 'Enabled' : 'Disabled'}
          </Label>
          <Switch 
            id={`${feature}-toggle`}
            checked={isEnabled}
            onCheckedChange={(checked) => updateAIFeature({ feature, enabled: checked })}
            disabled={isLoadingAISettings || isUpdating}
          />
        </div>
      </div>
    </div>
  )};

  // Show loading state while checking auth
  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    setLocation('/login');
    return null;
  }

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      <div className="space-y-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Gmail Integration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Gmail Account Status</Label>
              </div>
              <GoogleAuthButton />
            </div>
          </CardContent>
        </Card>
        {/* AI Features Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              AI Features
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <AIFeatureToggle
              feature="contextual_drafting"
              icon={Wand2}
              title="Contextual Drafting"
              description="Let AI assist in drafting contextual responses"
            />

            <AIFeatureToggle
              feature="action_item_detection"
              icon={CheckSquare}
              title="Action Item Detection"
              description="Automatically convert action emails into actionable tasks"
              defaultEnabled={true}
            />
          </CardContent>
        </Card>

        {/* Delete Account Card */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Request account deletion. Our support team will process your request and remove all associated data.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full sm:w-auto">
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Account Deletion Request</AlertDialogTitle>
                    <AlertDialogDescription>
                      To delete your account, please send us an email request. Click the button below to compose an email to our support team.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        const email = "hello@tryeliza.ai";
                        const subject = "Account Deletion Request";
                        const body = "I would like to request the deletion of my Eliza AI account.\n\nBest regards";
                        window.open(
                          `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
                          '_blank'
                        );
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Send Email Request
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}