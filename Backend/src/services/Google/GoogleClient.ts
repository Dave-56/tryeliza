// /src/services/Google/GoogleClient.ts
import { OAuth2Client, Credentials } from 'google-auth-library';
import { gmail_v1, google } from 'googleapis';
import { ENV } from '../../config/environment';
import { emailAccountRepository } from '../../repositories';

export class GoogleClient {
    protected oauth2Client: OAuth2Client;
    protected gmail: gmail_v1.Gmail;

    constructor(accessToken: string, refreshToken: string, protected emailAccountId?: string) {
        this.oauth2Client = new OAuth2Client(
            ENV.GOOGLE_CLIENT_ID,
            ENV.GOOGLE_CLIENT_SECRET,
            ENV.GOOGLE_REDIRECT_URI
        );
        this.oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken
        });
        this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    }

    /**
     * Checks if the current access token is expired or about to expire
     */
    protected isTokenExpired(): boolean {
        const credentials = this.oauth2Client.credentials;
        if (!credentials.expiry_date) {
            return true;
        }
        
        const expiryBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
        return Date.now() >= (credentials.expiry_date - expiryBuffer);
    }

    /**
     * Checks if a refresh token is available
     */
    protected hasRefreshToken(): boolean {
        return Boolean(this.oauth2Client.credentials.refresh_token);
    }

    /**
     * Ensures the access token is valid before making API calls
     */
    public async ensureValidToken(): Promise<void> {
        try {
            if (this.isTokenExpired()) {
                if (!this.hasRefreshToken()) {
                    console.log('Token expired but no refresh token available. Cannot refresh.');
                    throw new Error('No refresh token available');
                }
                
                console.log('Access token expired or about to expire, refreshing...');
                const newCredentials = await this.refreshAccessToken();
                
                if (!newCredentials || !newCredentials.access_token) {
                    throw new Error('Failed to refresh access token');
                }
                
                if (this.emailAccountId) {
                    const tokenUpdate = {
                        access_token: newCredentials.access_token,
                        refresh_token: newCredentials.refresh_token || undefined,
                        scope: newCredentials.scope || this.oauth2Client.credentials.scope || '',
                        token_type: newCredentials.token_type || this.oauth2Client.credentials.token_type || 'Bearer',
                        expiry_date: newCredentials.expiry_date ?? Date.now() + 3600000
                    };
                    
                    await emailAccountRepository.update(parseInt(this.emailAccountId), {
                        tokens: tokenUpdate,
                        updated_at: new Date()
                    });
                }
                
                console.log('Access token refreshed successfully');
            }
        } catch (error) {
            console.error('Error ensuring valid token:', error);
            throw new Error('Authentication failed: Unable to refresh access token');
        }
    }

    /**
     * Refreshes the access token
     */
    public async refreshAccessToken(): Promise<Credentials | null> {
        try {
            if (!this.oauth2Client.credentials.refresh_token) {
                console.error('No refresh token available to refresh access token');
                throw new Error('No refresh token is set');
            }

            console.log('Refreshing access token...');
            const response = await this.oauth2Client.refreshAccessToken();
            const credentials = response.credentials;
            
            this.oauth2Client.setCredentials(credentials);
            
            console.log('Access token refreshed successfully');
            return credentials;
        } catch (error) {
            console.error('Error refreshing access token:', error);
            if (error instanceof Error) {
                if (error.message.includes('invalid_grant')) {
                    console.error('Invalid grant error: Refresh token may be revoked or expired');
                    if (this.emailAccountId) {
                        await emailAccountRepository.markAsDisconnected(parseInt(this.emailAccountId));
                    }
                    throw new Error('Authentication failed: Refresh token is invalid or revoked');
                }
                
                if (error.message.includes('No refresh token is set')) {
                    if (this.emailAccountId) {
                        await emailAccountRepository.markAsDisconnected(parseInt(this.emailAccountId));
                    }
                    throw new Error('Authentication failed: No refresh token available');
                }
            }
            
            throw error;
        }
    }
}