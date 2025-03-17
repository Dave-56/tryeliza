import { Card, CardContent } from "@/components/ui/card";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-6">
            <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
            <div className="prose dark:prose-invert">
              <h2>Data Collection and Usage</h2>
              <p>
                We collect and process your email data through Gmail API integration
                to provide email organization and task management features. This includes:
              </p>
              <ul>
                <li>Email content and metadata</li>
                <li>Contact information</li>
                <li>Task-related data</li>
              </ul>

              <h2>Gmail API Usage</h2>
              <p>
                Our application uses Gmail API to:
              </p>
              <ul>
                <li>Read and analyze your emails</li>
                <li>Organize emails into categories</li>
                <li>Create tasks from emails</li>
                <li>Send email notifications</li>
              </ul>

              <h2>Data Security</h2>
              <p>
                We implement security measures to protect your data:
              </p>
              <ul>
                <li>Secure OAuth 2.0 authentication</li>
                <li>Encrypted data storage</li>
                <li>Regular security updates</li>
              </ul>

              <h2>Contact</h2>
              <p>
                For privacy-related questions, please contact us at support@example.com
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
