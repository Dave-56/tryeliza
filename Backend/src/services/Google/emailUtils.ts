import { gmail_v1 } from 'googleapis';
import { EmailThread } from '../../Types/model';
import { GoogleClient } from './GoogleClient';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger';
import { cleanEmailText } from '../../utils/utils';

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

            // Get subject from the first message's headers
            const firstMessage = threadMessages[0];
            const subject = firstMessage?.payload?.headers?.find(h => h.name === 'Subject')?.value || '';

            return {
                id: threadId!,
                subject,  // Add subject at thread level
                messages: await Promise.all(threadMessages.map(async msg => ({
                    id: msg.id!,
                    snippet: msg.snippet || undefined,
                    labelIds: msg.labelIds || undefined,
                    headers: this.parseHeaders(msg.payload?.headers || []),
                    body: await this.getEmailBody(msg.payload)
                })))
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
    public async getEmailBody(payload: gmail_v1.Schema$MessagePart | undefined): Promise<string> {
        if (!payload) {
            ThreadDebugLogger.log('[Email Debug] No payload provided');
            return '';
        }

        // ThreadDebugLogger.log('[Email Debug] Processing payload:', {
        //     mimeType: payload.mimeType,
        //     hasBody: !!payload.body,
        //     bodySize: payload.body?.size,
        //     hasParts: !!payload.parts,
        //     partsCount: payload.parts?.length
        // });

        // If the message is simple, get the body directly
        if (payload.body?.data) {
            // ThreadDebugLogger.log('[Email Debug] Found simple body data');
            const bodyText = Buffer.from(payload.body.data, 'base64').toString();
            return await cleanEmailText(bodyText);
        }

        // If the message is multipart, try to get the best content
        if (payload.parts) {
            // ThreadDebugLogger.log('[Email Debug] Processing multipart message:', {
            //     parts: payload.parts.map(part => ({
            //         mimeType: part.mimeType,
            //         hasBody: !!part.body,
            //         bodySize: part.body?.size,
            //         hasParts: !!part.parts
            //     }))
            // });

            let htmlContent: string | null = null;
            let plainTextContent: string | null = null;
            let maxContentSize = 0;

            // First pass: collect all available content
            for (const part of payload.parts) {
                if (part.body?.data) {
                    const content = Buffer.from(part.body.data, 'base64').toString();
                    const size = content.length;

                    if (part.mimeType === 'text/plain') {
                        plainTextContent = content;
                        // ThreadDebugLogger.log('[Email Debug] Found text/plain content', { 
                        //     size,
                        //     content: content.length > 1000 ? 
                        //         content.substring(0, 1500) + "\n...\n" + content.substring(content.length - 500) : 
                        //         content 
                        // });
                    } else if (part.mimeType === 'text/html') {
                        htmlContent = content;
                        // ThreadDebugLogger.log('[Email Debug] Found text/html content', { 
                        //     size,
                        //     content: content.length > 1000 ? 
                        //         content.substring(0, 1500) + "\n...\n" + content.substring(content.length - 500) : 
                        //         content
                        // });
                    }

                    if (size > maxContentSize) {
                        maxContentSize = size;
                    }
                }

                // Recursively check nested parts
                if (part.parts) {
                    // ThreadDebugLogger.log('[Email Debug] Recursing into nested parts');
                    const nestedContent = await this.getEmailBody(part);
                    if (nestedContent && nestedContent.length > maxContentSize) {
                        maxContentSize = nestedContent.length;
                        htmlContent = nestedContent; // Prefer HTML from nested parts too
                    }
                }
            }
            // For substantial plain text content (>1500 chars), prefer it over HTML
            if (plainTextContent && plainTextContent.length > 1500) {
                ThreadDebugLogger.log('[Email Debug] Selected text/plain content', {
                    reason: 'Substantial plain text available, preferring over HTML',
                    contentLength: plainTextContent.length,
                    sample: plainTextContent.substring(0, 50) + '...'
                });
                return await this.cleanPlainTextEmail(plainTextContent);
            }
            else if(htmlContent) {
                ThreadDebugLogger.log('[Email Debug] Selected text/html content', {
                    reason: 'HTML content available',
                    originalLength: htmlContent.length,
                    sample: htmlContent.substring(0, 50) + '...'
                });
                return await cleanEmailText(htmlContent);
            }
            // For short plain text as last resort
            else if (plainTextContent && plainTextContent.length > 0) {
                ThreadDebugLogger.log('[Email Debug] Selected short text/plain content', {
                    reason: 'Only short plain text available',
                    contentLength: plainTextContent.length,
                    sample: plainTextContent.substring(0, 50) + '...'
                });
                return await this.cleanPlainTextEmail(plainTextContent);
            }

        }

        ThreadDebugLogger.log('[Email Debug] No usable body content found');
        return '';
    }

    /**
     * Extracts the email body from the message payload, preserving HTML formatting
     * This is different from getEmailBody which converts HTML to plain text
     */
    public async getEmailBodyWithHtml(payload: gmail_v1.Schema$MessagePart | undefined): Promise<string> {
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
                    const htmlBody = await this.getEmailBodyWithHtml(part);
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
                maxResults: 20 // Limit to 20 messages for now - we can comment this out later
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
        const messages = await Promise.all(thread.data.messages.map(async message => {
            // Extract headers
            const headers = message.payload?.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const to = headers.find(h => h.name === 'To')?.value || '';
            const date = headers.find(h => h.name === 'Date')?.value || '';
            
            // Use our existing getEmailBody method for better content extraction
            const content = await this.getEmailBody(message.payload);
            
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
        }));
        
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
                ThreadDebugLogger.log('[Email Debug] No data or payload for email:', emailId);
                return null;
            }
            
            // Debug log raw message data
            // ThreadDebugLogger.log('[Email Debug] Raw message data:', {
            //     id: emailId,
            //     payload: {
            //         mimeType: response.data.payload.mimeType,
            //         hasBody: !!response.data.payload.body,
            //         bodySize: response.data.payload.body?.size,
            //         hasParts: !!response.data.payload.parts,
            //         partsCount: response.data.payload.parts?.length,
            //         snippet: response.data.snippet
            //     }
            // });
            
            // Extract headers
            const headers = response.data.payload.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const to = headers.find(h => h.name === 'To')?.value || '';
            const date = headers.find(h => h.name === 'Date')?.value || '';
            
            // Debug log headers
            // ThreadDebugLogger.log('[Email Debug] Extracted headers:', {
            //     subject: subject || '(empty)',
            //     from: from || '(empty)',
            //     to: to || '(empty)',
            //     date: date || '(empty)'
            // });
            
            // Extract content
            const content = await this.getEmailBody(response.data.payload);
            
            // Debug log content info
            // ThreadDebugLogger.log('[Email Debug] Content extraction:', {
            //     hasContent: !!content,
            //     contentLength: content?.length || 0,
            //     firstFewChars: content ? content.substring(0, 50) + '...' : '(empty)'
            // });
            
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
            console.error('[Email Debug] Error fetching email by ID:', emailId, error);
            return null;
        }
    }

    private async cleanPlainTextEmail(plainText: string): Promise<string> {
        if (!plainText) return '';
        
        ThreadDebugLogger.log('Starting cleanPlainTextEmail', {
            inputLength: plainText?.length,
            firstFewChars: plainText?.substring(0, 100)
        });
        
        try {
            // Step 1: Normalize whitespace
            let cleaned = plainText
                .replace(/\r\n/g, '\n') // Convert CRLF to LF
                .replace(/\r/g, '\n') // Convert CR to LF
                .replace(/\n{3,}/g, '\n\n') // Replace 3+ consecutive newlines with just 2
                .replace(/[ \t]+\n/g, '\n') // Remove trailing spaces on lines
                .replace(/^\s+/, '') // Trim leading whitespace
                .trim();
            
            // Step 2: Remove or shorten URLs
            // Option 1: Remove URLs entirely
            // cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '[URL]');
            // Option 2: Shorten URLs (keeping domain)
            cleaned = cleaned.replace(/https?:\/\/([^\/\s]+)[^\s]*/g, 'https://$1/...');
            
            // Step 3: Remove common email footer patterns
            const footerPatterns = [
                /Unsubscribe[\s\S]*$/i,
                /To unsubscribe[\s\S]*$/i,
                /View in browser[\s\S]*$/i,
                /View as a web page[\s\S]*$/i,
                /This email was sent to[\s\S]*$/i,
                /\(c\) \d{4}[\s\S]*$/i,
                /All rights reserved[\s\S]*$/i,
                /If you would no longer like to receive emails[\s\S]*$/i,
                /To view our privacy policy[\s\S]*$/i,
                /This message was sent to:[\s\S]*$/i,
                /Email Preferences[\s\S]*$/i
            ];
            
            for (const pattern of footerPatterns) {
                cleaned = cleaned.replace(pattern, '');
            }
            
            // Step 4: Remove excessive spacing between paragraphs (more than 2 newlines)
            cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
            
            ThreadDebugLogger.log('cleanPlainTextEmail complete', {
                finalLength: cleaned.length,
                sample: cleaned.substring(0, 100) + '...'
            });
            
            return cleaned;
        } catch (error) {
            console.error('Error in cleanPlainTextEmail:', error);
            // Return original text if cleaning fails
            return plainText;
        }
    }
}