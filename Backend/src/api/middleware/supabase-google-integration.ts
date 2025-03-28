import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { UUID } from 'crypto';
import { ENV } from '../../config/environment';
import { EmailProvider, Integration } from '../../Types/model';
import { emailAccountRepository } from '../../repositories';
import { query } from '../../db';
import { GoogleService } from '../../services/Google/GoogleService';
import { emailSyncService } from '../../services/EmailSync';

export const handleSupabaseGoogleIntegration = async (
    accessToken: string,
    refreshToken: string,
    userId: string
): Promise<Integration> => {
    // Create OAuth client with environment variables
    const oauth2Client = new OAuth2Client(
        ENV.GOOGLE_CLIENT_ID,
        ENV.GOOGLE_CLIENT_SECRET,
        ENV.GOOGLE_REDIRECT_URI
    );

    // Set credentials directly from Supabase tokens
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer'
    });

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    if (!userInfo.data.email) {
        throw new Error('Could not get user email from Google');
    }

    console.log(userInfo.data);

    const emailAddress = userInfo.data.email;
    // we should also add name as userInfo.data.name
    const name = userInfo.data.name;
    const expiryDate = new Date(Date.now() + 3600 * 1000); // 1 hour from now

    // Initialize Google service
    const googleServices = new GoogleService(accessToken, refreshToken);
    
    try {
        // Try to stop any existing webhooks first
        await googleServices.removeWebhook();
        // Then initialize new webhook
        await googleServices.initializeWebhook();
    } catch (error) {
        // Log but don't fail if webhook setup fails
        console.error('Error in webhook setup:', error);
    }

    // Use a transaction to ensure data consistency
    return query(async (db) => {
        // Check if account already exists
        let account = await emailAccountRepository.findByUserAndEmail(userId as UUID, emailAddress);

        if (account) {
            // Update existing account
            account = await emailAccountRepository.update(account.id, {
                is_connected: true,
                tokens: {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    token_type: 'Bearer',
                    expiry_date: expiryDate.getTime()
                },
                last_sync: new Date()
            });
        } else {
            // Try to create, if fails due to duplicate, just get and update
            try {
                account = await emailAccountRepository.create({
                    user_id: userId as UUID,
                    email_address: emailAddress,
                    provider: EmailProvider.GOOGLE,
                    is_connected: true,
                    tokens: {
                        access_token: accessToken,
                        refresh_token: refreshToken,
                        scope: '',
                        token_type: 'Bearer',
                        expiry_date: expiryDate.getTime()
                    },
                    last_sync: new Date()
                });
            } catch {
                // Silently handle any errors (like duplicates) by finding and updating
                account = await emailAccountRepository.findByUserAndEmail(userId as UUID, emailAddress);
                if (account) {
                    account = await emailAccountRepository.update(account.id, {
                        is_connected: true,
                        tokens: {
                            access_token: accessToken,
                            refresh_token: refreshToken,
                            token_type: 'Bearer',
                            expiry_date: expiryDate.getTime()
                        },
                        last_sync: new Date()
                    });
                }
            }
        }

        // Trigger initial email sync
        try {
            await emailSyncService.syncEmails(userId, account.id);
        } catch (error) {
            console.error('Initial email sync failed:', error);
        }

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