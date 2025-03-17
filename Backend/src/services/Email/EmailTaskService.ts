// Responsible for creating and managing tasks from emails

import { tasks, EmailAccount, taskActions } from '../../db/schema';
import { eq, inArray, or } from 'drizzle-orm';
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
        // Return early if taskData.task is undefined
        if (!taskData.task) {
            console.warn('Cannot create task: taskData.task is undefined');
            return null;
        }

        const latestMessage = emailThread.messages[emailThread.messages.length - 1];
        const taskInsertData = {
            title: taskData.task.title,
            description: taskData.task.description,
            priority: taskData.task.priority || 'medium',
            due_date: taskData.task.dueDate ? new Date(taskData.task.dueDate) : null,
            email_id: latestMessage.id, // Still store the latest message ID for reference
            thread_id: emailThread.id,  // Store the thread ID to prevent duplicates
            user_id: emailAccount.user_id,
            account_id: emailAccount.id,
            column_id: 1,
            sender_name: latestMessage.headers.from.split('<')[0].trim(),
            sender_email: latestMessage.headers.from.match(/<(.+)>/)?.[1] || latestMessage.headers.from,
            received_date: new Date(latestMessage.headers.date),
            status: 'Inbox',
            category: taskData.category,
            ai_summary: taskData.task.description
        };
        
        const [task] = await tx.insert(tasks).values(taskInsertData).returning();

        // Only insert action items if the task is complex and has action items
        const isComplex = taskData.task.is_complex === true;
        const hasActionItems = taskData.task.action_items && 
                              Array.isArray(taskData.task.action_items) && 
                              taskData.task.action_items.length > 0;
        
        if (isComplex && hasActionItems && taskData.task.action_items) {
            console.log(`Creating ${taskData.task.action_items.length} action items for complex task: ${task.id}`);
            
            // Make sure positions are sequential starting from 1
            const actionItemsToInsert = taskData.task.action_items
                .map((item, index) => ({
                    task_id: task.id,
                    action_text: item.action_text,
                    // Use the provided position or calculate based on index (1-based)
                    position: item.position || (index + 1),
                    is_completed: false
                }));
            
            await tx.insert(taskActions).values(actionItemsToInsert);
        } else {
            console.log(`Task ${task.id} is not complex or has no action items. Skipping action item creation.`);
        }

        console.log("Task created: ", {
            name: 'EmailCategorizedSuccessfully',
            properties: { 
                emailId: emailThread.messages[0].id,
                taskId: task.id,
                isComplex: isComplex
            }
        });

        return task;
    }
}