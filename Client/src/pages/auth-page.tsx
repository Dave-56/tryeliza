import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import { requestPasswordReset } from "@/lib/supabase-client";

// Schema definitions remain unchanged
const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type Mode = "login" | "register" | "reset";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useUser();
  const { toast } = useToast();

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const resetForm = useForm({
    resolver: zodResolver(z.object({
      email: z.string().email("Invalid email format"),
    })),
    defaultValues: {
      email: "",
    },
  });

  const onLogin = async (data: z.infer<typeof loginSchema>) => {
    try {
      setIsLoading(true);
      const result = await login(data);
      if (!result.ok) {
        loginForm.setValue('password', '');
        
        // Check for specific error messages and provide friendly responses
        if (result.message.includes('Account not found')) {
          toast({
            title: "Welcome to Eliza AI",
            description: "I couldn't find an account with that email. Would you like to create one?",
            variant: "default",
            action: (
              <Button
                variant="secondary"
                size="sm"
                className="bg-white text-primary hover:bg-gray-100"
                onClick={() => setMode("register")}
              >
                Create Account
              </Button>
            ),
          });
          return;
        }
        
        if (result.message.includes('verify your email')) {
          toast({
            title: "Email Verification Needed",
            description: "Please check your email and verify your account before signing in.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Sign In Failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      loginForm.setValue('password', '');
      toast({
        title: "Sign In Failed",
        description: "We encountered an issue while signing you in. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (data: z.infer<typeof registerSchema>) => {
    try {
      setIsLoading(true);
      // Remove confirmPassword as it's not needed in the backend
      const { confirmPassword, ...registerData } = data;
      await register(registerData);
      // Only show success toast if registration succeeds
      setMode("login");
    } catch (error: any) {
      registerForm.setValue('password', '');
      registerForm.setValue('confirmPassword', '');
      console.error('Registration error:', error);
      
      // Handle Supabase auth errors with friendly Eliza AI messaging
      if (error.status === 400 && error.message?.includes("already registered") || 
          (error.code === "42501" && error.message?.includes("row-level security policy"))) {
        toast({
          title: "Welcome Back!",
          description: "I see you already have an Eliza AI account! Let's get you signed in instead.",
          variant: "destructive",
        });
        setMode("login");
        return;
      }
      
      // Handle other specific error cases with friendly messaging
      let errorMessage = "I encountered an issue with your registration. Would you mind trying again?";
      if (error.status === 422) {
        errorMessage = "That email address doesn't look quite right. Could you please check it?";
      } else if (error.status === 429 || error.message?.toLowerCase().includes("rate limit")) {
        errorMessage = "I need a quick moment to process registrations. Please try again in about 60 minutes.";
      } else if (error.message?.includes("at least 6 characters")) {
        errorMessage = "For your security, I need a password that's at least 6 characters long.";
      } else if (error.message?.includes("confirmation email")) {
        errorMessage = "I'm having trouble sending your confirmation email. Could you try again? If this continues, please check if your email address is correct.";
      }
      
      toast({
        title: "Quick Note",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onReset = async (data: { email: string }) => {
    try {
      setIsLoading(true);
      const { error} = await requestPasswordReset(data.email);
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Password reset link sent to your email.",
          variant: "default",
        });
        // Optionally redirect to login or show a different message
        setMode("login");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send password reset link. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Mail className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">
            {mode === "login" ? "Welcome Back" : mode === "register" ? "Create Account" : "Reset Password"}
          </CardTitle>
          <CardDescription>
            {mode === "login" ? "Sign in to continue to Eliza" :
             mode === "register" ? "Fill in your details to get started" :
             "Enter your email to reset password"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "login" && (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@example.com"
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            {...field}
                            disabled={isLoading}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLoading}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-500" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-500" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-black hover:bg-gray-800"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          )}

          {/* Register form section with similar loading state updates */}
          {mode === "register" && (
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                <FormField
                  control={registerForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your name"
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@example.com"
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Create a strong password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            {...field}
                            disabled={isLoading}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLoading}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-500" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-500" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm your password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm your password"
                            {...field}
                            disabled={isLoading}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            disabled={isLoading}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-500" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-500" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-black hover:bg-gray-800"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </Form>
          )}

          {/* Reset form section */}
          {mode === "reset" && (
            <Form {...resetForm}>
              <form onSubmit={resetForm.handleSubmit(onReset)} className="space-y-4">
                <FormField
                  control={resetForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@example.com"
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-black hover:bg-gray-800"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending reset link...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              </form>
            </Form>
          )}

          <div className="mt-4 text-center space-y-2">
            {mode === "login" ? (
              <>
                <Button
                  variant="link"
                  onClick={() => setMode("reset")}
                  disabled={isLoading}
                >
                  Forgot password?
                </Button>
                <div className="flex justify-center gap-1 text-sm">
                  <span className="text-muted-foreground">Don't have an account?</span>
                  <Button
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => setMode("register")}
                    disabled={isLoading}
                  >
                    Create account
                  </Button>
                </div>
              </>
            ) : mode === "register" ? (
              <div className="flex justify-center gap-1 text-sm">
                <span className="text-muted-foreground">Already have an account?</span>
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => setMode("login")}
                  disabled={isLoading}
                >
                  Sign in
                </Button>
              </div>
            ) : (
              <div className="flex justify-center gap-1 text-sm">
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => setMode("login")}
                  disabled={isLoading}
                >
                  Back to login
                </Button>
                <span className="text-muted-foreground">or</span>
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => setMode("register")}
                  disabled={isLoading}
                >
                  Create account
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}