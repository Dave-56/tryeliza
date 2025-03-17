import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const priorityColors = {
  Urgent: "text-red-500 bg-red-100",
  High: "text-orange-500 bg-orange-100",
  Medium: "text-yellow-500 bg-yellow-100",
  Low: "text-green-500 bg-green-100",
};

export function TodaysTasks({ tasks }: { tasks: any[] }) {
  const today = new Date();
  const todaysTasks = tasks.filter(task => {
    if (!task.dueDate) return false;
    const taskDate = new Date(task.dueDate);
    return (
      taskDate.getDate() === today.getDate() &&
      taskDate.getMonth() === today.getMonth() &&
      taskDate.getFullYear() === today.getFullYear()
    );
  });

  return (
    <div className="mb-8">
      <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Today's Tasks</h2>
            <span className="text-sm text-muted-foreground">
              {format(today, "EEEE, MMMM do, yyyy")}
            </span>
          </div>
          
          {todaysTasks.length === 0 ? (
            <p className="text-muted-foreground">No tasks scheduled for today</p>
          ) : (
            <div className="space-y-4">
              {todaysTasks.map((task) => (
                <Card key={task.id} className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
                        {task.priority}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(task.dueDate), "h:mm a")}
                      </span>
                    </div>
                    <h3 className="font-medium">{task.title}</h3>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
