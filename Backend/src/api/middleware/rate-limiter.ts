import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Create a store to track requests
// For production, consider using a distributed store like Redis
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after a minute',
  handler: (req: Request, res: Response) => {
    console.warn('Rate limit exceeded for IP:', req.ip);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded, please try again later'
    });
  },
  // Optional: Skip rate limiting for certain requests
  skip: (req: Request) => {
    // For example, skip rate limiting for internal requests
    const internalToken = req.header('X-Internal-Token');
    return internalToken === process.env.INTERNAL_API_TOKEN;
  }
});

export { webhookLimiter };