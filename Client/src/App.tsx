import { useState, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Switch, Route, useLocation } from "wouter";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { NavBar } from "@/components/nav-bar";
import { Toaster } from "@/components/ui/toaster";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { Sidebar } from "@/components/sidebar";
import { SettingsPanel } from "@/components/settings-panel";
import { EmailDigest } from "@/components/email-digest";
import { EmailPulse } from "@/components/email-pulse";
import ResetPassword from "@/pages/reset-password";
import NotFound from "@/pages/not-found";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import AuthPage from "@/pages/auth-page";
import WorkflowPage from "@/pages/workflow"; 
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import VerifyEmail from "@/pages/verify-email";
import EmailVerifyCallback from "@/pages/email-verify-callback";
import { useSessionTimeout } from "@/hooks/use-session-timeout";

function Router() {
  const { user, isLoading } = useUser();
  const [activeTab, setActiveTab] = useState("inbox");
  const [location, setLocation] = useLocation();

  // Handle auth redirection
  useEffect(() => {
    if (!isLoading) {
      if (!user && location !== '/login' && location !== '/reset-password' && 
          location !== '/verify-email' && location !== '/email-verify-callback') {
        setLocation('/login');
      } else if (user && location === '/login') {
        setLocation('/');
      }
    }
  }, [user, isLoading, location, setLocation]);

  // Sync activeTab with current location
  useEffect(() => {
    if (location === '/' || location === '/email-digest') {
      setActiveTab('email-digest');
    } else if (location === '/workflow') {
      setActiveTab('workflow');
    } else if (location === '/analytics') {
      setActiveTab('analytics');
    } else if (location === '/settings' || location === '/auth/callback') {
      setActiveTab('settings');
    }
  }, [location]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  // Special routes that don't require authentication and don't show the app layout
  if (location === '/reset-password' || location === '/verify-email' || location === '/email-verify-callback') {
    if (location === '/reset-password') return <ResetPassword />;
    if (location === '/verify-email') return <VerifyEmail />;
    return <EmailVerifyCallback />;
  }

  // Show auth page for unauthenticated users
  if (!user) {
    return <AuthPage />;
  }

  // Protected routes for authenticated users
  return (
    <div className="flex h-screen">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-auto">
        <NavBar />
        <Switch>
          <Route path="/email-digest">
            <EmailPulse onTabChange={setActiveTab} />
          </Route>
          <Route path="/">
            <EmailPulse onTabChange={setActiveTab} />
          </Route>
          <Route path="/workflow">
            <WorkflowPage onTabChange={setActiveTab} />
          </Route>
          <Route path="/analytics">
            <AnalyticsPanel />
          </Route>
          <Route path="/settings">
            <SettingsPanel />
          </Route>
          <Route path="/auth/callback" component={SettingsPanel} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/login" component={AuthPage} />
          <Route path="/verify-email" component={VerifyEmail} />
          <Route path="/email-verify-callback" component={EmailVerifyCallback} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
          <Router />
          <Toaster />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App;