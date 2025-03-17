// routes/userRoutes.ts
import express, { Request, Response } from 'express';
import { userRepository, emailAccountRepository } from '../../repositories';
import { BackendResponse, Integration, EmailProvider } from '../../Types/model';
import { check, validationResult } from 'express-validator';
import auth from '../middleware/auth.js';

const router = express.Router();

// Get authenticated user
router.get('/me', auth, async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      console.log('User ID from token:', userId);
      
      const user = await userRepository.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Don't send sensitive info back to client
      const {...userWithoutSensitiveInfo } = user;
      
      res.json(userWithoutSensitiveInfo);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Update user settings
router.patch('/settings', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { 
      contextual_drafting_enabled, 
      action_item_conversion_enabled, 
    } = req.body;
    
    const updatedUser = await userRepository.update(userId, {
      contextual_drafting_enabled,
      action_item_conversion_enabled,
    });
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't send sensitive info back to client
    const { ...userWithoutSensitiveInfo } = updatedUser;
    
    res.json(userWithoutSensitiveInfo);
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Update user profile
router.put('/profile', auth, [
  check('name', 'Name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail()
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array().join(', ') });
  }

  try {
    const userId = req.user.id;
    const { name, email } = req.body;
    
    // Check if email is already in use by another user
    if (email) {
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }
    
    const updatedUser = await userRepository.update(userId, { name, email });
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Don't send sensitive info back to client
    const { ...userWithoutSensitiveInfo } = updatedUser;
    
    res.json(userWithoutSensitiveInfo);
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Delete account
router.delete('/account', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    
    // Delete the user
    const deleted = await userRepository.delete(userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Get user email accounts
router.get('/email-accounts', auth, async (req: Request, res: Response<BackendResponse<Integration[]>>) => {
  try {
    console.log('=== EMAIL ACCOUNTS ROUTE - START ===');
    console.log('Auth source:', req.user ? 'Supabase/JWT' : 'None');
    
    const userId = req.user.id;
    console.log('User ID from auth token:', userId);
    
    if (!userId) {
        console.error('Missing user ID in request');
        return res.status(400).json({ error: 'User ID is required', isSuccess: false });
    }
    
    // Get all email accounts for the user
    console.log('Fetching email accounts for user ID:', userId);
    const accounts = await emailAccountRepository.findByUserId(userId);
    console.log(`Found ${accounts.length} email accounts for user`);

    // Log account IDs for debugging (no sensitive info)
    if (accounts.length > 0) {
      console.log('Account IDs:', accounts.map(a => a.id).join(', '));
    }

    const integrations: Integration[] = accounts.map(account => ({
        id: account.id.toString(), 
        provider: account.provider as EmailProvider,
        emailAddress: account.email_address,
        accessToken: '', // Always empty out sensitive tokens
        refreshToken: '', // Always empty out sensitive tokens
        expiresAt: account.tokens?.expiry_date ? 
            new Date(account.tokens.expiry_date).toISOString() : 
            new Date().toISOString(),
        isActive: account.is_connected || false
    }));
    
    console.log(`Returning ${integrations.length} integrations to client`);
    console.log('=== EMAIL ACCOUNTS ROUTE - END ===');
    
    return res.json({
        data: integrations,
        isSuccess: true
    });
  } catch (error) {
    console.error('=== EMAIL ACCOUNTS ROUTE - ERROR ===');
    console.error('Error fetching email accounts:', error);
    res.status(500).json({ error: 'Failed to fetch email accounts', isSuccess: false });
  }
});

export default router;