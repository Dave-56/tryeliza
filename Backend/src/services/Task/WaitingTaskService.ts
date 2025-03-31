import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { waitingTasks, tasks, followUpEmails, emails, emailAccounts, taskNotes, users, draftActivities } from '../../db/schema';
import { AgentService } from '../Agent/AgentService';
import { LLMService } from '../LLMService';
import { getWaitingTaskActionPrompt } from '../../utils/prompts';
import { db } from '../../db';
import { EmailUtils } from '../Google/emailUtils';

/**
 * Service for managing waiting tasks
 */
export class WaitingTaskService {
    private llmService: LLMService;
    private agentService: AgentService;

    constructor(private database = db) {
        this.llmService = LLMService.getInstance();
        this.agentService = new AgentService();
    }

    /**
     * Find waiting tasks that have been waiting for 3 or more days
     * and haven't had a reminder sent recently
     */
    async findTasksNeedingFollowUp() {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        // Find tasks that have been waiting for 3+ days and either:
        // 1. Have never had a reminder sent (reminder_sent = false)
        // 2. Had a reminder sent more than 3 days ago
        const waitingTasksResult = await this.database.query.waitingTasks.findMany({
            where: and(
                lte(waitingTasks.waiting_since, threeDaysAgo),
                eq(waitingTasks.reminder_sent, false)
            ),
            with: {
                task: true
            }
        });

        return waitingTasksResult;
    }

    /**
     * Determine the next action for a waiting task using LLM
     */
    async determineNextAction(waitingTaskId: number) {
        // Get the waiting task with its associated task
        const waitingTaskWithTask = await this.database.query.waitingTasks.findFirst({
            where: eq(waitingTasks.task_id, waitingTaskId),
            with: {
                task: true
            }
        });

        // Fetch email thread if available
        let emailThreadContext = undefined;
        if (waitingTaskWithTask.task.thread_id && waitingTaskWithTask.task.email_id) {
            const emailThread = await this.getEmailThread(waitingTaskWithTask.task.thread_id);
            if (emailThread) {
                emailThreadContext = {
                    messages: emailThread.messages.map(msg => ({
                        sender: msg.headers.from,
                        recipient: msg.headers.to,
                        subject: msg.headers.subject,
                        content: msg.body,
                        timestamp: msg.headers.date
                    })),
                    last_response_time: emailThread.messages[emailThread.messages.length - 1]?.headers.date
                };
            }
        }

        //console.log("Waiting task with task", JSON.stringify(waitingTaskWithTask));

        if (!waitingTaskWithTask) {
            console.error(`Waiting task with ID ${waitingTaskId} not found`);
            return null;
        }

        const { task, waiting_for, waiting_time } = waitingTaskWithTask;

        // Fetch task notes for additional context
        const taskNotesResult = await this.database.query.taskNotes.findMany({
            where: eq(taskNotes.task_id, task.id),
            orderBy: [desc(taskNotes.created_at)],
            limit: 5 // Get the 5 most recent notes
        });

        // Combine notes into a single text
        const notesText = taskNotesResult.length > 0 
            ? taskNotesResult.map(note => note.text).join('\n\n')
            : '';

        

        // Create a prompt for the LLM to determine the next action
        const prompt = getWaitingTaskActionPrompt({
            task: {
                title: task.title,
                description: task.description || '',
                priority: task.priority || 'medium',
                due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : undefined,
                task_type: task.category as 'approval' | 'information' | 'action' | 'deadline' | 'other'
            },
            waiting_for: waiting_for || '',
            waiting_time: waiting_time,
            notes: notesText,
            email_thread: emailThreadContext
        });

        try {
            const response = await this.llmService.generateResponse(prompt, 'waiting_task_action', 'waiting_task_action');
            return response;
        } catch (error) {
            console.error('Error determining next action for waiting task:', error);
            return null;
        }
    }

    /**
     * Process a waiting task and take the appropriate action
     */
    async processWaitingTask(waitingTaskId: number) {
        const nextAction = await this.determineNextAction(waitingTaskId);
        console.log('Next action:', nextAction);
        if (!nextAction) {
            console.error(`Failed to determine next action for waiting task ${waitingTaskId}`);
            return false;
        }

        // Get the waiting task with its associated task
        const waitingTaskWithTask = await this.database.query.waitingTasks.findFirst({
            where: eq(waitingTasks.task_id, waitingTaskId),
            with: {
                task: true
            }
        });

        if (!waitingTaskWithTask) {
            console.error(`Waiting task with ID ${waitingTaskId} not found`);
            return false;
        }

        const { task, waiting_for } = waitingTaskWithTask;

        // Take action based on LLM recommendation
        switch (nextAction.action) {
            case 'send_followup':
            case 'send_final_notice':
            case 'suggest_alternative':
            case 'schedule_meeting':
                // Generate an email draft based on action type
                console.log('Generating draft for action:', nextAction.action);
                if (task.thread_id && task.email_id) {
                    // Get the email thread
                    const emailThread = await this.getEmailThread(task.thread_id);
                    console.log('Email thread:', emailThread);
                    if (emailThread) {
                        // Get the user's name for the email signature
                        const user = await this.database.query.users.findFirst({
                            where: eq(users.id, task.user_id)
                        });

                        // Check if contextual drafting is enabled for this user
                        if (!user?.contextual_drafting_enabled) {
                            console.log(`Skipping draft creation for task ${task.id} - contextual drafting disabled`);
                            return false;
                        }
                        
                        // Generate a draft email using AgentService
                        const recipient = waiting_for || task.sender_name;
                        const draft = await this.agentService.generateDraft(
                            emailThread, 
                            recipient, 
                            user?.name,
                            nextAction.action  // Pass the action type directly
                        );
                        
                        if (draft) {
                            // Save the draft to the follow_up_emails table
                            const followUpEmail = await this.database.insert(followUpEmails).values({
                                task_id: task.id,
                                email_subject: draft.subject,
                                email_content: draft.body,
                                recipient: draft.to,
                                status: 'drafted',
                                action_type: nextAction.action,
                                is_final_notice: nextAction.action === 'send_final_notice',
                                suggested_meeting_times: nextAction.action === 'schedule_meeting' ? nextAction.suggested_times : null
                            }).returning();
                            
                            // Get the user's email account for analytics
                            const emailAccount = await this.database.query.emailAccounts.findFirst({
                                where: and(
                                    eq(emailAccounts.user_id, task.user_id),
                                    eq(emailAccounts.is_connected, true)
                                )
                            });
                            
                            // Also save to draft_activities table for analytics
                            await this.database.insert(draftActivities).values({
                                user_id: task.user_id,
                                account_id: emailAccount ? emailAccount.id : 0,
                                email_id: task.email_id,
                                title: draft.subject,
                                status: 'drafted',
                                action_type: nextAction.action
                            });
                            
                            // Update waiting task
                            await this.database.update(waitingTasks)
                                .set({
                                    reminder_sent: true,
                                    last_reminder_date: new Date(),
                                    last_action_type: nextAction.action
                                })
                                .where(eq(waitingTasks.task_id, task.id));
                            
                            return true;
                        }
                    }
                }
                return false;

            case 'schedule_meeting':
                // Currently handled through email draft generation above
                // TODO: Future enhancement - Implement direct calendar integration:
                // 1. Check calendar availability
                // 2. Create calendar events
                // 3. Send calendar invites
                console.log(`Meeting scheduling suggested for task ${task.id}`);
                return true;

            case 'escalate':
                // Update task priority to high if it's not already
                if (task.priority !== 'high' && task.priority !== 'urgent') {
                    await this.database.update(tasks)
                        .set({
                            priority: 'high',
                            updated_at: new Date()
                        })
                        .where(eq(tasks.id, task.id));
                }
                return true;

            case 'continue_waiting':
                // No action needed, but log the reason
                console.log(`Continuing to wait on task ${task.id}: ${nextAction.reason}`);
                return true;
                
            case 'close_as_complete':
            case 'close_as_obsolete':
                // Move the task to the appropriate column
                await this.database.update(tasks)
                    .set({
                        column_id: 4, // Assuming column_id 4 is the "Completed" column
                        status: nextAction.action === 'close_as_complete' ? 'Completed' : 'Obsolete',
                        updated_at: new Date(),
                        completion_reason: nextAction.action === 'close_as_complete' ? 'task_completed' : 'task_obsolete'
                    })
                    .where(eq(tasks.id, task.id));
                
                // Remove from waiting_tasks
                await this.database.delete(waitingTasks)
                    .where(eq(waitingTasks.task_id, task.id));
                
                return true;
                
            default:
                console.warn(`Unknown action recommended for waiting task ${waitingTaskId}: ${nextAction.action}`);
                return false;
        }
    }

    /**
     * Get the email thread associated with a task
     * Uses Google API to fetch the full email content and database to get AI summaries
     */
    private async getEmailThread(threadId: string) {
        if (!threadId || threadId.trim() === '') {
            console.error('Invalid thread ID provided');
            return null;
        }
        
        try {
            // First, find the email associated with this thread ID to get the account ID
            const emailWithThreadId = await this.database.query.emails.findFirst({
                where: sql`${emails.metadata}->>'threadId' = ${threadId}`
            });
            
            if (!emailWithThreadId) {
                console.error(`Could not find email associated with thread ID ${threadId}`);
                return null;
            }
            
            // Get the email account using the account_id
            const emailAccount = await this.database.query.emailAccounts.findFirst({
                where: eq(emailAccounts.id, emailWithThreadId.account_id)
            });
            
            if (!emailAccount || !emailAccount.tokens) {
                console.error(`No email account found with ID ${emailWithThreadId.account_id}`);
                return null;
            }
            
            // Create EmailUtils directly to access the getEmailDetails method
            const emailUtils = new EmailUtils(
                emailAccount.tokens.access_token,
                emailAccount.tokens.refresh_token || '',
                emailAccount.id.toString()
            );
            
            // Use EmailUtils directly to fetch the full thread details
            const threadDetails = await emailUtils.getEmailDetails(threadId);
            
            if (!threadDetails || !threadDetails.messages || threadDetails.messages.length === 0) {
                console.error(`No messages found in thread ${threadId}`);
                return null;
            }
            
            // Fetch AI summaries from the database for this thread
            const emailSummaries = await this.database.query.emails.findMany({
                where: sql`${emails.metadata}->>'threadId' = ${threadId}`
            });
            
            // Create a map of email ID to AI summary for quick lookup
            const summaryMap = new Map();
            emailSummaries.forEach(email => {
                if (email.ai_summary) {
                    summaryMap.set(email.gmail_id, email.ai_summary);
                }
            });
            
            // Enhance the thread details with AI summaries where available
            threadDetails.messages = threadDetails.messages.map(message => {
                const aiSummary = summaryMap.get(message.id);
                if (aiSummary) {
                    return {
                        ...message,
                        ai_summary: aiSummary
                    };
                }
                return message;
            });
            
            return threadDetails;
        } catch (error) {
            console.error(`Error fetching email thread ${threadId}:`, error);
            return null;
        }
    }

    /**
     * Analyze task notes to extract waiting information
     * @param taskId The ID of the task
     * @returns An object with waiting_for and waiting_time information
     */
    async analyzeTaskNotesForWaiting(taskId: number) {
        try {
            // Get the task notes
            const taskNotesResult = await this.database.query.taskNotes.findMany({
                where: eq(taskNotes.task_id, taskId),
                orderBy: [desc(taskNotes.created_at)],
                limit: 5 // Get the 5 most recent notes
            });
            
            if (!taskNotesResult || taskNotesResult.length === 0) {
                console.log(`No notes found for task ${taskId}`);
                return { waiting_for: '', waiting_time: '3 days' };
            }
            
            // Get the task details
            const task = await this.database.query.tasks.findFirst({
                where: eq(tasks.id, taskId)
            });
            
            if (!task) {
                console.log(`Task ${taskId} not found`);
                return { waiting_for: '', waiting_time: '3 days' };
            }
            
            // Combine notes into a single text
            const notesText = taskNotesResult.map(note => note.text).join('\n\n');
            
            // Create a prompt for the LLM to extract waiting information
            const prompt = `
            You are analyzing task notes to extract information about what the user is waiting for.
            
            Task title: ${task.title}
            Task description: ${task.description || ''}
            
            Recent notes:
            ${notesText}
            
            Based on the notes and task information, please determine:
            1. Who or what the user is waiting for (e.g., "John from Finance", "client approval", "response from vendor")
            2. How long they should wait (e.g., "3 days", "1 week", "2 weeks")
            
            If you can't determine this information, provide reasonable defaults.
            
            Return your response as a JSON object with the following format:
            {
                "waiting_for": "The person or thing they are waiting for",
                "waiting_time": "The duration to wait"
            }
            `;
            
            const response = await this.llmService.generateResponse(prompt, 'analyze_waiting_info', 'analyze_waiting_info');
            
            if (!response || !response.waiting_for) {
                return { waiting_for: '', waiting_time: '3 days' };
            }
            
            return {
                waiting_for: response.waiting_for,
                waiting_time: response.waiting_time || '3 days'
            };
        } catch (error) {
            console.error('Error analyzing task notes for waiting information:', error);
            return { waiting_for: '', waiting_time: '3 days' };
        }
    }

    /**
     * Process all waiting tasks that need follow-up
     */
    async processAllWaitingTasks() {
        const tasksNeedingFollowUp = await this.findTasksNeedingFollowUp();
        
        console.log(`Found ${tasksNeedingFollowUp.length} waiting tasks needing follow-up`);
        
        const results = await Promise.all(
            tasksNeedingFollowUp.map(async (waitingTask) => {
                try {
                    const success = await this.processWaitingTask(waitingTask.task_id);
                    return { taskId: waitingTask.task_id, success };
                } catch (error) {
                    console.error(`Error processing waiting task ${waitingTask.task_id}:`, error);
                    return { taskId: waitingTask.task_id, success: false, error };
                }
            })
        );
        
        return results;
    }
}