// Responsible for creating and managing tasks from emails

import { tasks, EmailAccount, taskActions, processedEmails } from '../../db/schema';
import { eq, inArray, or, and } from 'drizzle-orm';
import { EmailThread, } from '../../Types/model';
import { TaskData } from './interfaces';

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
            console.log(`Task already exists for thread with ID ${emailThread.id} (found via message ID ${existingTask.email_id})`);
        }
        
        return existingTask;
    }
    
    /**
     * Create a task and its action items
     */
    public async createTaskAndActionItems(tx: any, taskData: TaskData, emailThread: EmailThread, emailAccount: EmailAccount) {
        // Create the task first
        const task = await this.createTask(tx, taskData, emailThread, emailAccount);
        
        // If task creation was successful and task has action items
        if (task && taskData.task?.action_items) {
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
                        task_created_at: new Date().toISOString()
                    }
                }
            })
            .where(and(
                eq(processedEmails.thread_id, emailThread.id),
                eq(processedEmails.user_id, emailAccount.user_id)
            ));

        return task;
    }

    private async createTask(tx: any, taskData: TaskData, emailThread: EmailThread, emailAccount: EmailAccount) {
        // Return early if taskData.task is undefined
        if (!taskData.task) {
            console.warn('Cannot create task: taskData.task is undefined');
            return null;
        }

        const taskInsertData = {
            user_id: emailAccount.user_id,
            account_id: emailAccount.id,
            title: taskData.task.title,
            description: taskData.task.description,
            priority: taskData.task.priority,
            due_date: taskData.task.dueDate,
            status: 'pending',
            thread_id: emailThread.id,
            message_id: emailThread.messages[0].id,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const [task] = await tx.insert(tasks).values(taskInsertData).returning();

        console.log("Task created: ", {
            name: 'EmailCategorizedSuccessfully',
            properties: { 
                emailId: emailThread.messages[0].id,
                taskId: task.id,
                isComplex: taskData.task.is_complex === true
            }
        });

        return task;
    }

    private async createActionItems(tx: any, taskId: number, actionItems: Array<{action_text: string, position: number}>) {
        // Only insert action items if there are any
        const isComplex = actionItems.length > 0;
        
        if (isComplex) {
            console.log(`Creating ${actionItems.length} action items for complex task: ${taskId}`);
            
            // Make sure positions are sequential starting from 1
            const actionItemsToInsert = actionItems
                .map((item, index) => ({
                    task_id: taskId,
                    action_text: item.action_text,
                    // Use the provided position or calculate based on index (1-based)
                    position: item.position || (index + 1),
                }));
            
            await tx.insert(taskActions).values(actionItemsToInsert);
        } else {
            console.log(`Task ${taskId} is not complex or has no action items. Skipping action item creation.`);
        }
    }
}