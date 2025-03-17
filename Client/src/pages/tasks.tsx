import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface Task {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  due_date: string | null;
  email: {
    subject: string;
    sender: string;
  } | null;
}

export default function TasksPage() {
  const { data: tasks, isLoading, error } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Tasks</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Card className="bg-red-50">
          <CardContent className="flex items-center gap-2 text-red-700 p-4">
            <AlertTriangle className="h-5 w-5" />
            <p>Failed to load tasks</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Tasks ({tasks?.length || 0})</h1>
      <div className="space-y-4">
        {tasks?.map((task) => (
          <Card key={task.id}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{task.title}</h3>
                    <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'}>
                      {task.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                  {task.email && (
                    <div className="text-xs text-muted-foreground">
                      From email: {task.email.subject}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {task.due_date && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{format(new Date(task.due_date), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                  {task.status === 'completed' && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {tasks?.length === 0 && (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground">
              No tasks found
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
