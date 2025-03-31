// Responsible for creating and managing tasks from emails

import { tasks, EmailAccount, taskActions, processedEmails } from '../../db/schema';
import { eq, inArray, or, and } from 'drizzle-orm';
import { EmailThread, } from '../../Types/model';
import { TaskData } from './interfaces';
import ThreadDebugLogger from '../../utils/ThreadDebugLogger';

export class EmailTaskService {
    constructor(private db: any) {}
    
    /**
     * Check if a task already exists for the given email thread
     */
    public async checkExistingTask(tx: any, emailThread: EmailThread) {
        // Get all message IDs from this thread
        const messageIds = emailThread.messages.map(msg => msg.id);
        
        // Check if any task exists with this thread_id or with an email_id that belongs to this thread
        const existingTask = await tx.query.tasks.findFirst({
            where: or(
                eq(tasks.thread_id, emailThread.id),
                inArray(tasks.email_id, messageIds)
            )
        });

        if (existingTask) {
            // ThreadDebugLogger.log(`Task already exists for thread`, {
            //     threadId: emailThread.id,
            //     existingTaskId: existingTask.email_id
            // });
        }
        
        return existingTask;
    }
    
    /**
     * Create a task and its action items
     */
    public async createTaskAndActionItems(tx: any, taskData: TaskData, emailThread: EmailThread, emailAccount: EmailAccount) {
        // Create the task first
        console.log("Creating task...")
        const task = await this.createTask(tx, taskData, emailThread, emailAccount);
        
        // If task creation was successful and task has action items
        if (task && taskData.task?.action_items) {
            console.log("Creating action items...")
            await this.createActionItems(tx, task.id, taskData.task.action_items);
        }

        // Update processed_emails record with task information
        await tx.update(processedEmails)
            .set({
                processing_result: {
                    success: true,
                    metadata: {
                        has_task: true,
                        task_id: task.id,
                        task_priority: taskData.task?.priority,
                        task_created_at: new Date() // Store as Date object, not string
                    }
                }
            })
            .where(and(
                eq(processedEmails.thread_id, emailThread.id),
                eq(processedEmails.user_id, emailAccount.user_id)
            ));

        console.log("Task created successfully")
        return task;

    }

    private async createTask(tx: any, taskData: TaskData, emailThread: EmailThread, emailAccount: EmailAccount) {
        try {
            // Return early if taskData.task is undefined
            if (!taskData.task) {
                // ThreadDebugLogger.log('Cannot create task: taskData.task is undefined', {
                //     threadId: emailThread.id,
                //     taskData: JSON.stringify(taskData)
                // });
                return null;
            }

            // Check for existing task first
            const existingTask = await this.checkExistingTask(tx, emailThread);
            if (existingTask) {
                // ThreadDebugLogger.log('Task already exists for thread', {
                //     threadId: emailThread.id,
                //     existingTaskId: existingTask.id
                // });
                return existingTask;
            }

            // Parse due date if it exists
            let dueDate = null;
            if (taskData.task.dueDate) {
                try {
                    dueDate = new Date(taskData.task.dueDate);
                    // Validate the date is valid
                    if (isNaN(dueDate.getTime())) {
                        // ThreadDebugLogger.log('Invalid due date format', {
                        //     dueDate: taskData.task.dueDate,
                        //     threadId: emailThread.id
                        // });
                        dueDate = null;
                    }
                } catch (error) {
                    // ThreadDebugLogger.log('Error parsing due date', {
                    //     error: error.message,
                    //     dueDate: taskData.task.dueDate,
                    //     threadId: emailThread.id
                    // });
                    dueDate = null;
                }
            }

            const taskInsertData = {
                user_id: emailAccount.user_id,
                account_id: emailAccount.id,
                title: taskData.task.title,
                description: taskData.task.description,
                priority: taskData.task.priority,
                due_date: dueDate,
                status: 'Inbox',
                thread_id: emailThread.id,
                email_id: emailThread.messages[0].id,
                sender_name: emailThread.messages[0].headers?.from || 'Unknown Sender',
                sender_email: emailThread.messages[0].headers?.from?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.pop() || null,
                team_name: null,
                column_id: 1,
                position: null,
                brief_text: taskData.task.brief_text,
                ai_summary: taskData.task.ai_summary,
                category: 'Important Info',
                received_date: new Date(emailThread.messages[0].headers?.date ?? Date.now()),
                created_at: new Date(),
                updated_at: new Date()
            };

            // ThreadDebugLogger.log('Attempting to insert task', {
            //     threadId: emailThread.id,
            //     taskTitle: taskData.task.title,
            //     userId: emailAccount.user_id,
            //     insertData: { ...taskInsertData, description: taskInsertData.description?.substring(0, 100) }
            // });
            
            const [task] = await tx.insert(tasks).values(taskInsertData).returning();

            if (!task) {
                // ThreadDebugLogger.log('Task insert returned null', {
                //     threadId: emailThread.id,
                //     taskTitle: taskData.task.title
                // });
                return null;
            }

            // ThreadDebugLogger.log('Task created successfully', {
            //     taskId: task.id,
            //     threadId: emailThread.id,
            //     title: task.title
            // });

            return task;
        } catch (error) {
            // ThreadDebugLogger.log('Error creating task', {
            //     error: error.message,
            //     stack: error.stack,
            //     threadId: emailThread.id,
            //     taskTitle: taskData.task?.title,
            //     userId: emailAccount.user_id
            // });
            throw error;
        }
    }

    private async createActionItems(tx: any, taskId: number, actionItems: Array<{action_text: string, position: number}>) {
        // If there are no action items, log and return
        if (!actionItems || actionItems.length === 0) {
            // ThreadDebugLogger.log('No action items to create', {
            //     taskId
            // });
            return;
        }

        // Make sure positions are sequential starting from 1
        const actionItemsData = actionItems.map((item, index) => ({
            task_id: taskId,
            action_text: item.action_text,
            // Use the provided position or calculate based on index (1-based)
            position: item.position || (index + 1),
            is_completed: false,
            created_at: new Date(),
            updated_at: new Date()
        }));

        // ThreadDebugLogger.log('Creating action items', {
        //     taskId,
        //     count: actionItems.length,
        //     items: actionItemsData.map(item => ({
        //         text: item.action_text,
        //         position: item.position
        //     }))
        // });

        await tx.insert(taskActions).values(actionItemsData);
    }
}