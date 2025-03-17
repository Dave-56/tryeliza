// Training datasets for email classification
export const emailTrainingData = {
    newsletters: [
        'special offer just for you', 'discount on our products', 'limited time sale',
        'exclusive deal', 'subscribe to our newsletter', 'weekly updates',
        'check out our new products', 'join our community', 'free trial',
        'introducing our latest product', 'pre-order now', 'book launch',
        'author signing', 'release date announced', 'early access',
        'save 20% today', 'flash sale', 'clearance items', 'promotional code',
        'use coupon code', 'membership offer', 'upgrade your subscription'
    ],

    calendar: [
        'meeting invitation', 'calendar event', 'join zoom call',
        'conference details', 'webinar registration', 'schedule update',
        'appointment reminder', 'reschedule our meeting', 'team call',
        'virtual event', 'please confirm your attendance', 'meeting agenda',
        'calendar invite', 'google meet link', 'microsoft teams meeting'
    ],

    actions: [
        'action required', 'please review', 'approval needed',
        'deadline approaching', 'urgent attention', 'response required',
        'please confirm', 'sign document', 'complete form',
        'update information', 'verify account', 'submit by',
        'follow up needed', 'your input is required', 'decision needed',
        'please discuss', 'propose solution', 'schedule meeting'
    ],

    payments: [
        'payment confirmation', 'invoice attached', 'receipt for your purchase',
        'subscription renewal', 'billing statement', 'payment due',
        'credit card charged', 'transaction details', 'order confirmation',
        'payment declined', 'update payment method', 'billing information'
    ],

    travel: [
        'flight confirmation', 'hotel reservation', 'travel itinerary',
        'booking details', 'check-in information', 'boarding pass',
        'rental car confirmation', 'trip details', 'vacation package',
        'travel insurance', 'flight status update', 'travel advisory'
    ],

    alerts: [
        'security alert', 'account notification', 'suspicious activity',
        'password reset', 'login attempt', 'security update',
        'account verification', 'unusual activity', 'important security notice',
        'two-factor authentication', 'verify your identity', 'account access',
        'job posting', 'job application', 'interview invitation',
        'career opportunity', 'recruitment', 'hiring process',
        'position opening', 'system notification', 'status change',
        'service announcement'
    ],

    promotions: [
        'special offer just for you', 'discount on our products', 'limited time sale',
        'exclusive deal', 'flash sale', 'clearance items', 'promotional code',
        'use coupon code', 'membership offer', 'upgrade your subscription',
        'save 20% today', 'new product announcement', 'introducing our latest',
        'check out our new products', 'product launch', 'survey', 'feedback request',
        'limited time offer', 'exclusive discount', 'special promotion'
    ],

    important: [
        'status report', 'policy change', 'product launch', 'project update',
        'company announcement', 'business update', 'quarterly report',
        'annual report', 'earnings report', 'financial results',
        'press release', 'important announcement', 'company news',
        'business development', 'strategic initiative'
    ]
} as const;

// Export types for type safety
export type EmailCategory = keyof typeof emailTrainingData;