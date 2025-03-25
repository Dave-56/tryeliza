// import { useEffect } from 'react';
// import { useToast } from "@/hooks/use-toast";
// import { useGmailIntegration } from "@/hooks/use-email";
// import { AUTH_STATE_CHANGE } from '@/lib/supabase-client';

// // Define the shape of our custom event detail
// interface AuthStateChangeDetail {
//   event: 'PROFILE_ERROR' | 'NEW_USER_SIGNED_IN';
//   session: {
//     authCode?: string;
//     error?: any;
//   };
// }

// // Extend the Window interface to include our custom event
// declare global {
//   interface WindowEventMap {
//     [AUTH_STATE_CHANGE]: CustomEvent<AuthStateChangeDetail>;
//   }
// }

// export function AuthStateHandler() {
//   const { toast } = useToast();
//   const gmailIntegration = useGmailIntegration();

//   useEffect(() => {
//     const handleAuthStateChange = async (event: CustomEvent<AuthStateChangeDetail>) => {
//       const { event: authEvent, session } = event.detail;

//       if (authEvent === 'PROFILE_ERROR') {
//         toast({
//           variant: "destructive",
//           title: "Error",
//           description: "Failed to create your profile. Please try again.",
//         });
//         return;
//       }

//       if (authEvent === 'NEW_USER_SIGNED_IN') {
//         const { authCode } = session;
        
//         if (authCode) {
//           try {
//             await gmailIntegration.mutateAsync(authCode);
//             toast({
//               title: "Welcome to Eliza AI! 🎉",
//               description: "Your Google account has been successfully connected. Ready to explore?",
//               duration: 5000,
//             });
//           } catch (error) {
//             console.error('Error integrating Gmail:', error);
//             toast({
//               variant: "destructive",
//               title: "Gmail Integration Failed",
//               description: "We couldn't connect your Gmail account. You can try again in Settings.",
//               duration: 5000,
//             });
//           }
//         }
//       }
//     };

//     window.addEventListener(AUTH_STATE_CHANGE, handleAuthStateChange);
//     return () => {
//       window.removeEventListener(AUTH_STATE_CHANGE, handleAuthStateChange);
//     };
//   }, [toast, gmailIntegration]);

//   return null; // This component doesn't render anything
// }