import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail } from "lucide-react";
import { useLocation } from "wouter";

const commonEmailProviders = [
  { name: 'Gmail', url: 'https://gmail.com' }
];

export default function VerifyEmail() {
  const [, setLocation] = useLocation();

  return (
    <div className="container flex items-center justify-center min-h-screen py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Check Your Email</CardTitle>
          <CardDescription>
            I've sent you a verification link. Please check your inbox to verify your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Quick access to your email provider:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {commonEmailProviders.map((provider) => (
                <Button
                  key={provider.name}
                  variant="outline"
                  onClick={() => window.open(provider.url, '_blank')}
                >
                  {provider.name}
                </Button>
              ))}
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground mt-6">
            <p className="text-center">
              Already verified? {' '}
              <Button
                variant="link"
                className="p-0 h-auto font-normal"
                onClick={() => setLocation('/login')}
              >
                Sign in to your account
              </Button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}