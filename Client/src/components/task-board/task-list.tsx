import { FC } from "react";
import { TaskCard, FloatingAutoFollowup } from '@/components/task-board';
import { Task, Column } from './task-panel';
import { InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskListProps {
  column: Column;
  onTaskClick: (task: Task) => void;
  onDeleteTask?: (taskId: string | number) => void;
  onEditTask?: (taskId: string | number) => void;
  onToggleAction?: (actionId: number, isCompleted: boolean) => void;
}

export const TaskList: FC<TaskListProps> = ({ column, onTaskClick, onDeleteTask, onEditTask, onToggleAction }) => {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {column.title} <span className="text-muted-foreground text-sm">({column.count})</span>
        </h2>
      </div>
      <div className="space-y-4">
            {column.tasks.map((task) => (
            <TaskCard
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
                onDelete={onDeleteTask}
                onEdit={onEditTask}
                onToggleAction={onToggleAction}
            />
            ))}
            {column.tasks.length === 0 && (
            <div className={cn(
              "border border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2",
              "bg-muted/30 border-muted-foreground/20"
            )}>
                <InboxIcon className="h-8 w-8 text-muted-foreground/70" />
                <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
                <p className="text-xs text-muted-foreground/70 text-center max-w-[200px]">
                  Add tasks manually or sync your emails to populate this column.
                </p>
            </div>
            )}
      </div>
            {(column.id === 3) && column.tasks.length > 0 && (
              <FloatingAutoFollowup 
                taskId={column.tasks.length > 0 ? Number(column.tasks[0].id) : null} 
              />
            )}
    </div>
  );
};