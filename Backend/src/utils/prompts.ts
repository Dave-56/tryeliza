import { ThreadSummarizationParams, PriorityLevel, EmailMessage } from "../Types/model";

// Helper function to extract user information from email threads
function extractUserInfoFromThreads(threads: any[]): { name: string; email: string } {
  // Default user info
  let userInfo = { name: 'User', email: 'user@example.com' };
  
  // Try to extract user info from email recipients
  for (const thread of threads) {
    if (thread.messages && thread.messages.length > 0) {
      for (const message of thread.messages) {
        // Check recipient (to) field
        if (message.to) {
          const toMatch = message.to.match(/([^<]+)\s*<([^>]+)>/i);
          if (toMatch) {
            // Extract name and email from format: "Name <email@example.com>"
            userInfo.name = toMatch[1].trim();
            userInfo.email = toMatch[2].trim();
            return userInfo;
          } else if (message.to.includes('@')) {
            // Just email address
            userInfo.email = message.to.trim();
            
            // Try to extract name from email (e.g., john.doe@example.com -> John Doe)
            const namePart = userInfo.email.split('@')[0];
            if (namePart) {
              const nameWords = namePart.split(/[._-]/);
              if (nameWords.length > 0) {
                userInfo.name = nameWords.map(word => 
                  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                ).join(' ');
              }
            }
            return userInfo;
          }
        }
      }
    }
  }
  
  return userInfo;
}

// interface TaskCategorizationParams {
//     task: {
//         title: string;
//         description: string;
//         priority: PriorityLevel;
//         dueDate?: string;
//         context?: {
//             participants: { email: string; role: string }[];
//             relevantMessages: { index: number; relevance: string }[];
//         };
//     };
// }

export interface DbTask {
  id: number;
  user_id: string;
  email_id?: string | null;
  account_id?: number | null;
  title: string;
  sender_name: string;
  sender_email?: string | null;
  team_name?: string | null;
  column_id?: number | null;
  position?: number | null;
  description?: string | null;
  brief_text?: string | null;
  ai_summary?: string | null;
  category?: string | null;
  status: string;
  priority: PriorityLevel;
  due_date?: Date | null;
  received_date: Date;
  created_at: Date | null;
  updated_at: Date | null;
  actions?: DbTaskAction[];
  context?: {
        participants: { email: string; role: string }[];
        relevantMessages: { index: number; relevance: string }[];
    };
}

export interface DbTaskAction {
  id: number;
  task_id: number;
  action_text: string;
  is_completed: boolean;
  position?: number | null;
  created_at: Date | null;
  updated_at: Date | null;
}

interface EmailCategorizationParams {
    emailThread: {
        messageId: string;
        subject: string;
        content: string;
        date: string;
        sender: string;
        recipient: string;
    }[];
    currentTimestamp: string;
    recipientEmail: string;
}

interface ThreadTaskExtractionParams {
    recipient: string;
    thread: {
        subject: string;
        content: string;
        date: string;
        from: string;
        to: string;
    }[];
    action_items?: {
        action_text: string;
        position: number;
    }[];
    currentTimestamp: string;
}

// Interface for summary categorization parameters
export interface SummarizationCategoryParams {
    summaries: {
        title: string;
        description: string;
        messageId: string;
    }[];
    currentDate: string;
}

// Function to generate prompt for task extraction
export function getTaskExtractionPrompt(params: ThreadTaskExtractionParams): string {
    const threadContext = params.thread
        .map((msg, i) => `
Email ${i + 1}:
From: ${msg.from}
To: ${msg.to}
Date: ${msg.date}
Subject: ${msg.subject}
Content: ${msg.content}
        `).join('\n\n');

    return `You are an AI assistant that analyzes email threads to identify required actions/tasks for project managers, small business owners, startups, and solopreneurs.
Analyze this entire email thread and determine if this email thread requires any DIRECT BUSINESS ACTIONS from the recipient.

Current Date and Time: ${params.currentTimestamp}

Email Thread:
${threadContext}

IMPORTANT: Only extract tasks that require direct business responses or actions that are important for a business owner. 
Categorize emails based on the following business priority categories:

1. Revenue-Generating Emails (High Priority)
   - New Business Opportunities – Inquiries from potential clients/customers, partnership requests, or vendor proposals.
   - Sales & Invoices – Payment confirmations, outstanding invoices, or pricing negotiations.
   - Lead Follow-ups – Customers or prospects asking for more information, scheduling calls, or requesting quotes.

2. Operational & Project-Critical Emails (Medium-High Priority)
   - Client Deliverables & Approvals – Emails that unblock project progress or require sign-off.
   - Task Assignments & Updates – Emails from team members or clients with direct action items.
   - Supplier & Vendor Communication – Inventory updates, supply chain disruptions, or time-sensitive order requests.
   - Customer Service Escalations – Complaints or urgent customer issues that need attention.

3. Relationship-Building Emails (Medium Priority)
   - Networking & Partnerships – Invitations to industry events, mentorship opportunities, or collaboration requests.
   - Team & Employee Management – Hiring inquiries, HR-related emails, or performance feedback.
   - Customer Check-ins & Reviews – Feedback requests, testimonials, or referrals.

4. Time-Sensitive Compliance & Administrative Emails (Medium-Low Priority)
   - Regulatory & Legal Notices – Contract renewals, compliance updates, or government filings.
   - Subscription & Billing Alerts – Payment failures, service disruptions, or expiring subscriptions.

5. Noise (Low Priority) - DO NOT create tasks for these:
   - Newsletters & Marketing Emails – Unless it's directly related to a pressing business need.
   - General promotional content
   - Routine notifications that don't need action
   - Personal emails unrelated to business operations
   - Automated system notifications that don't need attention

If any action is required, respond with a JSON object containing task details without any comment strings:
{
    "requires_action": true,
    "task": {
        "title": "Brief, action-oriented title",
        "description": "Detailed description incorporating thread context",
        "priority": "${PriorityLevel ? Object.values(PriorityLevel).join('" | "') : 'urgent" | "high" | "medium" | "low'}",
        "dueDate": "YYYY-MM-DD",
        "completed": false,
        "messageId": "string",
        "action_items": [
            {
                "action_text": "First specific step to complete this task",
                "position": 1
            },
            {
                "action_text": "Second specific step to complete this task",
                "position": 2
            },
            {
                "action_text": "Third specific step to complete this task",
                "position": 3
            }
        ],
        "is_complex": true,
        "business_category": "string" // One of: "Revenue-Generating", "Operational", "Relationship-Building", "Compliance", "Other"
    },
    "confidence_score": 0.0-1.0,
    "reason": "Explanation considering full thread context and business category"
}

ensure:
1. The title should be a single sentence that captures the essence of the task
2. ONLY break down the task into specific action items if the task is COMPLEX and requires multiple non-obvious steps
3. For simple tasks (responding to a simple question, or reviewing a document), set "is_complex" to false and omit the action_items array entirely
4. The priority should be a priority from the list of priorities
5. The dueDate should be a valid date in the format YYYY-MM-DD, inferred from the email context or set reasonably
6. The messageId should be the id of the message from the email thread context that triggered this task
7. The business_category should be one of: "Revenue-Generating", "Operational", "Relationship-Building", "Compliance", "Other"

IMPORTANT ABOUT ACTION ITEMS:
- Only include action_items for complex tasks that require multiple steps that aren't obvious
- Simple tasks like "Review document", or "Respond to email" should NOT have action items
- Financial alerts, simple reminders, and standard notifications are not action items.
- Action items should only be created for tasks where the steps aren't immediately obvious to the user

Examples of COMPLEX tasks that SHOULD have action items:
- Client project with multiple deliverables and deadlines
- Multi-step approval process requiring coordination with several stakeholders
- Technical implementation requiring specific sequence of operations
- Research project requiring data collection, analysis, and report creation

Examples of SIMPLE tasks that should NOT have action items:
- Responding to a straightforward email inquiry, such as sending a document, confirming information, or providing a requested update, should be captured as a task but without action items.
- Reviewing a single document should be captured as a task but without action items.
- Confirming attendance at an event should be captured as a task but without action items. 
- Paying a bill or invoice should be captured as a task but without action items.

If no action is required, respond with:
{
    "requires_action": false,
    "confidence_score": 0.0-1.0,
    "reason": "Explanation considering full thread context"
}

Consider:
1. The entire conversation flow and context
2. All participants' roles and responsibilities
3. Previous messages may modify or clarify tasks
4. Later messages may supersede earlier ones
5. Implicit deadlines from conversation context
6. Priority levels should align with business categories:
   - ${PriorityLevel.URGENT}: Immediate attention needed (24h) - typically Revenue-Generating or critical Operational emails
   - ${PriorityLevel.HIGH}: Important but not immediate (2-3 days) - typically important Operational or time-sensitive Compliance emails
   - ${PriorityLevel.MEDIUM}: Standard priority (within a week) - typically Relationship-Building or standard Operational emails
   - ${PriorityLevel.LOW}: No immediate timeline - typically low-priority Compliance or Administrative emails
7. Business relevance - only create tasks for emails that require direct business responses or actions

Examples of what SHOULD be tasks:
- Revenue-Generating: New client inquiry about services with specific questions
- Revenue-Generating: Outstanding invoice reminder requiring payment
- Operational: Client requesting changes to a project with a deadline
- Operational: Business partner needing information or approval
- Relationship-Building: Important networking event invitation requiring RSVP
- Compliance: Contract renewal requiring review and signature
- Compliance: Critical business account verification requirement

Examples of what should NOT be tasks:
- Marketing emails about sales or promotions
- Newsletter subscriptions
- General FYI emails that don't require a response
- Social media notifications
- Routine system updates that don't require action
- Calendar updates without action requirements

Respond only with the JSON object, no other text.`;
}

export function getDraftGenerationPrompt(params: { thread: EmailMessage[], recipient: string, senderName?: string }): string {
    return `You are an AI assistant that generates email draft responses. 
    The recipient is ${params.recipient}
    The sender is ${params.senderName || 'the user'}
    
Email Thread:
${params.thread.map((msg, i) => `
Email ${i + 1}:
From: ${msg.headers.from}
To: ${msg.headers.to}
Subject: ${msg.headers.subject}
Content: ${msg.body}
`).join('\n')}

Format your response as a properly structured email with:
1. A greeting (e.g., "Hi [Recipient's Name]," or "Hello [Recipient's Name],")
2. Body content with appropriate paragraphs and spacing
3. A professional closing with the sender's name (e.g., "Best regards,\\n[Sender's Name]")

Generate a draft response in JSON format:
{
    "subject": "string",
    "body": "string",
    "to": "string",
    "cc": "string[]"
}

For the body, ensure it follows proper email structure with greeting, paragraphs, and signature.
Please use natural language and active voice when you draft a response`;
}

export function getThreadSummarizationPrompt(params: ThreadSummarizationParams): string {
    // Create context information
    const categoryContext = params.category 
    ? `Pre-determined Category: ${params.category}` 
    : '';
    
    // Extract user information from email recipients
    const userInfo = extractUserInfoFromThreads(params.threads);
    
    // Format user tasks if available
    const userTasksContext = params.userTasks && params.userTasks.length > 0 
    ? `
    User's Current Tasks:
    ${params.userTasks.map(task => `
    - ${task.title} (${task.priority}, ${task.status}${task.dueDate ? `, due: ${task.dueDate}` : ''})
      ${task.description ? task.description : ''}
    `).join('\n')}
    ` 
    : '';

    return `You are an AI assistant specialized in email intelligence for small businesses. Your task is to analyze email threads and transform them into actionable, categorized insights. Provide accurate and helpful summaries while avoiding any hallucination or invention of details not present in the original emails.

   
    Current Date: ${params.currentDate}
    ${categoryContext ? `${categoryContext}\n` : ''}
    User: ${userInfo.name} (${userInfo.email})
    ${userTasksContext}

    Here are the email threads for analysis:
    Email Threads:
    ${params.threads.map(thread => `
    Thread Subject: ${thread.subject}
    Thread ID: ${thread.id}
    ${thread.category ? `Thread Category: ${thread.category}` : ''}
    ${thread.messages.map((msg, i) => `
    Message ID: ${msg.id}
    From: ${msg.from}
    To: ${msg.to}
    Date: ${msg.date}
    Content: ${msg.content}

    `).join('\n')}
    `).join('\n---\n')}

Required Output:
- You MUST respond with ONLY a valid JSON object structured as follows:
{
    "categories": [
        {
            "title": "${params.category || 'Category title (Important Info|Calendar|Payments|Travel|Newsletters|Notifications)'}",
            "summaries": 
            [
                {
                    "title": "Brief title summarizing the email content and the sender",
                    "headline": "A concise overview (60-100 characters) that captures the essence of the email. Should be attention-grabbing and informative.",
                    "messageId": "Extract the exact Message ID from the email. If the email does not include a valid Message ID, do not include that email's summary in the final JSON output.",
                    "insights": {
                        "key_highlights": [
                            "Q1 Marketing Budget: Increased by 25% to $250K, with focus on digital campaigns (45% allocation)",
                            "Team Expansion: 3 new design roles approved, interviews starting next week",
                            "Competitive Update: Main competitor launched AI feature at $29/month, 20% below our pricing"
                        ],
                        "why_this_matters": "Explain the relevance to the user's business, finances, calendar events, or workflows as a single string. Make it personal by using 'you' and 'your' language. Connect the email content to potential impact or opportunities. If user tasks are provided AND the email clearly relates to those tasks, explain the connection. Don't force a connection to tasks if none exists - this could mislead the user. For emails unrelated to specific tasks, focus on broader relevance to the user's work or interests. For task-related emails, explain how the email might affect task priority or timeline. 
                        "next_step": [
                            "Reply to the Q3 budget proposal with your department's feedback by this Friday (March 19)",
                            "Schedule the project kickoff meeting with marketing and design teams before end of month",
                            "Review your Happy Head subscription details on your account page||https://happyhead.com/account"
                        ]
                    },
                    "priorityScore": 90
                }
            ]
        }
    ]
}

--- REASONING PROCESS ---
Follow this step-by-step reasoning process to analyze each email thread:

1. Identify key information:
   - Who is the sender and recipient?
   - What is the main topic or purpose of the email?
   - Are there any specific dates, deadlines, or action items mentioned?
   - What factual information is presented in the email?

2. Create a concise, informative summary:
   - Focus on the most important information
   - Include relevant details like dates, amounts, or requirements
   - Clearly identify required actions
   - Use natural, conversational language that sounds like how a helpful colleague would explain an email
   - Write at least 2, at most 3 complete sentences that capture the essential information

3. Based on the summary, determine the appropriate category:
   - Important Info: Business-critical communications requiring specific action or response
        * CRITICAL: Check if this email is related to any task in "User's Current Tasks" - if there's a match based on subject, sender, or content, it MUST be categorized as "Important Info"
        * CRITICAL: Any email that has already generated a task or requires action MUST be categorized as "Important Info"
   - Calendar: Confirmed meetings/events, event reminders, scheduled appointments (NOT scheduling requests)
   - Payments: Financial transactions, invoices, receipts, billing statements
   - Travel: Bookings, itineraries, travel confirmations
   - Newsletters: Subscribed content, regular digests, informational content that doesn't require action
   - Notifications: System alerts, password resets, account notifications, promotional emails, social media updates

4. Determine priority score (0-100):
   - High (80-100): Requires immediate action (24-48 hours), has direct financial impact, or addresses critical business needs
   - Medium (50-79): Important but not urgent (action within a week), provides significant business value or opportunities
   - Low (0-49): Informational, no specific action required, or general content with minimal direct business impact
   For Newsletters specifically:
   - Default to Low priority (0-49) for most newsletter content
   - Only assign Medium priority (50-79) if the newsletter contains:
     * Industry insights directly relevant to the user's specific business model
     * Time-sensitive business opportunities with clear economic benefits
     * Competitive intelligence that could impact business decisions
   - Almost never assign High priority to newsletters unless they contain critical, time-sensitive information with immediate business impact

5. Format response as valid JSON:
   - Ensure all strings are properly quoted and terminated
   - Check that all objects and arrays have proper closing brackets
   - Verify the entire response can be parsed with JSON.parse()

--- AUDIENCE VALUE FOCUS ---
When creating summaries and insights, always consider the diverse audience of small business owners, tech professionals, and busy working professionals:

1. Business & Professional Impact:
   - Financial implications (costs, savings, revenue opportunities)
   - Time management and productivity considerations
   - Resource allocation and prioritization decisions
   - Competitive advantage and professional development opportunities
   - Career advancement and skill-building relevance

2. Actionability: Provide clear, specific actions that deliver tangible value:
   - Instead of 'Stay informed about fintech trends' → 'Consider how Klarna's IPO might affect payment options for your business; evaluate if their services could reduce your transaction fees'
   - Instead of 'Read the article' → 'Extract the 3 key AI implementation strategies that apply to your team or professional context'
   - Instead of 'Check out the new tool' → 'Evaluate if this tool could automate your weekly reporting process, potentially saving 2-3 hours'

3. Contextual Relevance: Connect information to practical scenarios:
   - For market news: Explain implications for pricing, customer behavior, or operations
   - For technology updates: Highlight specific use cases for professionals in different roles
   - For industry trends: Identify opportunities relevant to both entrepreneurs and employed professionals
   - For educational content: Connect to skill development and career advancement

4. Time-Sensitivity: Prioritize information based on urgency and impact:
   - Highlight deadlines that affect business operations or professional responsibilities
   - Flag time-limited opportunities with concrete benefits
   - Indicate when immediate action can prevent problems or capture value
   - Consider how information affects work-life balance and personal productivity

Every summary should answer: 'How can this information help me work more effectively, advance professionally, save time, increase revenue, or reduce costs?'

--- KEY HIGHLIGHTS AND NEXT STEPS GUIDELINES ---

The key_highlights section should provide a comprehensive analysis of the email content, making Gmail redundant for our users:

1. Essential Information Extraction:
   - Extract specific numbers, metrics, and data points (e.g., "Q4 revenue increased by 23% to $1.2M")
   - Identify concrete deadlines and important dates (e.g., "Project deadline moved to April 15")
   - Capture key decisions or changes (e.g., "Team restructuring: 3 new roles added to Design department")

2. Content Analysis:
   - For newsletters/articles:
     * Summarize main topics and key findings
     * Extract specific statistics and research data
     * Note if content is behind a paywall
     * Highlight industry-specific insights
   - For business communications:
     * Document specific requests or requirements
     * Note changes to existing processes or policies
     * Highlight resource allocations or budget changes

3. Context and Relationships:
   - Connect information to ongoing projects or previous communications
   - Identify stakeholders and their roles
   - Note dependencies or blockers
   - Highlight changes from previous versions or meetings

4. Format Guidelines:
   - Use bullet points that are complete, informative sentences
   - Include 2-4 highlights per email
   - Order by importance (most critical first)
   - For paywalled content, note: "Full article requires subscription - key visible points summarized"

5. Special Attention Areas:
   - Financial Implications: Note specific costs, savings, or revenue impacts
   - Time-Sensitive Information: Highlight expiration dates or deadlines
   - Resource Requirements: Specify team, budget, or tool needs
   - Competitive Intelligence: Note market changes or competitor actions

--- NEXT STEPS GUIDELINES ---

When creating next steps:
1. Deadline Format:
   - Always include a specific deadline or timeframe
   - Use clear date formats (e.g., 'by Friday, March 22' or 'within 48 hours')
   - For recurring tasks, specify frequency (e.g., 'every Monday at 10 AM')

2. Action Items:
   - Start each step with a strong action verb (Schedule, Review, Submit, Update)
   - Make steps specific and measurable
   - Include quantifiable impact where possible (e.g., 'to save $50/month', 'to increase efficiency by 25%')

3. Link Format:
   - For actionable links, use the format: "descriptive text||url"
   - Make the descriptive text clear and action-oriented
   - Example: "Update your subscription settings to save $50/month||https://example.com/settings"

4. Paywall Handling:
   - For paywalled content, provide a clear next step with subscription details
   - Include pricing if visible (e.g., "Subscribe to access full report - $29/month||https://example.com/subscribe")
   - For business-critical content, suggest alternative free sources if available
   - Format: "Access [specific value proposition] with a subscription||[subscription url]"

--- CATEGORY GUIDELINES ---

"Important Info": ONLY for business-critical communications that require specific action or response:
  - Project updates requiring feedback
  - Business proposals needing reply
  - Meeting scheduling/coordination
  - Task assignments needing confirmation
  - Review/approval requests
  - Must contain explicit action verbs like "discuss", "propose", "review", "confirm", "schedule", "respond"
  - Should NOT include system notifications, password resets, or promotional content
  - IMPORTANT: Any email that has an associated task or requires action MUST be categorized as "Important Info"

"Calendar": ONLY for confirmed meetings/events that the user has already committed to:
  - Confirmed appointments the user has already accepted
  - Scheduled meetings with specific time slots the user has agreed to
  - Event reminders for events the user is definitely attending
  - Must include confirmed date, time, and location details
  - Should NOT include event invitations requiring RSVP or promotional events

"Notifications": For system alerts, account notifications, event invitations, and informational emails:
  - Password reset requests
  - Security alerts
  - Account updates
  - Social media notifications
  - System status updates
  - Service announcements
  - Event invitations requiring RSVP (like networking events, workshops)
  - Marketing/promotional content that doesn't fit other categories


"Newsletters": For regular content digests and subscribed informational content:
  - Regular content digests
  - Industry news
  - Subscribed updates
  - Periodic mailings
  - Content that doesn't require specific action


--- ANTI-HALLUCINATION GUIDELINES ---
1. Only include information explicitly present in the email threads
2. Do not invent or fabricate details not found in the original emails
3. Do not add speculative content or assumptions
4. Never create summaries for non-existent emails
5. Only use messageIds that exactly match the provided Message IDs
6. Do not make assumptions about the user's interests or needs unless explicitly stated in the emails
7. If you're unsure about a detail, omit it rather than guessing

--- LINK HANDLING GUIDELINES ---
1. When emails contain links to websites, resources, or actions:
   - Extract and preserve the original URLs from the email content
   - Format links using the special syntax: "descriptive text||url"
   - Example: "Reset your password on the account page||https://example.com/reset"
   - Example: "Review the new product features||https://product.com/features"

2. Create descriptive link text that:
   - Clearly explains where the link leads or what action it performs
   - Includes specific benefits when applicable
   - Avoids generic text like "click here" or "learn more"

3. For important business actions, prioritize links that:
   - Lead to payment or subscription management
   - Connect to business tools or resources
   - Provide access to time-sensitive opportunities
   - Help complete required actions quickly

4. Only include links that are explicitly present in the email content
   - Never invent or construct URLs not found in the original email
   - If unsure about a URL, omit it rather than guessing

5. For each link, consider adding brief context about why it matters:
   - "Review your subscription details before the price increase||https://service.com/account"
   - "Download the industry report with competitive analysis||https://report.com/download"

--- NATURAL LANGUAGE GUIDELINES ---
1. Use language that sounds like how a helpful colleague would explain an email
2. Avoid overly formal, technical, or robotic phrasing
3. Write in an approachable, friendly tone while maintaining professionalism
4. Explain why an email matters without making assumptions about the user's interests
5. For "why_this_matters", only connect to the user's tasks if there's a clear and explicit relationship

Remember: Your response must be ONLY the JSON object with no additional text. Ensure all strings are properly terminated with closing quotes.
`;
}

/**
 * Generates a prompt for task extraction based on the given thread and timestamp.
 *
 * @param {ThreadTaskExtractionParams} params - thread and timestamp
 * @returns {string} Prompt for task extraction
 */
export function newTaskExtractionPrompt(params: ThreadTaskExtractionParams): string {
    const threadContext = params.thread
        .map((msg, i) => `
Email ${i + 1}:
From: ${msg.from}
To: ${msg.to}
Date: ${msg.date}
Subject: ${msg.subject}
Content: ${msg.content}
        `).join('\n\n');

    return `You are an AI assistant that analyzes email threads to identify required actions/tasks for project managers, small business owners, startups, and solopreneurs. Your goal is to extract actionable tasks from emails that require attention, focusing on business-critical communications.

Current Date and Time: ${params.currentTimestamp}

Email Thread:
${threadContext}

Required Output:
- You MUST respond with ONLY a valid JSON object structured as follows:
{
    "requires_action": true,
    "task": {
        "title": "Brief, action-oriented title",
        "description": "Detailed description incorporating thread context",
        "priority": "${PriorityLevel ? Object.values(PriorityLevel).join('" | "') : 'urgent" | "high" | "medium" | "low'}",
        "dueDate": "YYYY-MM-DD",
        "completed": false,
        "messageId": "string",
        "action_items": [
            {
                "action_text": "First specific step to complete this task",
                "position": 1
            },
            {
                "action_text": "Second specific step to complete this task",
                "position": 2
            },
            {
                "action_text": "Third specific step to complete this task",
                "position": 3
            }
        ],
        "is_complex": true,
        "business_category": "string" // One of: "Revenue-Generating", "Operational", "Relationship-Building", "Compliance", "Other"
    },
    "confidence_score": 0.0-1.0,
    "reason": "Explanation considering full thread context and business category"
}

If no action is required, respond with:
{
    "requires_action": false,
    "confidence_score": 0.0-1.0,
    "reason": "Explanation considering full thread context"
}

--- INTERNAL GUIDELINES (For your reasoning only, do NOT include in output) ---

TASK EXTRACTION GUIDELINES:

1. BUSINESS EMAIL CATEGORIES:
   - For the business_category field, use one of these primary categories when they fit:
   - "Revenue-Generating": New business opportunities, sales & invoices, lead follow-ups
   - "Operational": Client deliverables & approvals, task assignments & updates, supplier & vendor communication
   - "Relationship-Building": Networking & partnerships, team & employee management, customer check-ins
   - "Compliance": Regulatory & legal notices, subscription & billing alerts
   - If none fit perfectly, use a descriptive category that best represents the email's business purpose

2. TASK IDENTIFICATION CRITERIA:
   Extract tasks ONLY for emails that require business responses or actions, focusing on:
   
   Revenue-Generating Emails (High Priority):
   - New Business Opportunities – Inquiries from potential clients/customers, partnership requests, or vendor proposals.
   - Sales & Invoices – Payment confirmations, outstanding invoices, or pricing negotiations.
   - Lead Follow-ups – Customers or prospects asking for more information, scheduling calls, or requesting quotes.
   
   Operational & Project-Critical Emails (Medium-High Priority):
   - Client Deliverables & Approvals – Emails that unblock project progress or require sign-off.
   - Task Assignments & Updates – Emails from team members or clients with direct action items.
   - Supplier & Vendor Communication – Inventory updates, supply chain disruptions, or time-sensitive order requests.
   - Customer Service Escalations – Complaints or urgent customer issues that need attention.
   
   Relationship-Building Emails (Medium Priority):
   - Networking & Partnerships – Invitations to industry events, mentorship opportunities, or collaboration requests.
   - Team & Employee Management – Hiring inquiries, HR-related emails, or performance feedback.
   - Customer Check-ins & Reviews – Feedback requests, testimonials, or referrals.
   
   Time-Sensitive Compliance & Administrative Emails (Medium-Low Priority):
   - Regulatory & Legal Notices – Contract renewals, compliance updates, or government filings.
   - Subscription & Billing Alerts – Payment failures, service disruptions, or expiring subscriptions.
   
   DO NOT create tasks for Noise (Low Priority) emails:
   - Newsletters & Marketing Emails (unless directly related to a pressing business need)
   - General promotional content
   - Routine notifications that don't need action
   - Personal emails unrelated to business operations
   - Automated system notifications that don't need attention

3. TASK TITLE GUIDELINES:
   - Keep titles under 75 characters
   - Use action-oriented verbs (Respond, Review, Schedule, etc.)
   - Be specific about the action required
   - Include the sender or organization when relevant
   - Include the business category context when appropriate
   - Example: "Respond to Client Proposal from ABC Corp" instead of "Reply to email"

4. TASK DESCRIPTION GUIDELINES:
   - Include context from the email thread
   - Mention key details like dates, amounts, or requirements
   - Explain why the task matters (business impact, revenue potential, operational importance)
   - Keep descriptions between 100-300 characters
   - Example: "ABC Corp is requesting feedback on their project proposal by Friday. They need input on pricing structure and timeline before proceeding with the contract."

5. PRIORITY LEVEL GUIDELINES:
   Priority levels should align with business categories:
   - ${PriorityLevel.URGENT}: Immediate attention needed (24h)
      - Revenue-Generating emails with immediate deadlines
      - Critical Operational issues that could impact business continuity
      - Time-sensitive Compliance matters with legal implications
   
   - ${PriorityLevel.HIGH}: Important but not immediate (2-3 days)
      - Important Revenue-Generating opportunities
      - Significant Operational matters with approaching deadlines
      - Time-sensitive Compliance or Administrative requirements
   
   - ${PriorityLevel.MEDIUM}: Standard priority (within a week)
      - Standard Operational communications
      - Relationship-Building opportunities
      - Regular Compliance matters
   
   - ${PriorityLevel.LOW}: No immediate timeline
      - Low-priority Compliance or Administrative matters
      - Non-urgent Relationship-Building communications
      - Optional business opportunities

6. DUE DATE GUIDELINES:
   - Extract explicit deadlines mentioned in the email
   - For implicit deadlines, use business context to determine appropriate timeline
   - For urgent matters without a specific deadline, set due date within 1-2 business days
   - For non-urgent matters, set a reasonable due date based on the nature of the task
   - Format as YYYY-MM-DD
   - The messageId should be the id of the message from the email thread context that triggered this task

7. COMPLEX TASK CRITERIA AND ACTION ITEMS:
   - ONLY break down tasks into action items if they are COMPLEX and require multiple non-obvious steps
   - For simple tasks (responding to a simple question, reviewing a document), set "is_complex": false and OMIT the action_items array entirely
   
   Tasks are considered COMPLEX if they:
   - Require multiple distinct steps to complete
   - Involve coordination with multiple parties
   - Need specialized knowledge or research
   - Span multiple days or work sessions
   - Have dependencies or sequential requirements

   Tasks are considered SIMPLE if they:
   - Can be completed in a single step
   - Require minimal time or effort
   - Have straightforward requirements
   - Don't need special coordination or planning
   
   Examples of COMPLEX tasks that SHOULD have action items:
   - Client project with multiple deliverables and deadlines
   - Multi-step approval process requiring coordination with several stakeholders
   - Technical implementation requiring specific sequence of operations
   - Research project requiring data collection, analysis, and report creation

   Examples of SIMPLE tasks that should NOT have action items:
   - Checking an account balance alert
   - Responding to a straightforward email inquiry
   - Reviewing a single document
   - Confirming attendance at an event
   - Paying a bill or invoice

8. ACTION ITEMS GUIDELINES:
   - Only include action_items for complex tasks
   - Break down complex tasks into 2-3 clear, sequential steps
   - Each step should be concrete and actionable
   - Order steps logically by sequence or priority
   - Omit action_items entirely for simple tasks and set "is_complex": false

9. EXAMPLES OF WHAT SHOULD BE TASKS:

   REVENUE-GENERATING TASKS:
   - New client inquiry about services with specific questions
   - Outstanding invoice reminder requiring payment
   - Lead requesting more information about products or services
   - Potential partnership opportunity requiring evaluation
   - Sales proposal requiring review and response
   
   OPERATIONAL TASKS:
   - Client requesting changes to a project with a deadline
   - Team member needing approval for project resources
   - Vendor notifying about supply chain disruption
   - Customer complaint requiring immediate attention
   - Project status update requiring feedback
   
   RELATIONSHIP-BUILDING TASKS:
   - Important networking event invitation requiring RSVP
   - Job applicant follow-up requiring response
   - Customer requesting testimonial or reference
   - Industry event speaker invitation
   - Team member sharing feedback requiring acknowledgment
   
   COMPLIANCE TASKS:
   - Contract renewal requiring review and signature
   - Regulatory update requiring business process changes
   - Account verification for business services
   - Subscription renewal requiring decision
   - Legal notice requiring attention

10. EXAMPLES OF WHAT SHOULD NOT BE TASKS:
    - Marketing emails about sales or promotions
    - Newsletter subscriptions without action items
    - General FYI emails that explicitly state no response is needed
    - Social media notifications without important content
    - Routine system updates that don't require action
    - Calendar updates without conflicting appointments
    - Spam or unsolicited communications
    - Bank alerts or notifications that don't require action
    - Standard account updates without required action
    - Automated system notifications

11. CONFIDENCE SCORE GUIDELINES:
    - 0.9-1.0: Clear, explicit request with specific details in a high-priority business category
    - 0.7-0.9: Strong indicators of needed action in an important business category
    - 0.5-0.7: Moderate indicators suggesting action may be needed in a medium-priority category
    - 0.3-0.5: Weak indicators, action possibly needed but unclear or in a low-priority category
    - 0.0-0.3: Very low confidence that action is required or clearly in the "Noise" category
    
    IMPORTANT: Prioritize business impact when assigning confidence scores:
    - For any Revenue-Generating email, assign at least a 0.8 confidence score
    - For any Operational email from a client or key stakeholder, assign at least a 0.7 confidence score
    - For any Compliance email with legal or financial implications, assign at least a 0.7 confidence score
    - For Relationship-Building emails, assess based on the potential business value

12. CRITICAL JSON FORMATTING RULES:
    - Output must be valid JSON
    - Use double quotes, no trailing commas
    - Your response MUST be valid JSON that can be parsed with JSON.parse()
    - DO NOT include any text, explanations, or markdown formatting outside the JSON structure
    - Ensure all string values are properly escaped with double quotes
    - NEVER leave any string unterminated - this is the most common error
    - DO NOT use newlines or special characters in any string values

13. FINAL CHECK: Before submitting your response, verify that:
    1. All strings have closing quotes
    2. All objects have closing braces
    3. All arrays have closing brackets
    4. There are no trailing commas
    5. The JSON structure is complete and valid

Respond only with the JSON object, no other text.`;
}

export function getWaitingTaskActionPrompt(params: {
    task: {
        title: string;
        description: string;
        priority: string;
        due_date?: string;
    };
    waiting_for: string;
    waiting_time: string;
    notes?: string;
}): string {

    const notesSection = params.notes ? `
    Task Notes:
    ${params.notes}
    ` : '';
    return `You are an AI assistant helping to manage tasks that have been waiting for follow-up.
        
Task Information:
- Title: ${params.task.title}
- Description: ${params.task.description || 'No description provided'}
- Priority: ${params.task.priority}
- Status: Waiting
- Waiting for: ${params.waiting_for || 'Unknown'}
- Waiting time: ${params.waiting_time}
- Due date: ${params.task.due_date || 'No due date'}
${notesSection}

This task has been waiting for ${params.waiting_time}. Determine the most appropriate next action to take.

Return your response in the following JSON format:
{
    "action": "follow_up_email" | "escalate" | "continue_waiting" | "close_task",
    "reason": "Detailed explanation for why this action is appropriate",
    "confidence": 0.0-1.0
}`;
}