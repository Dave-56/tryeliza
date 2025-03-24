import { gmail_v1 } from 'googleapis';
import { EmailThread } from '../../Types/model';
import { GoogleClient } from './GoogleClient';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger';

export class EmailUtils extends GoogleClient {
    /**
     * Gets email details from a thread ID
     */
    public async getEmailDetails(threadId: string): Promise<EmailThread> {
        try {
            // Ensure token is valid before making API calls
            await this.ensureValidToken();
            
            let threadMessages: gmail_v1.Schema$Message[] = [];
            // Get all messages in the thread
            const threadResponse = await this.gmail.users.threads.get({
                userId: 'me',
                id: threadId,
                format: 'full'
            });
            threadMessages = threadResponse.data.messages || [];

            return {
                id: threadId!,
                messages: threadMessages.map(msg => ({
                    id: msg.id!,
                    snippet: msg.snippet || undefined,
                    labelIds: msg.labelIds || undefined,
                    headers: this.parseHeaders(msg.payload?.headers || []),
                    body: this.getEmailBody(msg.payload)
                }))
            };
        } catch (error) {
            console.error('Error getting email details:', error);
            throw error;
        }
    }

    /**
     * Parses email headers into a structured object
     */
    protected parseHeaders(headers: gmail_v1.Schema$MessagePartHeader[]) {
        return {
            subject: headers.find(h => h.name === 'Subject')?.value ?? '',
            from: headers.find(h => h.name === 'From')?.value ?? '',
            to: headers.find(h => h.name === 'To')?.value ?? '',
            date: headers.find(h => h.name === 'Date')?.value ?? ''
        };
    }

    /**
     * Extracts the email body from the message payload
     */
    public getEmailBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
        // Log the payload structure for debugging
        // ThreadDebugLogger.log('Email payload structure in getEmailBody', {
        //     hasPayload: !!payload,
        //     mimeType: payload?.mimeType,
        //     hasDirectBody: !!payload?.body?.data,
        //     bodySize: payload?.body?.data ? payload.body.data.length : 0,
        //     hasParts: !!payload?.parts,
        //     partsCount: payload?.parts?.length || 0,
        //     partTypes: payload?.parts?.map(part => ({
        //         mimeType: part.mimeType,
        //         hasData: !!part.body?.data,
        //         dataSize: part.body?.data ? part.body.data.length : 0,
        //         hasNestedParts: !!part.parts,
        //         nestedPartsCount: part.parts?.length || 0
        //     })),
        //     // Add actual body content sample if available
        //     bodyContentSample: payload?.body?.data 
        //         ? Buffer.from(payload.body.data, 'base64').toString().substring(0, 200) + '...' 
        //         : 'No direct body content'
        // });

        if (!payload) return '';

        // If the message is simple, get the body directly
        if (payload.body?.data) {
            const bodyText = Buffer.from(payload.body.data, 'base64').toString();
            // ThreadDebugLogger.log('Found direct body data', {
            //     bodyLength: bodyText.length,
            //     bodySample: bodyText.substring(0, 200) + (bodyText.length > 200 ? '...' : ''),
            //     fullBody: bodyText // Log the full body for complete verification
            // });
            return bodyText;
        }

        // If the message is multipart, recursively get the text part
        if (payload.parts) {
            // Log all available parts for better debugging
            // ThreadDebugLogger.log('Available parts in multipart message', {
            //     allParts: payload.parts.map(part => ({
            //         mimeType: part.mimeType,
            //         partId: part.partId,
            //         filename: part.filename,
            //         hasData: !!part.body?.data,
            //         dataSize: part.body?.data ? part.body.data.length : 0
            //     }))
            // });
            
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    const plainText = Buffer.from(part.body.data, 'base64').toString();
                    // ThreadDebugLogger.log('Found text/plain part', {
                    //     textLength: plainText.length,
                    //     textSample: plainText.substring(0, 200) + (plainText.length > 200 ? '...' : ''),
                    //     fullText: plainText // Log the full text for complete verification
                    // });
                    return plainText;
                }
                // Recursively check parts
                if (part.parts) {
                    const body = this.getEmailBody(part);
                    if (body) return body;
                }
            }
        }

        // If no text/plain part found, try HTML part
        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/html' && part.body?.data) {
                    const html = Buffer.from(part.body.data, 'base64').toString();
                    // Basic HTML to text conversion
                    const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                    // ThreadDebugLogger.log('Found text/html part', {
                    //     htmlLength: html.length,
                    //     plainTextLength: plainText.length,
                    //     plainTextSample: plainText.substring(0, 200) + (plainText.length > 200 ? '...' : ''),
                    //     fullPlainText: plainText // Log the full converted text for verification
                    // });
                    return plainText;
                }
            }
        }

        // ThreadDebugLogger.log('No text/plain or text/html part found in message', {
        //     payloadMimeType: payload.mimeType,
        //     availableParts: payload.parts?.map(p => p.mimeType) || []
        // });

        return '';
    }

    /**
     * Extracts the email body from the message payload, preserving HTML formatting
     * This is different from getEmailBody which converts HTML to plain text
     */
    public getEmailBodyWithHtml(payload: gmail_v1.Schema$MessagePart | undefined): string {
        if (!payload) return '';

        // If the message is simple, get the body directly
        if (payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64').toString();
        }

        // If the message is multipart, prioritize HTML content over plain text
        if (payload.parts) {
            // First try to find HTML part
            for (const part of payload.parts) {
                if (part.mimeType === 'text/html' && part.body?.data) {
                    return Buffer.from(part.body.data, 'base64').toString();
                }
                // Recursively check parts
                if (part.parts) {
                    const htmlBody = this.getEmailBodyWithHtml(part);
                    if (htmlBody) return htmlBody;
                }
            }
            
            // If no HTML part found, fall back to plain text
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    const plainText = Buffer.from(part.body.data, 'base64').toString();
                    // Wrap plain text in a pre tag to preserve formatting
                    return `<pre style="white-space: pre-wrap; font-family: inherit;">${plainText}</pre>`;
                }
            }
        }

        return '';
    }

    /**
     * Fetches emails since the start of the day
     */
    public async getEmailsSinceStartOfDay(startOfDay: string): Promise<EmailThread[]> {
        try {
            // Ensure token is valid before making API calls
            await this.ensureValidToken();
            
            // Convert timestamp to YYYY/MM/DD format for Gmail query
            const date = new Date(parseInt(startOfDay));
            const formattedDate = date.toISOString().split('T')[0].replace(/-/g, '/');

            // Get messages from today
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: `in:inbox after:${formattedDate}`,  // Gmail search query format: YYYY/MM/DD
                maxResults: 15 // Limit to 10 messages for now - we can comment this out later
            });

            console.log("Initial messages response:", {
                totalMessages: response.data.messages?.length || 0,
                messages: response.data.messages?.map(m => ({
                    id: m.id,
                    threadId: m.threadId
                }))
            });

            if (!response.data.messages) {
                return [];
            }

            // Get full details for each thread
            const threadIds = new Set(
                response.data.messages
                    .filter(msg => msg.threadId)  // Filter out messages without threadId
                    .map(msg => msg.threadId!)    // Get unique thread IDs
            );

            console.log("Unique thread IDs:", {
                totalThreads: threadIds.size,
                threadIds: Array.from(threadIds)
            });

            const threads: EmailThread[] = [];
            
            // Fetch full thread details
            for (const threadId of threadIds) {
                try {
                    const threadDetails = await this.getEmailDetails(threadId);
                    console.log(`Thread ${threadId} details:`, {
                        totalMessagesInThread: threadDetails.messages.length,
                        messageIds: threadDetails.messages.map(m => m.id)
                    });
                    threads.push(threadDetails);
                } catch (error) {
                    console.error(`Error fetching thread ${threadId}:`, error);
                    continue;  // Skip failed threads
                }
            }

            console.log("Final threads summary:", {
                totalThreads: threads.length,
                threadsWithMessageCounts: threads.map(t => ({
                    threadId: t.id,
                    messageCount: t.messages.length
                }))
            });

            return threads;

        } catch (error) {
            console.error('Error fetching emails since start of day:', error);
            throw error;
        }
    }

    // Add to EmailUtils class
    public async getThreadById(threadId: string): Promise<{
        messages: any[];
        messageCount: number;
        participants: string[];
    }> {
        await this.ensureValidToken();
        
        // Fetch the thread from Gmail
        const thread = await this.gmail.users.threads.get({
            userId: 'me',
            id: threadId,
            format: 'full',
        });
        
        if (!thread.data || !thread.data.messages) {
            throw new Error('Thread not found');
        }
        
        // Process messages to extract content
        const messages = thread.data.messages.map(message => {
            // Extract headers
            const headers = message.payload?.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const to = headers.find(h => h.name === 'To')?.value || '';
            const date = headers.find(h => h.name === 'Date')?.value || '';
            
            // Use our existing getEmailBody method for better content extraction
            const content = this.getEmailBody(message.payload);
            
            // Parse recipients
            const recipients = to.split(',').map(r => r.trim());
            
            return {
                id: message.id,
                sender: from,
                recipients,
                subject,
                content,
                date,
            };
        });
        
        // Helper function to normalize email addresses
        const normalizeEmailAddress = (email: string): string => {
            // Extract email from format like "Name <email@example.com>"
            const emailMatch = email.match(/<([^>]+)>/) || [null, email];
            return emailMatch[1].toLowerCase().trim();
        };
        
        // Extract unique participants with normalization
        const uniqueParticipants = new Set<string>();
        messages.forEach(msg => {
            // Add the original format of the sender and recipients
            uniqueParticipants.add(msg.sender);
            msg.recipients.forEach(recipient => uniqueParticipants.add(recipient));
        });
        
        return {
            messages,
            messageCount: messages.length,
            participants: Array.from(uniqueParticipants).map(participant => normalizeEmailAddress(participant)),
        };
    }

    /**
     * Fetches a single email by its ID
     * @param emailId The ID of the email to fetch
     * @returns The email message data or null if not found
     */
    public async getEmailById(emailId: string): Promise<{
        id: string;
        sender: string;
        recipients: string[];
        subject: string;
        content: string;
        date: string;
    } | null> {
        try {
            // Ensure token is valid before making API calls
            await this.ensureValidToken();
            
            const response = await this.gmail.users.messages.get({
                userId: 'me',
                id: emailId,
                format: 'full'
            });
            
            if (!response.data || !response.data.payload) {
                return null;
            }
            
            // Extract headers
            const headers = response.data.payload.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const to = headers.find(h => h.name === 'To')?.value || '';
            const date = headers.find(h => h.name === 'Date')?.value || '';
            
            // Extract content
            const content = this.getEmailBody(response.data.payload);
            
            // Parse recipients
            const recipients = to.split(',').map(r => r.trim());
            
            return {
                id: response.data.id || '',
                sender: from,
                recipients,
                subject,
                content,
                date,
            };
        } catch (error) {
            console.error('Error fetching email by ID:', error);
            return null;
        }
    }
}