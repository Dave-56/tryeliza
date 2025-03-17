// routes/emailAccountRoutes.ts
import express, { Request, Response } from 'express';
import { emailAccountRepository } from '../../repositories';
import { BackendResponse, EmailProvider, Integration } from '../../Types/model';
import auth from '../middleware/auth.js';
import { handleCreateAccountForGoogle } from '../middleware/google-Integration.js';
import { GoogleService } from '../../services/Google/GoogleService.js';


// Define interface for email account response
interface EmailAccountResponse {
  id: number;
  provider: string;
  emailAddress: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  isConnected: boolean;
}

const router = express.Router();

// Get all email accounts for the authenticated user
router.get('/', auth, async (
  req: Request, 
  res: Response<BackendResponse<EmailAccountResponse[]>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }

    const accounts = await emailAccountRepository.findByUserId(userId);
    
    res.json({
      data: accounts.map(account => ({
        id: account.id,
        provider: account.provider,
        emailAddress: account.email_address,
        isConnected: account.is_connected,
        expiresAt: account.last_sync?.toISOString()
      })),
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching email accounts:', error);
    res.status(500).json({ error: 'Failed to fetch email accounts', isSuccess: false });
  }
});

// Get a single email account by ID
router.get('/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<EmailAccountResponse>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }

    const accountId = parseInt(req.params.id);
    const account = await emailAccountRepository.findById(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Email account not found', isSuccess: false });
    }
    
    // Check if the account belongs to the authenticated user
    if (account.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to access this account', isSuccess: false });
    }
    
    res.json({
      data: {
        id: account.id,
        provider: account.provider,
        emailAddress: account.email_address,
        isConnected: account.is_connected,
        expiresAt: account.last_sync?.toISOString()
      },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error fetching email account:', error);
    res.status(500).json({ error: 'Failed to fetch email account', isSuccess: false });
  }
});

// Add a new email account with OAuth
router.post('/', auth, async (
  req: Request<{}, BackendResponse<Integration>, { 
    provider: EmailProvider;
    authCode: string;
    isPrimary?: boolean;
  }>, 
  res: Response<BackendResponse<Integration>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }

    const { provider, authCode, isPrimary = false } = req.body;
    
    if (!provider) {
      return res.status(400).json({ 
        error: 'Email provider is required',
        isSuccess: false 
      });
    }
    
    if (!authCode) {
      return res.status(400).json({ 
        error: 'Auth code is required',
        isSuccess: false 
      });
    }
    
    let integration: Integration;
    
    switch (provider) {
      case EmailProvider.GOOGLE:
        integration = await handleCreateAccountForGoogle(authCode, userId);
        break;
      case EmailProvider.OUTLOOK:
        // TODO: Implement handleCreateAccountForOutlook
        return res.status(400).json({ 
          error: 'Outlook integration not implemented yet',
          isSuccess: false 
        });
      default:
        return res.status(400).json({ 
          error: 'Invalid provider',
          isSuccess: false 
        });
    }
    
    res.status(201).json({
      data: integration,
      isSuccess: true
    });
  } catch (error) {
    console.error('Error adding email account:', error);
    
    // More specific error messages
    if(error instanceof Error) {
      if (error.message.includes('invalid_grant')) {
        return res.status(400).json({ 
          error: 'Invalid authorization code', 
          isSuccess: false 
        });
      } 
      else if (error.message.includes('invalid_client')) {
        return res.status(400).json({ 
          error: 'Invalid client configuration', 
          isSuccess: false 
        });
      }
      else if (error.message.includes('already connected')) {
        return res.status(409).json({ 
          error: 'This email account is already connected',
          isSuccess: false 
        });
      }
    }
    
    res.status(500).json({ error: 'Failed to add email account', isSuccess: false });
  }
});

// Delete an email account
router.delete('/:id', auth, async (
  req: Request<{ id: string }>, 
  res: Response<BackendResponse<{ message: string }>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }

    const accountId = parseInt(req.params.id);
    const account = await emailAccountRepository.findById(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Email account not found', isSuccess: false });
    }
    
    // Check if the account belongs to the authenticated user
    if (account.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this account', isSuccess: false });
    }
    
    // If integrated with external services like Google, remove webhooks
    if (account.is_connected && account.tokens?.access_token && account.tokens?.refresh_token) {
      try {
        const googleServices = new GoogleService(
          account.tokens.access_token, 
          account.tokens.refresh_token
        );
        await googleServices.removeWebhook();
        console.log(`Webhook removed for account ${accountId}`);
      } catch (error) {
        console.error('Error removing webhook:', error);
        // Continue with deletion even if webhook removal fails
      }
    }
    
    // Delete the account
    await emailAccountRepository.delete(accountId);
    
    res.json({
      data: { message: 'Email account deleted successfully' },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error deleting email account:', error);
    res.status(500).json({ error: 'Failed to delete email account', isSuccess: false });
  }
});

// Update email account status (connected/disconnected)
router.patch('/:id/status', auth, async (
  req: Request<{ id: string }, BackendResponse<EmailAccountResponse>, { isConnected: boolean }>, 
  res: Response<BackendResponse<EmailAccountResponse>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }

    const accountId = parseInt(req.params.id);
    const { isConnected } = req.body;
    
    if (isConnected === undefined) {
      return res.status(400).json({ 
        error: 'isConnected status is required',
        isSuccess: false 
      });
    }
    
    const account = await emailAccountRepository.findById(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Email account not found', isSuccess: false });
    }
    
    // Check if the account belongs to the authenticated user
    if (account.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this account', isSuccess: false });
    }
    
    // If trying to activate without tokens, return an error
    if (isConnected && !account.tokens) {
      return res.status(400).json({ 
        error: 'Cannot activate account without authentication tokens',
        isSuccess: false 
      });
    }
    
    // If deactivating, handle any cleanup (like removing webhooks)
    if (!isConnected && account.is_connected && account.tokens?.access_token && account.tokens?.refresh_token) {
      try {
        const googleServices = new GoogleService(
          account.tokens.access_token, 
          account.tokens.refresh_token
        );
        await googleServices.removeWebhook();
        console.log(`Webhook removed for account ${accountId}`);
      } catch (error) {
        console.error('Error removing webhook:', error);
        // Continue with status update even if webhook removal fails
      }
    }
    
    // Update the account status
    const updatedAccount = await emailAccountRepository.update(accountId, {
      is_connected: isConnected
    });
    
    if (!updatedAccount) {
      return res.status(500).json({ error: 'Failed to update account', isSuccess: false });
    }
    
    res.json({
      data: {
        id: updatedAccount.id,
        provider: updatedAccount.provider,
        emailAddress: updatedAccount.email_address,
        isConnected: updatedAccount.is_connected,
        expiresAt: updatedAccount.last_sync?.toISOString()
      },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error updating email account status:', error);
    res.status(500).json({ error: 'Failed to update email account status', isSuccess: false });
  }
});

// Update email account tokens
router.patch('/:id/tokens', auth, async (
  req: Request<
    { id: string }, 
    BackendResponse<EmailAccountResponse>, 
    { 
      tokens: {
        access_token: string;
        refresh_token?: string;
        scope: string;
        token_type: string;
        expiry_date: number;
      }
    }
  >, 
  res: Response<BackendResponse<EmailAccountResponse>>
) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }

    const accountId = parseInt(req.params.id);
    const { tokens } = req.body;
    
    if (!tokens || !tokens.access_token) {
      return res.status(400).json({ 
        error: 'Valid tokens are required',
        isSuccess: false 
      });
    }
    
    const account = await emailAccountRepository.findById(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Email account not found', isSuccess: false });
    }
    
    // Check if the account belongs to the authenticated user
    if (account.user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to update this account', isSuccess: false });
    }
    
    // Update the tokens
    const updatedAccount = await emailAccountRepository.updateTokens(
      accountId, 
      tokens
    );
    
    if (!updatedAccount) {
      return res.status(500).json({ error: 'Failed to update account tokens', isSuccess: false });
    }
    
    res.json({
      data: {
        id: updatedAccount.id,
        provider: updatedAccount.provider,
        emailAddress: updatedAccount.email_address,
        isConnected: updatedAccount.is_connected,
        expiresAt: updatedAccount.last_sync?.toISOString()
      },
      isSuccess: true
    });
  } catch (error) {
    console.error('Error updating email account tokens:', error);
    res.status(500).json({ error: 'Failed to update email account tokens', isSuccess: false });
  }
});

export default router;