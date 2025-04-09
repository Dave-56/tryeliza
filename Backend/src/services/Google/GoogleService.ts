// /src/services/Google/GoogleService.ts
import { DraftActions } from './Actions/draft';
import { MessageActions } from './Actions/message';
import { WebhookActions } from './Webhook/webhook';
import { HistoryActions } from './Webhook/history';
import { GoogleClient } from './GoogleClient';
import { EmailUtils } from './emailUtils';
import { EmailThread, EmailData } from '../../Types/model';
import { OAuth2Client } from 'google-auth-library';

export class  GoogleService {
    private draftActions: DraftActions;
    private messageActions: MessageActions;
    private webhookActions: WebhookActions;
    private historyActions: HistoryActions;
    private emailUtils: EmailUtils;
    private client: GoogleClient;

    constructor(accessToken: string, refreshToken: string, emailAccountId?: string) {
        this.client = new GoogleClient(accessToken, refreshToken, emailAccountId);
        this.draftActions = new DraftActions(accessToken, refreshToken, emailAccountId);
        this.messageActions = new MessageActions(accessToken, refreshToken, emailAccountId);
        this.webhookActions = new WebhookActions(accessToken, refreshToken, emailAccountId);
        this.historyActions = new HistoryActions(accessToken, refreshToken, emailAccountId);
        this.emailUtils = new EmailUtils(accessToken, refreshToken, emailAccountId);
    } 

    // Expose methods from the client
    public async ensureValidToken(): Promise<void> {
        return this.client.ensureValidToken();
    }

    // Expose methods from draft actions
    public async createDraft(draft: any, threadId: string): Promise<void> {
        return this.draftActions.createDraft(draft, threadId);
    }

    // Expose methods from message actions
    public async sendMessage(message: any, threadId?: string): Promise<void> {
        return this.messageActions.sendMessage(message, threadId);
    }

    // Expose methods from webhook actions
    public async initializeWebhook() {
        return this.webhookActions.initializeWebhook();
    }

    public async renewWatchSubscription(emailAddress: string) {
        return this.webhookActions.renewWatchSubscription(emailAddress);
    }

    public async removeWebhook() {
        return this.webhookActions.removeWebhook();
    }
    
    /**
     * Stops all active Gmail watch subscriptions
     * This should be called before setting up new watches to avoid the
     * "Only one user push notification client allowed per developer" error
     */
    public async stopAllWatches() {
        return this.webhookActions.stopAllWatches();
    }

    // Expose methods from history actions
    public async getLatestHistoryId(): Promise<string> {
        return this.historyActions.getLatestHistoryId();
    }

    public async getNewEmailsWithHistoryId(historyId: string): Promise<EmailThread[]> {
        return this.historyActions.getNewEmailsWithHistoryId(historyId);
    }

    // Expose methods from email utils
    public async getEmailsSinceStartOfDay(startOfDay: string): Promise<EmailThread[]> {
        return this.emailUtils.getEmailsSinceStartOfDay(startOfDay);
    }
    
    // Expose getThreadById method from email utils
    public async getThreadById(threadId: string): Promise<{
        messages: any[];
        messageCount: number;
        participants: string[];
    }> {
        return this.emailUtils.getThreadById(threadId);
    }
    
    // Expose getEmailById method from email utils
    public async getEmailById(emailId: string): Promise<{
        id: string;
        sender: string;
        recipients: string[];
        subject: string;
        content: string;
        date: string;
    } | null> {
        return this.emailUtils.getEmailById(emailId);
    }
}