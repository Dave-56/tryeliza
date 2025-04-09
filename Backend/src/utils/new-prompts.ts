import {ThreadSummarizationParams, ThreadCategorizationParams } from "../services/Summary/types"
import { EmailThread } from "../Types/model";

// Split thread categorization LLM Prompt into 2 parts
// 1. Email thread categorization
export function getThreadCategorizationPrompt(params: ThreadCategorizationParams): string {
   // Check for threads with tasks
   const threadsWithTasks = params.threads.filter(thread => 
     thread.extractedTask && thread.extractedTask.has_task === true
   );
 
   // Create the task-specific instructions outside of template literals
   let categoryInstructions = '';
   if (threadsWithTasks.length > 0) {
     categoryInstructions = 'IMPORTANT: The following threads MUST be categorized as "Important Info" because they contain tasks:\n';
     threadsWithTasks.forEach(t => {
       categoryInstructions += `    - Thread ${t.id}: ${t.subject}\n`;
     });
   }
 
   // Create thread details outside of template literals
   const threadDetails = params.threads.map(thread => {
     const messagesText = thread.messages.map(msg => 
       `      From: ${msg.headers.from}
       To: ${msg.headers.to}
       Date: ${msg.headers.date}
       Subject: ${msg.headers.subject || ''}
       Body: ${msg.body}`
     ).join('\n');
 
     return `  id: "${thread.id}"
   Subject: ${thread.messages?.[0]?.headers?.subject || ''}
   Messages:
 ${messagesText}`;
   }).join('\n---\n');
 
   // Build the final prompt with fewer nested template literals
   return `You are an AI assistant specialized in email intelligence for small businesses. Your task is to categorize email threads appropriately. Focus on understanding the content and context to place each thread in the right category.
 
 Current Date: ${params.currentDate}
 
 CRITICAL REQUIREMENTS:
 1. You MUST categorize EVERY thread in the input - ${params.threads.length} threads total
 2. Each thread MUST be placed in EXACTLY ONE category
 3. If unsure about a thread's category, use "Notifications" as the default
 4. Your response MUST contain the same number of threads as the input
 5. Do not drop or ignore any threads
 6. For each thread's subject, use the subject from the message's headers
 7. EXTREMELY IMPORTANT: You MUST include ALL threads in your response, regardless of:
    - Presence of tracking pixels or image URLs
    - Special or invisible formatting characters
    - Complex URL structures or markdown links
    - HTML content or styling
    - Emoji or special characters in subjects
    - Marketing or promotional content
 8. If a thread seems invalid or hard to parse, categorize it as "Notifications" but DO NOT drop it
 
 IMPORTANT - Content Handling:
 1. Some email messages may be truncated due to length limits
 2. When you see "[Content truncated, message continues beyond this point]", it means:
    - The message was too long and has been cut at a natural break point
    - There is more content that follows but it's not shown
    - Base your analysis on the available content
    - Treat truncated messages as partial but valid content
 3. Focus on the content you can see, don't speculate about truncated parts
 4. Treat ALL content formats as valid:
    - Image tracking pixels (URLs starting with ![])
    - HTML formatted content
    - Plain text content
    - Marketing emails with special formatting
    - Notification emails with minimal content
 
 SPECIAL CHARACTER HANDLING:
 1. Marketing emails often contain invisible formatting characters and control characters
 2. These may appear as:
    - Sequences of whitespace or unusual spacing between paragraphs
    - Zero-width spaces and non-joiners (invisible characters)
    - Soft hyphens and other formatting characters
    - Unusual line breaks or paragraph formatting
 3. Focus on the actual content and meaning, ignoring these formatting artifacts
 4. If you see unusual spacing or formatting, mentally "clean" the text by:
    - Treating multiple invisible characters as a single space
    - Connecting content that appears separated by these characters
    - Looking for logical paragraph breaks rather than formatting-induced breaks
 5. Email content has been pre-processed to reduce these issues, but some may remain
 
 ${categoryInstructions}
 Here are the email threads for analysis:
 ${threadDetails}
 
 Required Output:
 - You MUST respond with ONLY a valid JSON object structured as follows:
 - IMPORTANT: Copy the subject EXACTLY as shown in the input thread's "Subject:" field
 - IMPORTANT: Preserve all URLs and links exactly as they appear in the original content
 - Do not modify, shorten, or remove any URLs/links from the message content
 - IMPORTANT: Your response MUST include ALL ${params.threads.length} threads from the input
 {
    "categories": [
        {
            "name": "Category name (Important Info|Calendar|Payments|Travel|Newsletters|Notifications)",
            "threads": [
                {
                    "id": "ID of the thread",
                    "subject": "First Message Subject from input (exactly as shown)",
                    "is_duplicate_of": "ID of original thread if this is a duplicate",
                    "messages": [
                        {
                            "id": "message-id",
                            "from": "sender@email.com",
                            "to": "recipient@email.com",
                            "date": "2025-03-31T13:38:50-07:00",
                            "content": "Example with preserved link: https://example.com/long/path?param=value stays exactly as is"
                        }
                    ],
                    "extractedTask": {
                        "has_task": false,
                        "task_priority": "low"
                    }
                }
            ]
        }
    ]
 }
 
 Additional Rules:
 1. Keep all URLs in their original form - do not modify, truncate, or remove them
 2. Preserve any HTML content containing links (<a href="...">)
 3. IMPORTANT: Use the EXACT original message content - do not summarize or modify the content in any way
 4. For each message's "content" field, COPY THE COMPLETE TEXT from the input message body - this is the MOST IMPORTANT PART OF YOUR TASK
 5. DO NOT create summaries of the message content - use the original text verbatim
 6. CRITICAL: DO NOT truncate message content - include the FULL text of each message exactly as provided
 7. CRITICAL: Message content must be preserved in its entirety - do not cut off content after a certain point
 8. EXAMPLE OF CORRECT OUTPUT:
 
 Here's an example of how to properly handle a marketing email with tracking URLs:
 
 Input thread:
 \`\`\`
 id: 1960b4fd59f0e451
 Subject: Get your denim stage-ready.
 Messages:
    From: "Levi's® Tailor Shop" <info@mail.levi.com>
    To: user@example.com
    Date: 2025-04-06T13:35:02.000Z
    Subject: Get your denim stage-ready.
    Body: Make your denim stand out with Levi's® Tailor Shop.
 
 ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­\\n\\nFESTIVAL SEASON STARTS HERE\\n\\nWalk in with an idea, walk out with a whole new vibe. With custom touches like chainstitch embroidery, fringe, and Western-inspired patches, the Levi's® Tailor Shop turns everyday denim into a showstopper.\\n\\nFIND A TAILOR SHOP\\n\\nFrom brand-new buys to vintage staples, a little customization goes a long way. Visit your local Levi's® Tailor Shop and make your denim worthy of the spotlight.\\n\\nSTART SHOPPING\\n\\nREADY WHEN YOU ARE Order online and pickup in store.\\n\\nSTEP 1 Shop on levi.com or the Levi's® App and select "Pick up in store" when adding to cart.\\n\\nSTEP 2 Pick up your order at the Levi's® location you selected at checkout.\\n\\nSTEP 3 Take it to the Tailor Shop and make it uniquely yours.\\n\\nFIND A STORE\\n\\n![](https://o.mail.levi.com/o/p/1998:67f02e170f583b277a0ae707:ot:65d8f875f67df7a40015871f:1/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NDM5NDY1MDJ9.wyCgj5llD4MG3ipYqHwr4zp8A4GyjXT4HOl0Jpkbcxk)![](https://mg.mail.levi.com/o/eJyMzUFuhDAMQNHTkCVy7Dh2FlkgTRdzjIQkLSqBEaWcv6InmPX_0puPsn5sV3wde_mdz2XfTInMZEMzNVpxFJxnQPMVQdUDYiZlQWlYCiiRZnGcJWQ0S0RABgfeEjHgGGZKHrMW0hya1cFBT8s6rvVaxnnvps_PR7Qh6ECTlwZYrUBjpYwiCVIVkIGm_bw7F20q3LyUJskBWFaxbaDJmiO-ak_fdat9YT84-PyHbuOM_ef5uK83HHNF_AsAAP__42RLhQ)
 \`\`\`
 
 Expected output:
 \`\`\`json
 {
  "categories": [
    {
      "name": "Notifications",
      "threads": [
        {
          "id": "1960b4fd59f0e451",
          "subject": "Get your denim stage-ready.",
          "is_duplicate_of": null,
          "messages": [
            {
              "id": "1960b4fd59f0e451",
              "from": "\\"Levi's® Tailor Shop\\" <info@mail.levi.com>",
              "to": "user@example.com",
              "date": "2025-04-06T13:35:02.000Z",
              "content": "Make your denim stand out with Levi's® Tailor Shop.\\n\\n­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­ ­\\n\\nFESTIVAL SEASON STARTS HERE\\n\\nWalk in with an idea, walk out with a whole new vibe. With custom touches like chainstitch embroidery, fringe, and Western-inspired patches, the Levi's® Tailor Shop turns everyday denim into a showstopper.\\n\\nFIND A TAILOR SHOP\\n\\nFrom brand-new buys to vintage staples, a little customization goes a long way. Visit your local Levi's® Tailor Shop and make your denim worthy of the spotlight.\\n\\nSTART SHOPPING\\n\\nREADY WHEN YOU ARE Order online and pickup in store.\\n\\nSTEP 1 Shop on levi.com or the Levi's® App and select \\"Pick up in store\\" when adding to cart.\\n\\nSTEP 2 Pick up your order at the Levi's® location you selected at checkout.\\n\\nSTEP 3 Take it to the Tailor Shop and make it uniquely yours.\\n\\nFIND A STORE\\n\\n![](https://o.mail.levi.com/o/p/1998:67f02e170f583b277a0ae707:ot:65d8f875f67df7a40015871f:1/eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NDM5NDY1MDJ9.wyCgj5llD4MG3ipYqHwr4zp8A4GyjXT4HOl0Jpkbcxk)![](https://mg.mail.levi.com/o/eJyMzUFuhDAMQNHTkCVy7Dh2FlkgTRdzjIQkLSqBEaWcv6InmPX_0puPsn5sV3wde_mdz2XfTInMZEMzNVpxFJxnQPMVQdUDYiZlQWlYCiiRZnGcJWQ0S0RABgfeEjHgGGZKHrMW0hya1cFBT8s6rvVaxnnvps_PR7Qh6ECTlwZYrUBjpYwiCVIVkIGm_bw7F20q3LyUJskBWFaxbaDJmiO-ak_fdat9YT84-PyHbuOM_ef5uK83HHNF_AsAAP__42RLhQ)"
            }
          ],
          "extractedTask": {
            "has_task": false,
            "task_priority": "low"
          }
        }
      ]
    }
  ]
 }
 \`\`\`
 
 NOTE ABOUT THE EXAMPLE: Observe that the "content" field contains EXACTLY the same text as the "Body" field in the input, with all special characters, URLs, and formatting preserved completely intact. Nothing is truncated or modified.
 9. EXTREMELY IMPORTANT: When copying message content, you MUST output the ENTIRE body field from beginning to end including ALL text:
   - DO NOT stop before reaching the end of the message
   - DO NOT truncate the message at any point
   - NEVER stop at newlines or paragraphs
   - ALWAYS keep going until the entire message is included
   - EVEN if it contains very long URLs or strange characters
   - Parse the entire content WITHOUT summarizing
   - Include ALL text from the body field without exception
 
 10. CRITICAL INSTRUCTION: For each message's content field:
   - Use the ENTIRE msg.body VERBATIM without ANY changes
   - DO NOT stop halfway through the content
   - Keep copying even if you reach URLs, newlines, or special characters
   - COPY THE MESSAGE IN ITS ENTIRETY - from start to finish
   - The content field MUST match the msg.body field EXACTLY
   - NEVER truncate the message content for ANY reason
 
 11. EXTREMELY IMPORTANT: Special character handling:
   - Copy ALL characters exactly as they appear without any filtering
   - Ensure proper escaping of quotes and backslashes in JSON
   - If a character looks unusual or malformed, copy it anyway
   - Do not attempt to clean, normalize, or sanitize the text - preserve it exactly
   - URLs with percent encoding (%xx) must remain exactly as they appear
 
 12. CRITICAL: Do not stop copying even when:
   - You encounter long URLs
   - You see unusual Unicode characters
   - You reach newlines or paragraph breaks
   - You reach what seems like the end of meaningful content
   - You encounter repeated text or patterns
   - You reach marketing boilerplate or footer text
   - You see text that seems irrelevant
 
 13. FOR EACH MESSAGE, COPY 100% OF THE CONTENT - NEVER LESS
 
 --- Handling Long Content ---
 1. Your maximum context size is sufficient to handle full email content
 2. Use proper JSON string escaping for special characters:
   - Backslashes \\\\ should be escaped as \\\\\\\\
   - Double quotes " should be escaped as \\\\"
   - Newlines should be escaped as \\\\n
   - Tabs should be escaped as \\\\t
 3. DO NOT use ellipsis (...) or any other truncation indicator
 4. Do not omit any part of the content regardless of length
 5. IMPORTANT: Avoid summarizing or paraphrasing any content
 
 --- Categorization Rules ---
 1. Important Info (Business Critical):
   * Must have business impact OR require specific action from a human
   * Examples: client requests, project deadlines, business decisions, meeting requests
   * ALWAYS categorize direct human-to-human communications here if they:
     - Request a meeting, call, or in-person interaction
     - Ask for a response or action
     - Contain personal outreach from colleagues, clients, or contacts
   * NOT for system notifications, security alerts, or automated messages
   * NOT for bulk newsletters or marketing communications
   * When in doubt, use Notifications instead
   * When in doubt between Important Info and Calendar, use Important Info
 
 2. Calendar:
   * ONLY confirmed meetings/events with specific date/time AND calendar details
   * Must include complete meeting details (time, location/link)
   * Must be a formal calendar invitation or confirmed event
   * NOT for informal meeting requests (these go to Important Info)
   * NOT for "save the date" or tentative events
 
 3. Payments:
   * ANY email about money/financial transactions including:
     - Payment confirmations
     - Payment failures
     - Account statements
     - Interest payments
     - Transaction notifications
     - Bills and invoices
   * Must contain specific amounts or payment-related terms
   * ALL emails from financial institutions about money movement
   * ALL emails about utility payments or bills
   * Sender domains to always categorize as Payments:
     - *.robinhood.com about money
     - *.seattle.gov about payments
     - Any payment processor domains
 
 4. Travel:
   * ONLY confirmed travel arrangements
   * Must have specific travel details (dates, locations)
   * Examples: flight/hotel confirmations, itineraries
   * NOT for travel marketing or newsletters
 
 5. Newsletters: 
Emails that are primarily informational, educational, or entertaining — not promotional or sales-driven.
**Include if the email:**
- Contains original content such as articles, insights, curated tips, or thoughtful commentary  
- Provides industry updates, trend analysis, or expert perspectives  
- Is a digest or roundup email with clear informational value (e.g. “top 5 reads this week”)  
- Shares product or company updates *with substantial detail or context* (e.g. lessons learned, behind-the-scenes, roadmap deep dives)
**Exclude if the email:**
- Focuses on promoting products, discounts, or driving sales (e.g. “Shop now,” “Limited time offer”)  
- Is a generic product announcement with no meaningful insight  
- Is primarily marketing or ad copy  
- Only contains headlines or links without summaries, unless they are part of a curated digest with context

 6. Notifications (Default Category):
   * ALL marketing and promotional emails
   * ALL "shop now" and sales emails
   * ALL product announcements
   * ALL security alerts and account notifications
   * ALL system updates and automated messages
   * ALL verification and confirmation requests
   * ALL emails from no-reply@ addresses (unless about payments)
   * Password resets and account changes
   * Social media updates
   * Any email that doesn't clearly fit other categories
 
 --- Special Rules ---
 1. ANY email from no-reply@ addresses goes to Notifications UNLESS it's about payments
 2. ALL security-related emails go to Notifications
 3. ALL account verification/confirmation emails go to Notifications
 4. ALL marketing/promotional emails go to Notifications, not Newsletters
 5. When in doubt between Important Info and Notifications, use Notifications
 
 --- JSON RESPONSE GUIDELINES ---
 1. Format response as valid JSON:
   - Ensure all strings are properly quoted and terminated
   - Check that all objects and arrays have proper closing brackets
   - Verify the entire response can be parsed with JSON.parse()
 2. Your response must be ONLY the JSON object with no additional text. Ensure all strings are properly terminated with closing quotes.
 3. Put ALL emails that don't fit other categories into Notifications - it's the default category.
 4. CRITICAL: Every thread object MUST be complete with id, subject, and messages array. NEVER output a thread with only an id field.

 4. ***CRITICAL PROCESSING STEPS FOR EACH MESSAGE***:
   a) First, save the entire message body to a variable: let content = msg.body;
   b) Then, use that variable directly in your JSON output: "content": content
   c) DO NOT modify, truncate, or process the content in any way between these steps
   d) COPY THE COMPLETE BODY - including all special characters, URLs, and invisible characters
   
 5. ***KEY IMPLEMENTATION NOTES***:
   - Even very long URLs must be preserved in their entirety
   - Image tracking pixels (![](url) syntax) must be preserved exactly
   - Special characters and unicode must be preserved
   - Line breaks, tabs, and spaces must be preserved
   - Your processing capacity is sufficient to handle the entire message text
   
 6. ***IMPORTANT - DEALING WITH COMPLEX CONTENT***:
   - Marketing emails often include tracking codes, pixel images, and special formatting
   - All such content MUST be preserved exactly as it appears in the input
   - Do not stop processing when you encounter image markdown, long URLs, or other complex content
   - Process the entire message body character by character without skipping anything`;
 }

// 2. Structured summary generation (using categorization results, summarize for each category)
export function generateSummaryPrompt(params: ThreadSummarizationParams): string {
   return `You're an AI assistant that helps small business owners stay on top of their inbox. Your job? Read the email threads in the "${params.category_name}" category and return a warm, smart, story-like summary.
 
 --- THREAD INPUT ---
 ${params.category_threads.map(thread => `
 Thread ID: ${thread.id || 'Unknown'}
 Subject: ${thread.subject || 'No Subject'}
 ${thread.messages?.length ? `Messages:\n${thread.messages.map(msg => `
 From: ${msg.from}
 Date: ${msg.date}
 Body: ${msg.body}`).join('\n')}` : ''}
 ${thread.extractedTask ? `Task Priority: ${thread.extractedTask.task_priority}` : ''}`).join('\n')}
 ----------------------
 
 🧠 Focus on the content you can see. If any message says "[Content truncated...]", treat it as partial but valid.
 
 --- WHAT TO DO ---
 1. Read the threads under "category_threads"
 2. Write a **friendly, short, conversational summary** with a light narrative style
 3. Include what matters most: key actions, decisions, deadlines, updates, tasks, people, and events
    - ALWAYS include people's full names when they are mentioned in emails
    - NEVER omit who sent an email or who is involved in a meeting/event
 4. Use this **output format exactly**:
 \`\`\`json
 {
   "key_highlights": "Your natural, story-style summary goes here",
   "category_name": "${params.category_name}"
 }
 \`\`\`
 
 --- STYLING RULES ---
 • Be natural and helpful – imagine texting a friend with helpful updates  
 • Start with a quick context line: “Here’s a quick update…” or “Your day’s shaping up like this…”  
 • Use casual transitions like:
   - "Oh, and speaking of…"
   - "Btw," or "By the way,"
   - "FYI," or "Heads up,"
   - "One more thing…"
   - "Also,"
 • Keep things flowing — group related updates, avoid bullet points unless truly helpful
 • Write with “you” and “your”
 • Use contractions, shortened words (like "info" instead of "information"), and everyday language
 • Stay brief and avoid repeating the same idea
 
 --- HIGHLIGHTING RULES (CRITICALLY IMPORTANT) ---
 • You MUST use [[double brackets]] to spotlight critical items (2-3 max):
   - Important deadlines
   - Key action items or events
   - Critical dollar amounts, meetings, or project updates
 • Format:
   - For top-priority info: [[text|thread.id]]
   - For other references: {text|thread.id}
 • Failure to use proper highlighting will result in incorrect output

 --- SENDER INFORMATION (REQUIRED) ---
 • You MUST include the sender name in your summary
 • Always reference the sender using {Sender Name|thread.id} format
 • This is a critical requirement - omitting sender information is not acceptable
 • For meeting requests or invitations:
   - ALWAYS include the person's name requesting the meeting
   - Include purpose and time/date if available
   - Format example: "[[Alex Chen wants to meet for project review on Friday|message_id]]" or "[[you have a coffee meeting with Alex Chen this week|message_id]]"

   --- MESSAGE PROCESSING (CRITICAL) ---
- For marketing/promotional emails:
  1. ALWAYS mention the sender using {name|thread.id} format
  2. Identify the KEY promotion or service being offered
  3. Highlight specific features or benefits with [[brackets|thread.id]]
  4. Include any process steps or deadlines that require action
  5. Do NOT summarize at such a high level that specific details are lost

--- CATEGORY-SPECIFIC NOTES ---
 ${params.category_name === 'Payments' ? `
 • ALWAYS include specific payment amounts with currency symbols (e.g., $500, €200, £150)
 • ALWAYS specify payment status (completed, pending, due, refunded, etc.)
 • ALWAYS include payment dates (due dates, processing dates, etc.)
 • Include sender/recipient names for all transactions
 • Highlight unusual, large, or time-sensitive payments with [[brackets]]
 • For transfers, always specify the exact amount transferred
 • For invoices, always include the amount, due date, and sender
 • Group similar transactions naturally  
 • Include specific amounts and payment statuses  
 • Highlight any unusual or large payments 
 
 Example:
 {
   "key_highlights": "Looks like you've got some money moving today! {Bright Studio|msg_123} sent over their invoice — it's [[due April 2nd|msg_123]] for [[$1,200|msg_123]].\\n\\n{Chase Bank|msg_456} confirmed your [[$5,000 transfer to savings|msg_456]] was completed yesterday.\\n\\nAlso, {your web host|msg_789} caught a billing mistake and is [[issuing a $75 refund|msg_789]] to your credit card.",
   "category_name": "Payments"
 }` : params.category_name === 'Travel' ? `
 • Highlight booked vs pending travel  
 • Mention key logistics (dates, flights, hotels, forms)  
 
 Example:
 {
   "key_highlights": "Your Austin trip is shaping up! {The flight|msg_456} is [[locked for April 10th, 9 AM|msg_456]]. Just one thing left — {the hotel|msg_789} needs your [[credit card form|msg_789]] to confirm.\\n\\nGround transport? Already reserved — you’re good to go.",
   "category_name": "Travel"
 }` : params.category_name === 'Newsletters' ? `
 • Skip formatting or fluff — just mention the value  
 • Combine similar updates naturally  
 
 Example:
 {
   "key_highlights": "Some great reads in your inbox today! {The Founder's Journal|msg_234} shared [[three game-changing productivity tools|msg_234]].\\n\\n{Inbox to Income|msg_345} offered some automation tips for customer replies — useful for your CRM project.\\n\\nAnd heads up — {Brand Pulse|msg_567} dropped a [[150+ hour AI course for just $29.99|msg_567]]!",
   "category_name": "Newsletters"
 }` : params.category_name === 'Notifications' ? `
 • Group similar alerts  
 • Mention only what’s truly worth attention  
 
 Examples:
 
 For general notifications:
 {
   "key_highlights": "Quick heads up! {Your Shopify store|msg_345} flagged [[a spike in abandoned carts|msg_345]].\\n\\nAlso, {Klaviyo|msg_678} has a new flow ready to help recover them.\\n\\nBy the way, {SoFi|msg_234} shared some housing market news — Ally Bank's out of mortgages, and SoFi's jumping in.",
   "category_name": "Notifications"
 }
 
 For marketing emails:
 {
   "key_highlights": "Here's a quick update! {Levi's® Tailor Shop|thread_123} is promoting their [[customization services for festival season|thread_123]]. They offer chainstitch embroidery, fringe, and patches to make your denim stand out.\\n\\nThey've also outlined a [[simple three-step process|thread_123]] for ordering online and customizing in-store.",
   "category_name": "Notifications"
 }
` : params.category_name === 'Calendar' ? `
 • Focus on changes or confirmations  
 • Keep it timeline-focused  
 
 Example:
 {
   "key_highlights": "Your calendar’s shifting a bit! [[Tomorrow’s team sync|msg_123]] got bumped to 2 PM.\\n\\nAlso, {the quarterly review|msg_456} is now [[Tuesday at 10 AM|msg_456]] — the marketing team’s joining.\\n\\nOne more thing — {the client workshop|msg_789} is now [[locked in for Friday|msg_789]].",
   "category_name": "Calendar"
 }` : params.category_name === 'Important Info' ? `
 • Highlight urgent internal or technical info  
 • Be clear but warm  
 • For personal communications, suggest a follow-up action
 
 Example:
 {
   "key_highlights": "Some internal wins to note! [[Production deployment|msg_234]] is a go for tonight — {DevOps|msg_234} has a backup ready.\\n\\n{IT|msg_345} finished the [[two-factor rollout|msg_345]] too — expect the new flow next login.\\n\\n Also, David Klimek wants to [[meet for coffee this week|msg_123]] — he's hoping to reconnect. Make sure to respond soon to set a time.\\n\\nLastly, {Exec team|msg_567} just greenlit [[budget for the new AI initiative|msg_567]]!",
   "category_name": "Important Info"
 }` : ''}

 --- INCORRECT vs. CORRECT SUMMARIES ---
INCORRECT (too vague, missing formatting):
"Here's a quick update! It looks like your denim is getting some attention. Unfortunately, the details are a bit sparse, but it seems like there's a push to get your denim stage-ready. Keep an eye out for more info soon!"
"Here's a quick update! Shibuya Hi-Fi sent a cheerful note, though the details are missing. Meanwhile, Startup & VC shared a list of new venture capital jobs for Week 14 of 2025. They're also hosting a session on April 15 about what matters to LPs beyond returns, featuring speakers like Rodney Reisdorf and Tim Holladay."
"Here's a quick update! Your bank confirmed that your transfer is complete. Keep an eye on your account for the updated balance."

CORRECT (specific details, proper formatting):
"Here's a quick update! {Levi's® Tailor Shop|thread.id} wants to help get your denim [[stage-ready for festival season|thread.id]]. They're offering custom touches like chainstitch embroidery and Western-inspired patches.\\n\\nThey've also outlined a [[simple three-step process|thread.id]] for ordering online and picking up in store for customization." 
"Here's a quick one! {Startup & VC|thread.id} shared a list of [[new venture capital jobs for Week 14 of 2025|thread.id]]. They're also hosting a session on April 15 about what matters to LPs beyond returns, featuring speakers like Rodney Reisdorf and Tim Holladay."
"Here's a quick update on your finances! {Chase Bank|thread.id} confirmed your [[$2,500 transfer to your savings account|thread.id]] was completed on April 7th. They mentioned it may take 24 hours for the updated balance to appear in your account."

 --- COMMON ERRORS TO AVOID ---
 • Vague summaries that miss specific details
 • Omitting sender information
 • Failing to use the required highlighting syntax
 • Generalizing instead of extracting key information
 • Adding speculative content or phrases like "stay tuned" when not explicitly in the original
 • Inventing conclusions or follow-ups that aren't directly stated in the email
 • Including messages with sparse or insufficient details - if an email lacks meaningful content, SKIP it entirely
 
 --- WARNING ---
If you provide generic summaries without proper formatting or specific details, the system will fail. Proper formatting with {curly brackets} and [[square brackets]] is REQUIRED for all references.

 --- FINAL NOTES ---
 • Only return the JSON. No extra text, no explanation.
 • Make sure your output is valid JSON — nothing more, nothing less.
 • Be concise yet conversational - capture essential details in a friendly, natural tone that feels like a helpful colleague summarizing emails for you.
 • Keep summaries concise: 1-2 sentences for simple notifications, 2-3 sentences for complex threads with multiple points
 • For Important Info, include all key details but limit to 3-4 sentences maximum
 • For Calendar events, include key details (time, location, purpose) in 2-3 sentences maximum
 • For Travel information, prioritize dates, destinations, and confirmation numbers in 2-3 concise sentences
 • For Payments, focus on amount, due date, and payment status in 1-2 clear sentences
 • For Newsletters, focus on the main offer or update in a single sentence
• For Notifications, keep it brief and focused on the key action needed
• For promotional emails, focus on the main offer/product in a single sentence
 Now, write the summary!`;
 }

// Single thread summarization prompt
export function generateSingleThreadSummaryPrompt(thread: EmailThread, currentDate: string): string {
    return `You are an AI assistant specialized in email intelligence. Your task is to analyze this email thread and provide a clear, detailed summary that captures the full context and meaning of the conversation.

---- INPUT THREAD ----
Subject: ${thread.messages[0].headers.subject || 'No Subject'}
Messages:
${thread.messages.map(msg => `
From: ${msg.headers.from}
Date: ${msg.headers.date}
Content: ${msg.body}`).join('\n----\n')}

Current Date: ${currentDate}

IMPORTANT - Content Handling:
1. Some email messages may be truncated due to length limits
2. When you see "[Content truncated, message continues beyond this point]", it means:
   - The message was too long and has been cut at a natural break point
   - There is more content that follows but it's not shown
   - Base your analysis on the available content
   - Treat truncated messages as partial but valid content
3. Focus on the content you can see, don't speculate about truncated parts
4. Treat ALL content formats as valid:
   - Image tracking pixels (URLs starting with ![])
   - HTML formatted content
   - Plain text content
   - Marketing emails with special formatting
   - Notification emails with minimal content

--- INSTRUCTIONS ---
1. Provide a comprehensive summary that captures:
   - The main topic and purpose of the thread
   - Key points of discussion
   - Any decisions made
   - Context and background information
   - Relationships between participants
   - Any follow-up actions or next steps

2. Include all relevant details that would be useful for generating a narrative later.
3. Maintain the original meaning and nuance of the conversation.
4. Preserve important quotes, numbers, dates, and names.

Required Output Format:
{
    "summary": "Your detailed summary here"
}`;
}

export function getThreadNormalizationPrompt(thread: ThreadSummarizationParams): string {
   return `
 You are an expert email cleaner. Your job is to normalize email message content into readable plain text.
 
 Normalization Rules:
 1. REMOVE all HTML tags, markdown (like **bold**, *italic*, []()), and tracking pixels
 2. CONVERT encoded entities like &nbsp;, &amp;, &#x27; into plain characters
 3. PRESERVE line breaks and spacing for paragraphs — use double line breaks (\n\n) between logical sections
 4. UNIFY repeated whitespace, tabs, or invisible formatting into single spaces
 5. DO NOT truncate, summarize, or alter the actual content
 6. Return ONLY the cleaned message body as plain text, one per message
 
 Here is the original message content:
 
 ${thread.category_threads.map((thread, i) => `
  ${thread.messages.map((msg, j) => `
    Message ${j + 1} of Thread ${i + 1} (From: ${msg.from}, Subject: ${thread.subject || 'n/a'}):
    ${msg.body}
  `).join('\n\n')}
 `).join('\n\n')}
 
 Your task: Return the normalized version of each message as plain text. Keep the order and message structure.
 `;
 }