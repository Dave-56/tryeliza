// /src/services/Google/Actions/message.ts
import { GoogleClient } from '../GoogleClient';

export interface MessageOptions {
    subject: string;
    body: string;
    to: string;
    cc?: string[];
    bcc?: string[];
}

export class MessageActions extends GoogleClient {
    /**
     * Sends an email message via Gmail
     */
    public async sendMessage(message: MessageOptions, threadId?: string): Promise<void> {
        // Ensure token is valid before making API calls
        await this.ensureValidToken();
        
        const rawMessage = this.createRawMessage(message);
        await this.gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: rawMessage,
                threadId
            }
        });
    }

    /**
     * Creates a raw message string from message options
     */
    private createRawMessage(message: MessageOptions): string {
        const email = [
            `To: ${message.to}`,
            `Subject: ${message.subject}`,
            message.cc?.length ? `Cc: ${message.cc.join(', ')}` : '',
            message.bcc?.length ? `Bcc: ${message.bcc.join(', ')}` : '',
            '',
            message.body
        ].filter(Boolean).join('\n');

        return Buffer.from(email).toString('base64url');
    }

}