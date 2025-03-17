import fs from 'fs';
import path from 'path';

class ThreadDebugLogger {
    private static logFilePath = path.join(__dirname, 'thread_debug.log');
    private static maxFileSize = 1024 * 1024 * 5; // 5MB

    static log(message: string, data?: any) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n${
            data ? JSON.stringify(data, null, 2) : ''
        }\n\n`;

        // Check file size and rotate if needed
        if (fs.existsSync(this.logFilePath)) {
            const stats = fs.statSync(this.logFilePath);
            if (stats.size > this.maxFileSize) {
                this.rotateLogFile();
            }
        }

        fs.appendFileSync(this.logFilePath, logMessage);
    }

    private static rotateLogFile() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFilePath = path.join(
            __dirname,
            `thread_debug_${timestamp}.log`
        );
        fs.renameSync(this.logFilePath, rotatedFilePath);
    }
}

export default ThreadDebugLogger;