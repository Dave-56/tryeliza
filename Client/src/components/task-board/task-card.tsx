import { FC, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Task } from '@/types/task';
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { normalizePriority } from "@/lib/utils";

export const TaskCard: FC<{ 
  task: Task; 
  onClick: () => void;
  onDelete?: (taskId: string | number) => void;
  onEdit?: (taskId: string | number) => void;
  onToggleAction?: (actionId: number, isCompleted: boolean) => void;
}> = ({ task, onClick, onDelete, onEdit, onToggleAction }) => {
  // Log the reminderSent value for debugging
  useEffect(() => {
    // console.log(`Task ${task.id} reminderSent value:`, task.reminderSent);
  }, [task.id, task.reminderSent]);

  const getDueDateColor = (dueDate?: string) => {
    if (!dueDate) return "text-muted-foreground";
    if (dueDate === "Today") return "text-red-600 font-medium";
    if (dueDate === "Tomorrow") return "text-amber-600";
    if (dueDate === "Completed") return "text-green-600";
    if (dueDate) return "text-blue-600";
    return "text-muted-foreground";
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (onDelete) {
      onDelete(task.id);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (onEdit) {
      onEdit(task.id);
    }
  };

  const handleToggleAction = (e: React.MouseEvent, actionId: number, isCompleted: boolean) => {
    e.stopPropagation(); 
    if (onToggleAction) {
      onToggleAction(actionId, !isCompleted);
    }
  };

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow relative" 
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <h3 className="font-medium text-sm line-clamp-2">{task.title}</h3>
            <p className="text-xs text-muted-foreground mb-1">From: {task.sender}</p>
          </div>
          <div className="flex space-x-1">
            {/* {onEdit && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={(e) => handleEdit(e)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )} */}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-destructive" 
                onClick={(e) => handleDelete(e)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 mb-2">
          {task.priority && (
            <Badge 
              variant={normalizePriority(task.priority) === 'High' || normalizePriority(task.priority) === 'Urgent' ? 'destructive' : 'outline'}
              className={`text-[10px] px-1 h-4 ${
                normalizePriority(task.priority) === 'Medium' ? 'text-green-600' : 
                normalizePriority(task.priority) === 'Low' ? 'text-slate-500' : ''
              }`}
            >
              {normalizePriority(task.priority)}
            </Badge>
          )}
          {task.waitingTime && (
            <Badge 
              variant="outline" 
              className="text-[10px] px-1 h-4 text-amber-600"
            >
              {task.waitingTime}
            </Badge>
          )}
          {/* Log the condition check in a way that doesn't affect rendering */}
          {(() => {
            // console.log(`Task ${task.id} reminderSent condition check:`, {
            //   reminderSent: task.reminderSent,
            //   type: typeof task.reminderSent,
            //   condition: !!task.reminderSent
            // });
            return null;
          })()}
          {task.reminderSent && (
            <Badge 
              variant="outline" 
              className="text-[10px] px-1 h-4 text-blue-600"
            >
              Eliza Reminder Sent
            </Badge>
          )}
          {task.threadSummary && task.threadSummary.messageCount > 0 && (
            <Badge 
              variant="outline" 
              className="text-[10px] px-1 h-4 text-blue-600 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              {task.threadSummary.messageCount} {task.threadSummary.messageCount === 1 ? 'message' : 'messages'}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-3">{task.description ? task.description : task.aiSummary}</p>

        <Separator className="my-3" />

        {task.actions && task.actions.map((action) => (
          <div key={action.id} className="flex items-center gap-2 text-sm">
            <Checkbox 
              id={`action-${action.id}`}
              checked={action.isCompleted}
              onClick={(e) => handleToggleAction(e, action.id as number, action.isCompleted)}
              className="rounded border-gray-300" 
            />
            <label 
              htmlFor={`action-${action.id}`}
              className="text-sm cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {action.text}
            </label>
          </div>
        ))}

        <div className="mt-3 flex justify-between items-center text-xs">
          <div className="text-muted-foreground">
            Received: {task.receivedDate}
          </div>
          {task.dueDate && (
            <div className={getDueDateColor(task.dueDate)}>
              Due: {task.dueDate}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};