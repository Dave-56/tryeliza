import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { emailAccountRepository } from '../../repositories';
import { GoogleService } from '../../services/Google/GoogleService';
import { EmailProvider, Integration } from '../../Types/model';
import { ENV } from '../../config/environment';
import { query, db } from '../../db';
import { UUID } from 'crypto';
import { emailSyncService } from '../../services/EmailSync';

/**
 * Creates or updates a Google account integration for a user
 * @param authCode OAuth authorization code from Google
 * @param userId The user's UUID
 * @returns Integration object with account details
 */
export const handleCreateAccountForGoogle = async (authCode: string, userId: string): Promise<Integration> => {
    // Create OAuth client with environment variables
    const oauth2Client = new OAuth2Client(
        ENV.GOOGLE_CLIENT_ID,
        ENV.GOOGLE_CLIENT_SECRET,
        ENV.GOOGLE_REDIRECT_URI
    );

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(authCode);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    if (!userInfo.data.email) {
        throw new Error('Could not get user email from Google');
    }

    const emailAddress = userInfo.data.email;
    const accessToken = tokens.access_token!;
    const refreshToken = tokens.refresh_token!;
    const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000);

    // Initialize webhook for listening to changes
    const googleServices = new GoogleService(accessToken, refreshToken);
    const webhookResponse = await googleServices.initializeWebhook();

    // Use a transaction to ensure data consistency
    return query(async (db) => {
        // Check if account already exists
        const existingAccount = await emailAccountRepository.findByUserAndEmail(userId as UUID, emailAddress);

        let account;
        if (existingAccount) {
            // Update existing account
            account = await emailAccountRepository.update(existingAccount.id, {
                is_connected: true,
                //history_id: webhookResponse.historyId, // Store the history ID
                tokens: {
                    access_token: accessToken,
                    refresh_token: refreshToken || existingAccount.tokens?.refresh_token,
                    scope: tokens.scope || '',
                    token_type: tokens.token_type || 'Bearer',
                    expiry_date: expiryDate.getTime()
                },
                last_sync: new Date()
            });
        } else {
            // Create new account
            account = await emailAccountRepository.create({
                user_id: userId as UUID,
                email_address: emailAddress,
                provider: EmailProvider.GOOGLE,
                is_connected: true,
                //history_id: webhookResponse.historyId, // Store the history ID
                tokens: {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    scope: tokens.scope || '',
                    token_type: tokens.token_type || 'Bearer',
                    expiry_date: expiryDate.getTime()
                },
                last_sync: new Date()
            });
        }

        // Trigger initial email sync would go here
        // This would be implemented separately in an email sync service
        try {
            await emailSyncService.syncEmails(userId, account.id);
            console.log('Initial email sync would be triggered here for:', emailAddress);
        } catch (error) {
            console.error('Initial email sync would have failed:', error);
            // We don't throw here to avoid rolling back the account creation
        }

        // Return integration details
        return {
            id: account.id.toString(),
            provider: EmailProvider.GOOGLE,
            emailAddress: account.email_address,
            accessToken: account.tokens?.access_token || '',
            refreshToken: account.tokens?.refresh_token || '',
            expiresAt: new Date(account.tokens?.expiry_date || 0).toISOString(),
            isActive: account.is_connected
        };
    });
};