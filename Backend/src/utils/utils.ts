import { jsonrepair } from 'jsonrepair';
import { simpleParser } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import EmailReplyParser from 'email-reply-parser';
import ThreadDebugLogger from './ThreadDebugLogger';
import { SummarizationResponse } from '../Types/model';

interface EmailPayload {
    headers: { name: string; value: string }[];
    parts?: { mimeType: string; body: { data: string } }[];
    body?: { data: string };
}

interface Email {
    id: string;
    threadId: string;
    payload: EmailPayload;
    snippet: string;
    internalDate: string;
}

interface ThreadData {
    messages: Email[];
}

interface ExtractedEmailInfo {
    id: string;
    threadId: string;
    messageId?: string;
    subject?: string;
    from?: string;
    to?: string;
    date?: string;
    body: string;
    snippet: string;
    threadInfo: ThreadInfo | null;
}

interface ThreadInfo {
    messageCount: number;
    participants: string[];
    history: {
        id: string;
        timestamp: string;
        sender?: string;
        subject?: string;
        date?: string;
        body: string;
        snippet: string;
    }[];
}

interface EmailMessage {
    id: string;
    threadId?: string;
    headers: {
        subject: string;
        from: string;
        to: string;
        date: string;
    };
    body: string;
    snippet?: string;
    internalDate?: string;
    labelIds?: string[];
    historyId?: string;
}

interface EmailThread {
    messages: EmailMessage[];
}

export const encodeMessageToBase64Url = (emailMessage: string): string => {
    // Convert the email message to a Buffer
    const buffer = Buffer.from(emailMessage, 'utf-8');

    // Convert the Buffer to a base64 string
    const base64String = buffer.toString('base64');

    // Convert the base64 string to a base64url string
    const base64UrlString = base64String
        .replace(/\+/g, '-') // Replace '+' with '-'
        .replace(/\//g, '_') // Replace '/' with '_'
        .replace(/=+$/, ''); // Remove trailing '='

    return base64UrlString;
}

/**
 * Extracts relevant information from an email object.
 * 
 * @param email The email object to extract information from.
 * @param threadData Optional thread data to include in the extracted information.
 * @returns An object containing the extracted email information.
 */
export const extractEmailInfo = (email: Email, threadData?: ThreadData): ExtractedEmailInfo => {
    // Check if email and payload exist
    if (!email || !email.payload) {
        throw new Error('Invalid email structure');
    }

    const headers = email.payload.headers;
    if (!headers) {
        throw new Error('No headers found in email');
    }

    // Extract header information
    const subject = headers.find(h => h.name === 'Subject')?.value;
    const from = headers.find(h => h.name === 'From')?.value;
    const to = headers.find(h => h.name === 'To')?.value;
    const date = headers.find(h => h.name === 'Date')?.value;
    const messageId = headers.find(h => h.name === 'Message-ID')?.value;

    // Get the email body
    let body = '';
    if (email.payload.parts) {
        // Multipart message
        const textPart = email.payload.parts.find(part => part.mimeType === 'text/plain');
        body = textPart?.body?.data || '';
    } else {
        // Single part message
        body = email.payload.body?.data || '';
    }

    // Decode from base64 if body exists
    if (!body) {
        console.warn('No body found in email');
        body = ''; // or however you want to handle empty bodies
    } else {
        try {
            body = Buffer.from(body, 'base64').toString('utf-8');
        } catch (error) {
            console.error('Error decoding email body:', error);
            body = ''; // or handle the error differently
        }
    }

    // Process thread data if available
    let threadInfo: ThreadInfo | null = null;
    if (threadData && threadData.messages) {
        const threadMessages = threadData.messages;
        const threadParticipants = new Set<string>();
        const messageHistory: ThreadInfo['history'] = [];

        threadMessages.forEach(message => {
            if (!message.payload?.headers) return;

            const messageHeaders = message.payload.headers;
            const messageSender = messageHeaders.find(h => h.name === 'From')?.value;
            const messageSubject = messageHeaders.find(h => h.name === 'Subject')?.value;
            const messageDate = messageHeaders.find(h => h.name === 'Date')?.value;

            if (messageSender) {
                threadParticipants.add(messageSender);
            }

            // Get message body
            let messageBody = '';
            if (message.payload.parts) {
                const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
                messageBody = textPart?.body?.data || '';
            } else {
                messageBody = message.payload.body?.data || '';
            }

            // Decode message body if it exists
            if (messageBody) {
                try {
                    messageBody = Buffer.from(messageBody, 'base64').toString('utf-8');
                } catch (error) {
                    console.error('Error decoding thread message body:', error);
                    messageBody = '';
                }
            }

            messageHistory.push({
                id: message.id,
                timestamp: message.internalDate,
                sender: messageSender,
                subject: messageSubject,
                date: messageDate,
                body: messageBody,
                snippet: message.snippet
            });
        });

        threadInfo = {
            messageCount: threadMessages.length,
            participants: Array.from(threadParticipants),
            history: messageHistory.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        };
    }

    // Return the extracted information
    return {
        id: email.id,
        threadId: email.threadId,
        messageId,
        subject,
        from,
        to,
        date,
        body,
        snippet: email.snippet,
        threadInfo
    };
};

// New function to extract email info from EmailMessage format
export const extractEmailInfoFromMessage = (message: EmailMessage, thread?: EmailThread): ExtractedEmailInfo => {
    // Check if message exists
    if (!message) {
        throw new Error('Invalid email message structure: message is null or undefined');
    }

    // Ensure headers exist
    if (!message.headers) {
        console.error('Message headers are missing for message:', message.id);
        // Create empty headers to avoid null reference errors
        message.headers = {
            subject: '',
            from: '',
            to: '',
            date: ''
        };
    }

    // Extract header information directly from EmailHeaders object
    const subject = message.headers.subject || '';
    const from = message.headers.from || '';
    const to = message.headers.to || '';
    const date = message.headers.date || '';
    
    // Get the email body
    const body = message.body || '';

    // Process thread data if available
    let threadInfo: ThreadInfo | null = null;
    if (thread && thread.messages && Array.isArray(thread.messages)) {
        const threadMessages = thread.messages;
        const threadParticipants = new Set<string>();
        const messageHistory: ThreadInfo['history'] = [];

        threadMessages.forEach(msg => {
            if (!msg) return; // Skip null/undefined messages
            
            // Ensure headers exist
            const msgHeaders = msg.headers || {};
            
            const messageSender = msgHeaders.from || '';
            const messageSubject = msgHeaders.subject || '';
            const messageDate = msgHeaders.date || '';

            if (messageSender) {
                threadParticipants.add(messageSender);
            }

            messageHistory.push({
                id: msg.id || '',
                timestamp: msg.internalDate || '',
                sender: messageSender,
                subject: messageSubject,
                date: messageDate,
                body: msg.body || '',
                snippet: msg.snippet || ''
            });
        });

        threadInfo = {
            messageCount: threadMessages.length,
            participants: Array.from(threadParticipants),
            history: messageHistory.sort((a, b) => {
                // Sort by timestamp if available
                if (a.timestamp && b.timestamp) {
                    return parseInt(a.timestamp) - parseInt(b.timestamp);
                }
                return 0;
            })
        };
    }

    // Return the extracted information
    return {
        id: message.id || '',
        threadId: message.threadId || '',
        messageId: '', // Not available in EmailMessage
        subject,
        from,
        to,
        date,
        body,
        snippet: message.snippet || '',
        threadInfo
    };
};

export function cleanAndParseJSON(inputString: string) {
    try {
        // Log the input for debugging
        console.log("Attempting to parse JSON input:", inputString.substring(0, 100) + (inputString.length > 100 ? "..." : ""));
        
        // Step 1: Clean the string by removing markdown code blocks if present
        let cleanedString = inputString
            .replace(/^```json\s*/g, '') // Remove leading ```json
            .replace(/^```\s*/g, '')     // Remove other code block markers
            .replace(/\s*```$/g, '')     // Remove trailing ```
            .trim();
            
        // Step 2: Check if the string is already valid JSON
        try {
            const directParse = JSON.parse(cleanedString);
            console.log("Direct JSON parsing succeeded");
            return directParse;
        } catch (directError) {
            console.log("Direct JSON parsing failed, attempting cleanup");
        }
        
        // Step 2.5: Try using jsonrepair library to fix common JSON issues
        try {
            const repairedJson = jsonrepair(cleanedString);
            const repairParsed = JSON.parse(repairedJson);
            console.log("JSON parsing succeeded using jsonrepair library");
            return repairParsed;
        } catch (repairError) {
            console.log("jsonrepair attempt failed, continuing with custom fixes");
        }

        // Step 3: Fix common JSON formatting issues
        let fixedString = cleanedString
            // Remove trailing commas in objects and arrays
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']')
            // Handle escaped quotes consistently
            .replace(/\\"/g, '__ESCAPED_QUOTE__')
            // Replace newlines within strings with space
            .replace(/"\s*\n\s*"/g, ' ')
            // Fix unterminated strings by adding missing quotes
            .replace(/"([^"]*?)(?=,\s*"[^"]*":)/g, '"$1"')
            .replace(/"([^"]*?)(?=})/g, '"$1"');
            
        // Step 4: Handle unterminated strings at the end of the JSON
        const lastQuotePos = fixedString.lastIndexOf('"');
        const lastBracePos = fixedString.lastIndexOf('}');
        const lastBracketPos = fixedString.lastIndexOf(']');
        
        if (lastQuotePos > Math.max(lastBracePos, lastBracketPos)) {
            // There's an unterminated string at the end
            fixedString = fixedString + '"';
            
            // Check if we also need to close objects/arrays
            let openBraces = (fixedString.match(/{/g) || []).length;
            let closeBraces = (fixedString.match(/}/g) || []).length;
            let openBrackets = (fixedString.match(/\[/g) || []).length;
            let closeBrackets = (fixedString.match(/\]/g) || []).length;
            
            // Add missing closing braces/brackets
            while (closeBraces < openBraces) {
                fixedString += '}';
                closeBraces++;
            }
            
            while (closeBrackets < openBrackets) {
                fixedString += ']';
                closeBrackets++;
            }
        }
        
        // Restore escaped quotes
        fixedString = fixedString.replace(/__ESCAPED_QUOTE__/g, '\\"');
        
        // Step 5: Try to parse the fixed JSON
        try {
            const parsedJSON = JSON.parse(fixedString);
            console.log("Successfully parsed JSON after fixes");
            return parsedJSON;
        } catch (error) {
            console.log("Standard fixes failed, attempting more aggressive recovery");
            
            // Step 6: For SummarizationResponse format, try to extract complete summaries
            if (cleanedString.includes('"summaries"')) {
                try {
                    // Extract summaries using regex pattern matching - more robust pattern
                    const summaryRegex = /"category"\s*:\s*"([^"]*?)"\s*,\s*"title"\s*:\s*"([^"]*?)"\s*,\s*"description"\s*:\s*"([^"]*?)"\s*,\s*"messageId"\s*:\s*"([^"]*?)"\s*,\s*"priority"\s*:\s*"([^"]*?)"\s*,\s*"timeframe"\s*:\s*"([^"]*?)"\s*,\s*"confidence"\s*:\s*([\d\.]+)/g;
                    
                    const matches = [...cleanedString.matchAll(summaryRegex)];
                    
                    if (matches.length > 0) {
                        // Reconstruct a valid JSON with complete summaries only
                        const validSummaries = matches.map(match => {
                            return {
                                category: match[1],
                                title: match[2],
                                description: match[3],
                                messageId: match[4],
                                priority: match[5],
                                timeframe: match[6],
                                confidence: parseFloat(match[7])
                            };
                        });
                        
                        console.log(`Extracted ${validSummaries.length} complete summaries from malformed JSON using regex`);
                        return { summaries: validSummaries };
                    }
                    
                    // If the standard regex fails, try a more lenient approach to catch partial summaries
                    const partialSummaryRegex = /"category"\s*:\s*"([^"]*)"\s*,\s*"title"\s*:\s*"([^"]*)"\s*,\s*"description"\s*:\s*"([^"]*)"/g;
                    const partialMatches = [...cleanedString.matchAll(partialSummaryRegex)];
                    
                    if (partialMatches.length > 0) {
                        // Reconstruct summaries with default values for missing fields
                        const partialSummaries = partialMatches.map((match, index) => {
                            return {
                                category: match[1] || "Uncategorized",
                                title: match[2] || "Untitled",
                                description: match[3] || "No description available",
                                messageId: `partial-${index}`,
                                priority: "medium",
                                timeframe: "none",
                                confidence: 0.5
                            };
                        });
                        console.log(`Extracted ${partialSummaries.length} partial summaries from malformed JSON using regex`);
                        return { summaries: partialSummaries };
                    }
                } catch (regexError) {
                    console.error("Failed to extract summaries using regex:", regexError);
                }
            }

            try {
                const summaryObjectRegex = /{[^{]*?"category"[^}]*?}/g;
                const objectMatches = [...cleanedString.matchAll(summaryObjectRegex)];
                
                if (objectMatches.length > 0) {
                    const recoveredSummaries: Array<{
                        category: string;
                        title: string;
                        description: string;
                        messageId: string;
                        priority: string;
                        timeframe: string;
                        confidence: number;
                    }> = [];
                    
                    for (const match of objectMatches) {
                        try {
                            // Try to parse each object individually
                            const fixedObject = match[0]
                                .replace(/,\s*}/g, '}') // Remove trailing commas
                                .replace(/([^\\])"([^:]*):\s*"/g, '$1"$2":"') // Fix missing quotes around property names
                                .replace(/([^\\])"([^"]*?)(?=,\s*")/g, '$1"$2"'); // Fix unterminated strings
                            
                            const summaryObj = JSON.parse(fixedObject);
                            
                            // Ensure all required fields are present
                            if (summaryObj.category && summaryObj.title) {
                                recoveredSummaries.push({
                                    category: summaryObj.category,
                                    title: summaryObj.title,
                                    description: summaryObj.description || "No description available",
                                    messageId: summaryObj.messageId || `recovered-${recoveredSummaries.length}`,
                                    priority: summaryObj.priority || "medium",
                                    timeframe: summaryObj.timeframe || "none",
                                    confidence: summaryObj.confidence || 0.5
                                });
                            }
                        } catch (objError) {
                            // Skip this object if it can't be parsed
                            console.warn("Failed to parse individual summary object:", objError);
                        }
                    }
                    
                    if (recoveredSummaries.length > 0) {
                        console.log(`Recovered ${recoveredSummaries.length} summary objects`);
                        return { summaries: recoveredSummaries };
                    }
                }
            } catch (objectError) {
                console.error("Failed to extract individual summary objects:", objectError);
            }
            
            // Step 7: Try to extract any valid JSON object
            try {
                // Look for the largest valid JSON object in the string
                const objectRegex = /{[^{}]*(?:{[^{}]*}[^{}]*)*}/g;
                const matches = [...cleanedString.matchAll(objectRegex)];
                
                if (matches.length > 0) {
                    // Find the largest match
                    let largestMatch = matches[0][0];
                    for (const match of matches) {
                        if (match[0].length > largestMatch.length) {
                            largestMatch = match[0];
                        }
                    }
                    
                    try {
                        const extractedJSON = JSON.parse(largestMatch);
                        console.log("Extracted valid JSON object from string");
                        return extractedJSON;
                    } catch (parseError) {
                        console.error("Failed to parse extracted JSON object:", parseError);
                    }
                }
            } catch (objectError) {
                console.error("Failed to extract JSON object:", objectError);
            }
            
            // Step 8: Last resort - try to extract the summaries array
            try {
                const summariesMatch = cleanedString.match(/"summaries"\s*:\s*\[\s*{[\s\S]*?}\s*\]/);
                if (summariesMatch && summariesMatch[0]) {
                    // Wrap in an object and try to parse
                    const fixedJSON = `{${summariesMatch[0]}}`;
                    try {
                        return JSON.parse(fixedJSON);
                    } catch (parseError) {
                        console.error("Failed to parse extracted summaries array:", parseError);
                    }
                }
            } catch (arrayError) {
                console.error("Failed to extract summaries array:", arrayError);
            }
            
            // If all else fails, return a default structure instead of throwing
            console.warn("All JSON parsing recovery methods failed, returning default structure");
            return { 
                summaries: [],
                isPending: false,
                generatedAt: new Date()
            };
        }
    } catch (error) {
        console.error("Error parsing JSON:", error);
        // Don't try to access inputString here as it's not in scope
        
        // Return an empty result rather than throwing to prevent crashes
        return { 
            summaries: [],
            isPending: false,
            generatedAt: new Date()
        };
    }
}

/**
 * Cleans email text by removing tracking URLs, marketing content, and other noise
 * while preserving the important information.
 * 
 * @param text The email text to clean (can be HTML or plain text)
 * @returns Cleaned text with only meaningful content, preserving the full message
 */

export async function cleanEmailText(text: string): Promise<string> {
  // Log the input text for debugging
  ThreadDebugLogger.log('Input text for cleanEmailText', {
    textType: typeof text,
    textLength: text ? text.length : 0,
    textSample: text ? text.substring(0, 100) + (text.length > 100 ? '...' : '') : 'empty'
  });
  
  if (!text) return '';
  
  try {
    // Try to parse as email first (handles HTML emails properly)
    // Convert string to Buffer for mailparser
    const parsed = await simpleParser(Buffer.from(text));
    let content = parsed.html || parsed.text || text;
    
    // If we have HTML content, process it more effectively
    if (parsed.html) {
      // Step 1: Sanitize HTML to remove scripts, tracking pixels, etc.
      content = sanitizeHtml(content as string, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          '*': ['style', 'class']
        },
        // Remove tracking pixels and scripts
        exclusiveFilter: frame => {
          if (frame.tag === 'img') {
            const src = frame.attribs.src || '';
            return src.includes('track.') || 
                   src.includes('pixel.') || 
                   src.includes('beacon.') || 
                   src.match(/\?(xtl=|xul=|eih=|__stmp=|__onlt=)/) !== null;
          }
          return false;
        }
      });
      
      // Step 2: Use cheerio to better parse the HTML
      const $ = cheerio.load(content as string);
      
      // Remove common email footer elements
      $('.footer, .email-footer, [data-marker="footer"]').remove();
      $('*:contains("Unsubscribe")').closest('div, p, table, tr').remove();
      $('*:contains("View in browser")').closest('div, p, table, tr').remove();

      // Remove common email footer elements (expanded)
        $('.footer, .email-footer, [data-marker="footer"]').remove();
        $('*:contains("Unsubscribe")').closest('div, p, table, tr, td').remove();
        $('*:contains("View in browser")').closest('div, p, table, tr, td').remove();
        $('*:contains("rights reserved")').closest('div, p, table, tr, td').remove();
        $('*:contains("click here")').closest('div, p, table, tr, td').remove();
        $('*:contains("If you wish to unsubscribe")').closest('div, p, table, tr, td').remove();
        $('*:contains("©")').closest('div, p, table, tr, td').remove();

        // Remove purely decorative tables and spacers
        $('table:has(td:empty)').remove();
        $('table:has(div:empty)').remove();
        $('table:has(div:contains("&nbsp;"))').remove();
        $('table[style*="border-spacing: 0"]').remove(); // Often used for layout
        $('table[style*="border-collapse: collapse"]').remove(); // Often used for layout

        // Remove marketing sections with specific headers
        $('*:contains("DON\'T MISS OUT")').closest('table').remove();
        $('*:contains("LOOK AT YOUR OPPORTUNITIES")').closest('table').remove();
        $('*:contains("ACTIVE")').closest('table').remove();
        $('*:contains("CLOSING THIS WEEK")').closest('table').remove();
        $('*:contains("JUST OPENED")').closest('table').remove();
        $('*:contains("INTERNAL")').closest('table').remove();
        $('*:contains("EXTERNAL")').closest('table').remove();

        // Remove tables with marketing statistics (common in the example)
        $('table:has(span[style*="font-size: 40px"])').remove();
        $('table:has(span[style*="font-weight: bold"])').remove();

        // Remove social media links and icons
        $('a[href*="facebook.com"]').closest('div, p, table, tr, td').remove();
        $('a[href*="twitter.com"]').closest('div, p, table, tr, td').remove();
        $('a[href*="instagram.com"]').closest('div, p, table, tr, td').remove();
        $('a[href*="youtube.com"]').closest('div, p, table, tr, td').remove();
        $('a[href*="tiktok.com"]').closest('div, p, table, tr, td').remove();

        // Remove repetitive links and navigation
        $('a[href*="unsubscribe"]').closest('div, p, table, tr, td').remove();
        $('a[href*="preferences"]').closest('div, p, table, tr, td').remove();
        $('a[href*="view"]').closest('div, p, table, tr, td').remove();

        // Clean up remaining tables - extract just the text content
        $('table').each(function() {
            const tableText = $(this).text().trim();
            if (tableText) {
            $(this).replaceWith(`<p>${tableText}</p>`);
            } else {
            $(this).remove();
            }
        });
        
        // Remove excessive whitespace and empty elements
        $('*').each(function() {
            const el = $(this);
            const node = el.get(0);
            // Check if node is an Element (has tagName property)
            if (el?.html()?.trim() === '' && node && 'tagName' in node && !['img', 'br', 'hr'].includes(node.tagName.toLowerCase())) {
            el.remove();
            }
        });
      
      // Customize turndown to handle email-specific elements
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '_'
      });
      
      // Handle table headings (often used for section titles in emails)
      turndownService.addRule('tableHeadings', {
        filter: node => {
          return (
            (node.nodeName === 'TD' || node.nodeName === 'TH') &&
            node.textContent &&
            (node.getAttribute('style')?.includes('font-weight: bold') ||
             node.getAttribute('style')?.includes('font-size') ||
             node.firstChild?.nodeName === 'H1' ||
             node.firstChild?.nodeName === 'H2' ||
             node.firstChild?.nodeName === 'H3')
          );
        },
        replacement: (content, node) => {
          // Extract just the text and make it a heading
          return `\n\n**${content.trim()}**\n\n`;
        }
      });
      
      // Handle call-to-action elements (common in marketing emails)
      turndownService.addRule('callToAction', {
        filter: node => {
          return (
            (node.nodeName === 'DIV' || node.nodeName === 'TD') &&
            (node.getAttribute('style')?.includes('background-color') ||
             node.getAttribute('class')?.includes('cta') ||
             node.getAttribute('class')?.includes('action'))
          );
        },
        replacement: (content, node) => {
          // Simplify call-to-action blocks
          return `\n${content.trim()}\n`;
        }
      });
      
      // Handle statistics and numbers (common in marketing emails)
      turndownService.addRule('statistics', {
        filter: node => {
          return (
            node.nodeName === 'SPAN' &&
            node.getAttribute('style')?.includes('font-size: 40px') &&
            /^\d+$/.test(node.textContent.trim())
          );
        },
        replacement: (content, node) => {
          // Remove or simplify statistics
          return '';
        }
      });
      
      // Handle buttons
      turndownService.addRule('buttons', {
        filter: node => {
          return (
            node.nodeName === 'A' &&
            (node.getAttribute('role') === 'button' ||
             node.classList.contains('button') ||
             node.style.display === 'block')
          );
        },
        replacement: (content, node) => {
          return `[${content}](${node.getAttribute('href')}) `;
        }
      });
      
      // Convert to markdown
      content = turndownService.turndown($.html());
    }
    
    // Now process the content (either HTML-derived or plain text)
    let cleanedText = content as string;
    
    // Use EmailReplyParser to extract the most recent/relevant content
    // This helps remove quoted replies and signatures
    try {
      // EmailReplyParser is a class that needs to be instantiated
      const parsedEmail = new EmailReplyParser().read(cleanedText);
      
      // Get all fragments
      const fragments = parsedEmail.getFragments();
      
      // Filter out quoted text and signatures
      const relevantFragments = fragments.filter(f => !f.isQuoted() && !f.isSignature());
      
      if (relevantFragments.length > 0) {
        // Use the relevant content
        cleanedText = relevantFragments.map(f => f.getContent()).join('\n\n');
      } else {
        // If no relevant fragments found, use the visible text
        cleanedText = parsedEmail.getVisibleText();
      }
    } catch (err) {
      console.warn('EmailReplyParser failed, using full content:', err);
      // Continue with the full content if parsing fails
    }
    
    // Step 1: Remove all tracking and marketing URLs
    cleanedText = cleanedText.replace(/https?:\/\/track\.[^\s]+/g, '');
    cleanedText = cleanedText.replace(/https?:\/\/[^\s]+\?(xtl=|xul=|eih=|__stmp=|__onlt=)/g, '');
    
    // Step 2: Remove common email marketing elements
    const marketingPatterns = [
      // Unsubscribe sections
      /want to unsubscribe[\s\S]*?click here/gi,
      /to stop receiving these[\s\S]*?click here/gi,
      /unsubscribe[\s\S]*?click here/gi,
      /click here[\s\S]{0,50}to stop receiving/gi,
      /to unsubscribe[\s\S]{0,100}preferences/gi,
      /if you wish to unsubscribe[\s\S]*?here/gi,
      /unsubscribe[\s\S]*?here/gi,
      
      // Legal footers
      /copyright \d{4}[\s\S]*?rights reserved/gi,
      /terms of (use|service)[\s\S]*?privacy policy/gi,
      /privacy policy[\s\S]*?terms of (use|service)/gi,
      /do not (sell|share) my (info|information)/gi,
      /copyright \d{4}[\s\S]*?rights reserved/gi,
      /all rights reserved/gi,
      
      // Address blocks
      /\d+ [A-Za-z]+ (St|Ave|Blvd|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Highway|Hwy|Way|Place|Pl|Square|Sq),?[\s\S]{0,50}[A-Z]{2} \d{5}/g,
      
      // Common marketing phrases
      /view in browser/gi,
      /view as webpage/gi,
      /contact us/gi,
      /click here/gi,
      /about/gi,
      
      // Marketing-specific headers and content (from example email)
      /DON'T MISS OUT/gi,
      /LOOK AT YOUR OPPORTUNITIES/gi,
      /JUST OPENED/gi,
      /CLOSING THIS WEEK/gi,
      /ACTIVE/gi,
      /INTERNAL/gi,
      /EXTERNAL/gi,
      /BE READY/gi,
      /YOU HAVE NOT APPLIED TO YET/gi,
      /STARTED AND NOT FINISHED/gi,
      
      // Promotional language
      /exclusive offer/gi,
      /limited time/gi,
      /save over \d+%/gi,
      /get this deal/gi,
      /auto-renews/gi,
      /cancel anytime/gi,
      
      // Social media references
      /follow us on/gi,
      /facebook|twitter|instagram|youtube|tiktok/gi,
      
      // Common signature indicators
      /sent from my (iphone|ipad|android|mobile device)/gi,
      /\-{2,}[\s\S]{0,200}(regards|sincerely|thank you|thanks|best|cheers)/gi,
    ];
    
    marketingPatterns.forEach(pattern => {
      cleanedText = cleanedText.replace(pattern, '');
    });
    
    // Step 3: Clean up formatting
    cleanedText = cleanedText
      // Remove email formatting characters
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      
      // Remove excessive hash symbols (often used as separators)
      .replace(/^#+\s*$/gm, '')
      
      // Remove excessive newlines and spaces
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
    
    // Step 4: Final cleanup
    cleanedText = cleanedText.trim();
    
    return cleanedText;
  } catch (error) {
    console.error('Error parsing email with mailparser:', error);
    // Fallback to original cleaning method if parsing fails
    return cleanTextFallback(text);
  }
}

/**
 * Fallback method for cleaning email text if mailparser fails
 * @param text The email text to clean
 * @returns Cleaned text
 */

function cleanTextFallback(text: any): string {
  // Ensure text is a string
  if (!text) return '';
  if (typeof text !== 'string') {
    console.warn('cleanTextFallback received non-string input:', typeof text);
    return '';
  }
  
  // Step 1: Remove all tracking and marketing URLs
  let cleanedText = text.replace(/https?:\/\/track\.[^\s]+/g, '');
  cleanedText = cleanedText.replace(/https?:\/\/[^\s]+\?(xtl=|xul=|eih=|__stmp=|__onlt=)/g, '');
  
  // Step 2: Remove common email marketing elements
  const marketingPatterns = [
    // Unsubscribe sections
    /want to unsubscribe[\s\S]*?click here/gi,
    /to stop receiving these[\s\S]*?click here/gi,
    /unsubscribe[\s\S]*?click here/gi,
    /click here[\s\S]{0,50}to stop receiving/gi,
    
    // Legal footers
    /copyright \d{4}[\s\S]*?rights reserved/gi,
    /terms of (use|service)[\s\S]*?privacy policy/gi,
    /privacy policy[\s\S]*?terms of (use|service)/gi,
    /do not (sell|share) my (info|information)/gi,
    
    // Address blocks
    /\d+ [A-Za-z]+ (St|Ave|Blvd|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Highway|Hwy|Way|Place|Pl|Square|Sq),?[\s\S]{0,50}[A-Z]{2} \d{5}/g,
    
    // Common marketing phrases
    /click here/gi,
    /view in browser/gi,
    /view as webpage/gi,
    /contact us/gi,
    /about/gi,
  ];
  
  marketingPatterns.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, '');
  });
  
  // Step 3: Clean up formatting
  cleanedText = cleanedText
    // Remove email formatting characters
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    
    // Remove excessive hash symbols (often used as separators)
    .replace(/^#+\s*$/gm, '')
    
    // Remove excessive newlines and spaces
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ');
  
  // Step 4: Final cleanup
  cleanedText = cleanedText.trim();
  
  return cleanedText;
}

/**
 * Validates and sanitizes the thread summarization response from the LLM
 * to reduce hallucinations and ensure consistent output format.
 * 
 * @param response The raw response from the LLM
 * @returns A sanitized and validated SummarizationResponse object
 */
export function validateThreadSummary(response: any): SummarizationResponse {
    // Define valid values for categorical fields
    const validCategories = [
        'Important Info', 'Calendar', 'Payments', 
        'Travel', 'Newsletters', 'Notifications'
    ];
    
    try {
        console.log("Validating thread summary response");
        
        // Handle null or undefined response
        if (!response) {
            console.warn('Received null or undefined response from LLM');
            return { categories: [], isPending: false, generatedAt: new Date() };
        }
        
        // Parse the response if it's a string
        const parsedResponse = typeof response === 'string' 
            ? cleanAndParseJSON(response) 
            : response;
        
        // Check if we have a valid response structure
        if (!parsedResponse || !parsedResponse.categories || !Array.isArray(parsedResponse.categories)) {
            console.warn('Invalid response format - missing categories array:', parsedResponse);
            return { categories: [], isPending: false, generatedAt: new Date() };
        }
        
        // Process each category
        const processedCategories = parsedResponse.categories.map(category => {
            // Validate category title
            const categoryTitle = category.title && typeof category.title === 'string'
                ? category.title 
                : 'Important Info';
                
            // Ensure the category is valid
            const validCategoryTitle = validCategories.includes(categoryTitle) 
                ? categoryTitle 
                : 'Important Info';
            
            // Process summaries in this category
            const summaries = Array.isArray(category.summaries) 
                ? category.summaries.map(processSummary)
                : [];
                
            // Filter out invalid summaries (those without messageId)
            const validSummaries = summaries.filter(summary => summary.messageId);
            
            // Sort summaries by priority score (descending)
            const sortedSummaries = validSummaries.sort(
                (a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)
            );
            
            return {
                title: validCategoryTitle,
                summaries: sortedSummaries
            };
        });
        
        // Filter out empty categories
        const filteredCategories = processedCategories.filter(
            category => category.summaries.length > 0
        );
        
        // Use a predefined order for categories (matching the order in the prompt)
        const categoryOrder = [
            'Important Info',
            'Calendar', 
            'Payments',
            'Travel',
            'Notifications',
            'Newsletters'
        ];
        
        // Sort categories by the predefined order
        const sortedCategories = filteredCategories.sort((a, b) => {
            return categoryOrder.indexOf(a.title) - categoryOrder.indexOf(b.title);
        });
        
        return {
            categories: sortedCategories,
            isPending: false,
            generatedAt: new Date()
        };
    } catch (error) {
        console.error('Error validating thread summary:', error);
        return { categories: [], isPending: false, generatedAt: new Date() };
    }
}

/**
 * Process a single summary from the LLM response
 */
function processSummary(summary: any): {
    title: string;
    headline: string;
    messageId: string;
    priorityScore: number;
    insights?: {
        key_highlights?: string[];
        why_this_matters?: string;
        next_step?: string[];
    };
} {
    if (!summary || typeof summary !== 'object') {
        return {
            title: 'Invalid Summary',
            headline: 'The summary data was invalid or corrupted.',
            messageId: '',
            priorityScore: 0
        };
    }
    
    // Extract and validate title
    const title = summary.title && typeof summary.title === 'string'
        ? summary.title.substring(0, 75)
        : 'Untitled';
        
    // Extract headline (new field)
    const headline = summary.headline && typeof summary.headline === 'string'
        ? summary.headline
        : 'No headline provided';
        
    // Extract messageId
    const messageId = summary.messageId && typeof summary.messageId === 'string'
        ? summary.messageId
        : '';
        
    // Extract priorityScore (0-100)
    const priorityScore = typeof summary.priorityScore === 'number' && 
        !isNaN(summary.priorityScore) && 
        summary.priorityScore >= 0 && 
        summary.priorityScore <= 100
        ? summary.priorityScore
        : 50; // Default to medium priority
        
    // Process insights if available
    let validatedInsights: {
        key_highlights?: string[];
        why_this_matters?: string;
        next_step?: string[];
    } | undefined = undefined;
    
    if (summary.insights && typeof summary.insights === 'object') {
        // Validate and extract insights components
        const insights = summary.insights;
        
        // Validate key highlights
        const keyHighlights = Array.isArray(insights.key_highlights)
            ? insights.key_highlights.filter(highlight => typeof highlight === 'string')
            : [];
            
        // Validate why this matters
        const whyThisMatters = insights.why_this_matters && typeof insights.why_this_matters === 'string'
            ? insights.why_this_matters
            : '';
            
        // Validate next steps
        const nextSteps = Array.isArray(insights.next_step)
            ? insights.next_step.filter(step => typeof step === 'string')
            : [];
            
        // Store validated insights
        validatedInsights = {
            key_highlights: keyHighlights.length > 0 ? keyHighlights : undefined,
            why_this_matters: whyThisMatters || undefined,
            next_step: nextSteps.length > 0 ? nextSteps : undefined
        };
    }
    
    return {
        title,
        headline,
        messageId,
        priorityScore,
        insights: validatedInsights
    };
}

/**
 * Get default priority score for a category
 */
function getCategoryDefaultPriorityScore(category: string): number {
    switch(category) {
        case 'Important Info': return 100;
        case 'Calendar': return 80;
        case 'Payments': return 70;
        case 'Travel': return 60;
        case 'Newsletters': return 30;
        case 'Notifications': return 40;
        default: return 10;
    }
}