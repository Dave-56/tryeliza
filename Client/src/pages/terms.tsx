import { Card, CardContent } from "@/components/ui/card";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-6">
            <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
            <div className="prose dark:prose-invert">
              <h2>Service Description</h2>
              <p>
                Our application provides email organization and task management services
                through Gmail API integration. By using our service, you agree to these terms.
              </p>

              <h2>Gmail API Terms</h2>
              <p>
                By using our service, you authorize us to:
              </p>
              <ul>
                <li>Access your Gmail account through OAuth 2.0</li>
                <li>Read and analyze your emails</li>
                <li>Create and manage tasks based on your emails</li>
              </ul>

              <h2>User Responsibilities</h2>
              <p>
                You agree to:
              </p>
              <ul>
                <li>Maintain the confidentiality of your account</li>
                <li>Use the service in compliance with applicable laws</li>
                <li>Not misuse or abuse the service</li>
              </ul>

              <h2>Service Modifications</h2>
              <p>
                We reserve the right to modify or discontinue the service at any time.
                We will provide notice of significant changes.
              </p>

              <h2>Contact</h2>
              <p>
                For questions about these terms, please contact support@example.com
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
