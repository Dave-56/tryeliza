// /src/services/Google/Actions/draft.ts
import { GoogleClient } from '../GoogleClient';

export interface DraftOptions {
    subject: string;
    body: string;
    to: string;
    cc?: string[];
}

export class DraftActions extends GoogleClient {
    /**
     * Creates a draft email in Gmail
     */
    public async createDraft(draft: DraftOptions, threadId: string): Promise<void> {
        // Ensure token is valid before making API calls
        await this.ensureValidToken();
        
        const message = this.createMessage(draft);
        console.log("message is : ", message)
        await this.gmail.users.drafts.create({
            userId: 'me',
            requestBody: {
                message: {
                    raw: message,
                    threadId
                }
            }
        });
    }

    /**
     * Creates a raw message string from draft options
     */
    private createMessage(draft: DraftOptions): string {
        const email = [
            `To: ${draft.to}`,
            `Subject: ${draft.subject}`,
            draft.cc?.length ? `Cc: ${draft.cc.join(', ')}` : '',
            '',
            draft.body
        ].filter(Boolean).join('\n');  // Filter out empty strings

        return Buffer.from(email).toString('base64url');
    }
}