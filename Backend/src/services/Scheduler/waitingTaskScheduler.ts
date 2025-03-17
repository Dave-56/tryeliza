import { WaitingTaskService } from '../Task/WaitingTaskService';
import { db } from '../../db';
import cron from 'node-cron';

// Create a singleton instance of the WaitingTaskService
const waitingTaskService = new WaitingTaskService(db);

/**
 * Check for waiting tasks that need follow-up and process them
 */
export async function checkWaitingTasks() {
    console.log('Running scheduled check for waiting tasks...');
    
    try {
        const results = await waitingTaskService.processAllWaitingTasks();
        
        const successCount = results.filter(r => r.success).length;
        console.log(`Processed ${results.length} waiting tasks, ${successCount} successfully`);
        
        return {
            processed: results.length,
            successful: successCount,
            failed: results.length - successCount,
            details: results
        };
    } catch (error) {
        console.error('Error in waiting task scheduler:', error);
        throw error;
    }
}

/**
 * Initialize the waiting task scheduler
 */
export function initializeWaitingTaskScheduler() {
    // Run the waiting task check every day at midnight
    cron.schedule('0 0 * * *', async () => {
        try {
            await checkWaitingTasks();
        } catch (error) {
            console.error('Error running waiting task scheduler:', error);
        }
    });
    
    console.log('Waiting task scheduler initialized with job at midnight');
}