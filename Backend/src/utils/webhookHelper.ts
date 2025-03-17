import { emailAccountRepository } from '../repositories/index.js';
import { GoogleService } from '../services/Google/GoogleService.js';
import { EmailProvider } from '../Types/model.js';


// In webhookHelper.ts
export async function setupWatchRenewal() {
    // This function is still useful for scheduled tasks
    const accounts = await emailAccountRepository.findByProvider(EmailProvider.GOOGLE);
    console.log(accounts);
    console.log(`Found ${accounts.length} Google accounts for watch renewal`);

    let successCount = 0;
    let failureCount = 0;
    
    await Promise.all(accounts.map(async (account) => {
        try {
            // Check if tokens exist and are valid
            if (!account.tokens) {
                console.error(`No tokens found for account ${account.id} (${account.email_address})`);
                failureCount++;
                return;
            }
            
            if (!account.tokens.refresh_token) {
                console.error(`No refresh token found for account ${account.id} (${account.email_address}). Marking as disconnected.`);
                await emailAccountRepository.markAsDisconnected(account.id);
                failureCount++;
                return;
            }

            // Create a GoogleService instance with account ID
            const googleService = new GoogleService(
                account.tokens.access_token, 
                account.tokens.refresh_token,
                account.id.toString()
            );

            // Use the enhanced token refresh mechanism
            try {
                await googleService.ensureValidToken();
            } catch (tokenError) {
                console.error(`Token refresh failed for account ${account.id} (${account.email_address}):`, tokenError);
                // Mark account as disconnected if token refresh fails
                await emailAccountRepository.markAsDisconnected(account.id);
                failureCount++;
                return;
            }

            // Renew the watch subscription
            try {
                const result = await googleService.renewWatchSubscription(account.email_address);
                console.log(`Watch renewed for account ${account.email_address} until ${new Date(Number(result.expiration)).toISOString()}`);
                
                // Update the history ID in the database
                await emailAccountRepository.update(account.id, {
                    history_id: result.historyId,
                    updated_at: new Date()
                });
                
                successCount++;
            } catch (watchError) {
                console.error(`Failed to renew watch for account ${account.id} (${account.email_address}):`, watchError);
                failureCount++;
            }
        } catch (error) {
            console.error(`Error processing account ${account.id} (${account.email_address}):`, error);
            failureCount++;
        }
    }));
    
    console.log(`Watch renewal completed: ${successCount} successful, ${failureCount} failed`);
}
