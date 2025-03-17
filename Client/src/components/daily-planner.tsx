import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageCircle, Send, Plus, Trash2, Clock, LayoutGrid, List, ChevronDown} from "lucide-react";
import {   } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaskMutations, useTasks } from "@/hooks/use-tasks";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDrag, useDrop } from 'react-dnd';

// Update Task interface to remove steps
interface Task {
  id: number;
  user_id: number;
  created_at: Date | null;
  email_id: string | null;
  category: string;
  title: string;
  description: string;
  status: 'todo' | 'completed';
  priority: string | null;
  due_date: string | null;
  updated_at: Date | null;
  notes?: TaskNote[]; 
  email?: {
    id: number;
    gmail_id: string;
    user_id: number;
    subject: string;
    enhanced_subject: string;
    sender: string;
    received_at: string;
    category: string;
    summary: string;
    metadata: any;
    is_processed: boolean;
    is_archived: boolean;
    needs_draft_processing: boolean;
    draft_processed_at: string | null;
  } | null;
}

interface TaskNote {
  id: number;
  author: string;
  content: string;
  timestamp: string;
}

interface NewTask {
  title: string;
  description: string;
  category: keyof typeof defaultCategoryColors | string;
  dueDate: string;
}

// Update TaskCard props to remove checklist-related props
interface TaskCardProps {
  task: Task;
  onStatusChange: (taskId: number, checked: boolean) => void;
  onDelete: (taskId: number) => void;
  categoryColors: Record<string, string>;
}

// Simplified TaskCard component without checklist functionality
function TaskCard({
  task,
  onStatusChange,
  onDelete,
  categoryColors,
}: TaskCardProps) {
 
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [newNote, setNewNote] = useState('');
  const { updateTask } = useTaskMutations();
  const { toast } = useToast();


  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      const newTaskNote = {
        id: Date.now(),
        author: "You", // You might want to get this from user context
        content: newNote,
        timestamp: new Date().toISOString(),
      };

      const updatedNotes = [...(task.notes || []), newTaskNote];

      await updateTask.mutateAsync({
        id: task.id,
        notes: updatedNotes
      });

      setNewNote('');

      toast({
        title: "Success",
        description: "Note added successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add note",
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddNote();
    }
  };

  const [{ isDragging }, drag] = useDrag(() => ({
    type: TASK_DND_TYPE,
    item: { id: task.id, currentStatus: task.status },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div ref={drag} style={{ opacity: isDragging ? 0.5 : 1 }}>
      <Card key={task.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={task.status === 'completed'}
              onCheckedChange={(checked: boolean) => onStatusChange(task.id, checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className={cn(
                  "font-medium",
                  task.status === 'completed' && "line-through text-muted-foreground"
                )}>
                  {task.title}
                </h3>
                <div className="flex items-center gap-2">
                  {task.due_date && (
                    <Badge variant="outline" className="text-muted-foreground">
                      <Clock className="h-4 w-4 mr-1" />
                      {format(new Date(task.due_date), 'MMM d, yyyy')}
                    </Badge>
                  )}
                  <Badge className={categoryColors[task.category] || defaultCategoryColors["Actions"]}>
                    {task.category}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {task.description && (
                <p className="mt-2 text-sm text-muted-foreground">{task.description}</p>
              )}

               {/* Notes Section */}
              {isNotesExpanded && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-3">
                    {task.notes?.map((note) => (
                      <div key={note.id} className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-sm">{note.author}</span>
                          <div className="flex items-center text-gray-500 text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            {format(new Date(note.timestamp), 'MMM d, h:mm a')}
                          </div>
                        </div>
                        <p className="text-sm mt-1">{note.content}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Input
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Add a note... (Press Enter to send)"
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleAddNote}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Update KanbanColumn props to remove checklist-related props
interface KanbanColumnProps {
  title: string;
  tasks: Task[];
  status: 'dueToday' | 'comingUp' | 'completed';
  className?: string;
  onStatusChange: (taskId: number, checked: boolean) => void;
  onDelete: (taskId: number) => void;
  categoryColors: Record<string, string>;
}

// Simplified KanbanColumn without checklist functionality
function KanbanColumn({
  title,
  tasks,
  status,
  className,
  onStatusChange,
  onDelete,
  categoryColors,
}: KanbanColumnProps) {
  const { updateTask } = useTaskMutations();
  const [{ isOver }, drop] = useDrop(() => ({
    accept: TASK_DND_TYPE,
    drop: (item: { id: number; currentStatus: string }) => {
      const newStatus = status === 'completed' ? 'completed' : 'todo';
      const newDueDate = status === 'dueToday'
        ? new Date().toISOString().split('T')[0]
        : status === 'comingUp'
          ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
          : null;

      updateTask.mutate({
        id: item.id,
        status: newStatus,
        due_date: newDueDate ? new Date(newDueDate) : null
      });
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }), [status, updateTask]);

  return (
    <div ref={drop} className={cn("flex-1 min-w-[350px]", isOver && "ring-2 ring-primary ring-opacity-50")}>
      <Card className={cn("h-full", className)}>
        <CardHeader className={cn(
          "rounded-t-lg",
          status === 'dueToday' && "bg-blue-50/80",
          status === 'comingUp' && "bg-purple-50/80",
          status === 'completed' && "bg-green-50/80"
        )}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <span className="text-sm text-muted-foreground">
              {tasks.length} tasks
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-4">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onStatusChange={onStatusChange}
                onDelete={onDelete}
                categoryColors={categoryColors}
              />
            ))}
            {tasks.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">
                No {status === 'dueToday' ? 'tasks due today' : status === 'comingUp' ? 'upcoming tasks' : 'completed tasks'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const defaultCategoryColors = {
  "Project Management": "bg-blue-100 text-blue-800",
  "Customer Support": "bg-purple-100 text-purple-800",
  "Marketing": "bg-green-100 text-green-800",
  "Finance": "bg-yellow-100 text-yellow-800",
  "HR": "bg-pink-100 text-pink-800",
  "Internal": "bg-gray-100 text-gray-800",
  "Leads": "bg-indigo-100 text-indigo-800",
  "Follow up": "bg-orange-100 text-orange-800"
} as const;

const TASK_DND_TYPE = 'task';

interface DailyPlannerProps {
  onTabChange?: (tab: string) => void;
}

export function DailyPlanner({ onTabChange }: DailyPlannerProps) {
  const { user, isLoading: isLoadingUser } = useUser();
  const [_, setLocation] = useLocation();
  const { data: tasks, isLoading } = useTasks();
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>(defaultCategoryColors);
  const [customCategory, setCustomCategory] = useState("");
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);
  const [sectionToDeleteAll, setSectionToDeleteAll] = useState<'dueToday' | 'comingUp' | 'completed' | null>(null);
  const [sectionsExpanded, setSectionsExpanded] = useState({
    dueToday: true,
    comingUp: true,
    completed: true
  });
  const [newTask, setNewTask] = useState<NewTask>({
    title: "",
    description: "",
    category: "Leads",
    dueDate: new Date().toISOString().split('T')[0],
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const { createTask, deleteTask, updateTask } = useTaskMutations();
  const { toast } = useToast();


  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    setLocation('/login');
    return null;
  }

  const handleCreateTask = async () => {
    
    try {
      await createTask.mutateAsync({
        title: newTask.title,
        description: newTask.description,
        tags: showCustomCategory ? customCategory : newTask.category,
        status: "todo",
        priority: "medium",
        dueDate: new Date(newTask.dueDate),
      });

      if (showCustomCategory && customCategory) {
        const colorCombos = [
          "bg-slate-100 text-slate-800",
          "bg-zinc-100 text-zinc-800",
          "bg-neutral-100 text-neutral-800",
          "bg-stone-100 text-stone-800",
          "bg-red-100 text-red-800",
          "bg-orange-100 text-orange-800",
          "bg-amber-100 text-amber-800",
          "bg-lime-100 text-lime-800",
          "bg-emerald-100 text-emerald-800",
          "bg-teal-100 text-teal-800",
          "bg-cyan-100 text-cyan-800",
          "bg-sky-100 text-sky-800",
          "bg-indigo-100 text-indigo-800",
          "bg-violet-100 text-violet-800",
          "bg-fuchsia-100 text-fuchsia-800",
          "bg-rose-100 text-rose-800",
        ] as const;
        const randomColor = colorCombos[Math.floor(Math.random() * colorCombos.length)];
        setCategoryColors(prev => ({
          ...prev,
          [customCategory]: randomColor
        }));
      }

      toast({
        title: "Success",
        description: "Action item created successfully",
      });

      setNewTask({
        title: "",
        description: "",
        category: "Leads",
        dueDate: new Date().toISOString().split('T')[0],
      });
      setCustomCategory("");
      setShowCustomCategory(false);
      setIsDialogOpen(false);

      if (onTabChange) {
        onTabChange("planner");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create action item",
        variant: "destructive",
      });
    }
  };

  const groupTasks = (tasks: Task[] | undefined) => {
    if (!tasks) return { dueToday: [], comingUp: [], completed: [] };

    

    const today = new Date().toISOString().split('T')[0];
    return tasks.reduce((acc, task) => {
      if (task.status === 'completed') {
        acc.completed.push(task);
        return acc;
      }

      if (!task.due_date) {
        acc.comingUp.push(task);
        return acc;
      }

      try {
        const taskDate = new Date(task.due_date).toISOString().split('T')[0];
        if (taskDate === today) {
          acc.dueToday.push(task);
        } else {
          acc.comingUp.push(task);
        }
      } catch (e) {
        acc.comingUp.push(task);
      }
      return acc;
    }, { dueToday: [], comingUp: [], completed: [] } as Record<string, Task[]>);
  };

  const groupedTasks = groupTasks(tasks as Task[] | undefined);
  if(groupedTasks){
    console.log(groupedTasks)
  }

  const handleTaskStatusChange = async (taskId: number, checked: boolean) => {
    try {
      await updateTask.mutateAsync({
        id: taskId,
        status: checked ? 'completed' : 'todo'
      });

      toast({
        title: "Success",
        description: `Task marked as ${checked ? 'completed' : 'todo'}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive",
      });
    }
  };


  const handleDeleteTask = async () => {
    if (!taskToDelete) return;

    try {
      await deleteTask.mutateAsync(taskToDelete);
      toast({
        title: "Success",
        description: "Action item deleted successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete action item",
        variant: "destructive",
      });
    } finally {
      setTaskToDelete(null);
    }
  };

  const handleDeleteAllInSection = async () => {
    if (!sectionToDeleteAll) return;

    try {
      const tasksToDelete = groupedTasks[sectionToDeleteAll];
      await Promise.all(tasksToDelete.map(task => deleteTask.mutateAsync(task.id)));

      toast({
        title: "Success",
        description: `All tasks in ${
          sectionToDeleteAll === 'dueToday' ? 'Due Today' :
            sectionToDeleteAll === 'comingUp' ? 'Coming Up' :
              'Completed'
        } deleted successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to delete tasks`,
        variant: "destructive",
      });
    } finally {
      setSectionToDeleteAll(null);
    }
  };

  const toggleSection = (section: 'dueToday' | 'comingUp' | 'completed') => {
    setSectionsExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };


  if (isLoading) {
    return <div className="p-8">Loading tasks...</div>;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="container mx-auto max-w-7xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Action Items</h1>
            <p className="text-sm text-muted-foreground mt-1">Organize and track your action items</p>
          </div>
          <div className="flex items-center gap-2">
          <Button
              onClick={() => setIsDialogOpen(true)}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 mr-2"
            >
              <Plus className="h-4 w-4" />
              Add Action Item
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
              className="gap-2"
            >
              {viewMode === 'list' ? (
                <>
                  <LayoutGrid className="h-4 w-4" />
                  <span>Kanban View</span>
                </>
              ) : (
                <>
                  <List className="h-4 w-4" />
                  <span>List View</span>
                </>
              )}
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Action Item</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="Enter action item title"
                      value={newTask.title}
                      onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      placeholder="Enter description"
                      value={newTask.description}
                      onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    {!showCustomCategory ? (
                      <div className="flex gap-2">
                        <Select
                          value={newTask.category}
                          onValueChange={(value) =>
                            setNewTask(prev => ({ ...prev, category: value }))
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(categoryColors).map((category) => (
                              <SelectItem key={category} value={category}>
                                <div className="flex items-center gap-2">
                                  <Badge className={categoryColors[category]}>
                                    {category}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowCustomCategory(true)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter new category"
                          value={customCategory}
                          onChange={(e) => setCustomCategory(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowCustomCategory(false);
                            setCustomCategory("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreateTask}
                    disabled={(!newTask.title || createTask.isPending) || (showCustomCategory && !customCategory)}
                  >
                    {createTask.isPending ? "Creating..." : "Create Action Item"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {viewMode === 'list' ? (
          <div className="space-y-8">
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleSection('dueToday')}
                      className="flex items-center gap-2"
                    >
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        !sectionsExpanded.dueToday && "-rotate-90"
                      )} />
                      <h2 className="text-lg font-semibold">Due Today</h2>
                    </button>
                    {groupedTasks.dueToday.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSectionToDeleteAll('dueToday')}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete All
                      </Button>
                    )}
                  </div>

                  {sectionsExpanded.dueToday && (
                    <div className="space-y-4">
                      {groupedTasks.dueToday.map((task) => (
                        <TaskCard key={task.id} task={task} onStatusChange={handleTaskStatusChange} onDelete={setTaskToDelete} categoryColors={categoryColors} />
                      ))}
                      {groupedTasks.dueToday.length === 0 && (
                        <p className="text-sm text-muted-foreground">No tasks due today</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleSection('comingUp')}
                      className="flex items-center gap-2"
                    >
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        !sectionsExpanded.comingUp && "-rotate-90"
                      )} />
                      <h2 className="text-lg font-semibold">Up Coming</h2>
                    </button>
                    {groupedTasks.comingUp.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSectionToDeleteAll('comingUp')}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete All
                      </Button>
                    )}
                  </div>

                  {sectionsExpanded.comingUp && (
                    <div className="space-y-4">
                      {groupedTasks.comingUp.map((task) => (
                        <TaskCard key={task.id} task={task} onStatusChange={handleTaskStatusChange} onDelete={setTaskToDelete} categoryColors={categoryColors} />
                      ))}
                      {groupedTasks.comingUp.length === 0 && (
                        <p className="text-sm text-muted-foreground">No upcoming tasks</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleSection('completed')}
                      className="flex items-center gap-2"
                    >
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        !sectionsExpanded.completed && "-rotate-90"
                      )} />
                      <h2 className="text-lg font-semibold">Completed</h2>
                    </button>
                    {groupedTasks.completed.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSectionToDeleteAll('completed')}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete All
                      </Button>
                    )}
                  </div>

                  {sectionsExpanded.completed && (
                    <div className="space-y-4">
                      {groupedTasks.completed.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onStatusChange={handleTaskStatusChange}
                          onDelete={setTaskToDelete}
                          categoryColors={categoryColors}
                        />
                      ))}
                      {groupedTasks.completed.length === 0 && (
                        <p className="text-sm text-muted-foreground">No completed tasks</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex gap-4 overflow-x-auto p-4 min-h-[calc(100vh-200px)]">
              <KanbanColumn
                title="Due Today"
                tasks={groupedTasks.dueToday}
                status="dueToday"
                onStatusChange={handleTaskStatusChange}
                onDelete={setTaskToDelete}
                categoryColors={categoryColors}
              />
              <KanbanColumn
                title="Coming Up"
                tasks={groupedTasks.comingUp}
                status="comingUp"
                onStatusChange={handleTaskStatusChange}
                onDelete={setTaskToDelete}
                categoryColors={categoryColors}
              />
              <KanbanColumn
                title="Completed"
                tasks={groupedTasks.completed}
                status="completed"
                onStatusChange={handleTaskStatusChange}
                onDelete={setTaskToDelete}
                categoryColors={categoryColors}
              />
            </div>
          </div>
        )}

        <AlertDialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Action Item</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this action item? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTask}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!sectionToDeleteAll} onOpenChange={() => setSectionToDeleteAll(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete All Tasks</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete all tasks in this section? Thisaction cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAllInSection}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DndProvider>
  );
}