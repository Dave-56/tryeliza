import { FC, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTaskMutations } from '@/hooks/use-tasks';
import { useEmailAccounts } from '@/hooks/use-email';
import { useToast } from '@/hooks/use-toast';

// Define the form data type
interface TaskFormData {
  title: string;
  description: string;
  sender_name: string;
  sender_email: string;
  column_id: number | null;
  priority: string;
  due_date: string;
  status: string;
account_id: number | null;
}

export const AddTaskDialog: FC<{ isOpen: boolean; onClose: () => void; columnId?: number; }> = ({ isOpen, onClose, columnId }) => {
  const { createTask } = useTaskMutations();
  const { toast } = useToast();
  const { data: emailAccounts, isLoading: isLoadingAccounts } = useEmailAccounts();

  const [formData, setFormData] = useState<TaskFormData>({
    title: "",
    description: "",
    sender_name: "Me", // Set sender name to "Me" by default
    sender_email: "",
    column_id: columnId || null,
    priority: "medium",
    due_date: "",
    status: "Inbox",
    account_id: null
  });

  // Set the default account to the first account when accounts are loaded
  useEffect(() => {
    if (emailAccounts && emailAccounts.length > 0 && !formData.account_id) {
      setFormData(prev => ({
        ...prev,
                account_id: Number(emailAccounts[0].id)
      }));
    }
  }, [emailAccounts]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    
    // Special handling for account_id to ensure it's a number or null
    if (id === 'account_id') {
      setFormData((prev: TaskFormData) => ({ 
        ...prev, 
                [id]: value ? Number(value) : null 
      }));
    } else {
      setFormData((prev: TaskFormData) => ({ ...prev, [id]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Convert due_date string to Date object if it exists
      const taskData = {
        ...formData,
        // Convert column_id to a valid integer or null
        column_id: formData.column_id !== null && !isNaN(Number(formData.column_id)) 
          ? Number(formData.column_id) 
          : null,
        due_date: formData.due_date ? new Date(formData.due_date) : undefined,
        // Convert account_id to a valid integer or null
        account_id: formData.account_id !== null && !isNaN(Number(formData.account_id))
          ? Number(formData.account_id)
          : null,
        received_date: new Date(), // Set current date as received date
      };

      await createTask.mutateAsync(taskData);
      toast({
        title: "Success",
        description: "Task created successfully",
        variant: "default",
      });
      resetForm();
      onClose();
    } catch (error) {
      console.error("Error creating task:", error);
      toast({
        title: "Error",
        description: "Failed to create task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      sender_name: "",
      sender_email: "",
      column_id: columnId || null,
      priority: "medium",
      due_date: "",
      status: "Inbox",
      account_id: null
    });
  };
        
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="title" className="text-sm font-medium">
              Title
              </label>
              <Input
              id="title"
              placeholder="Enter task title..."
              value={formData.title}
              onChange={handleChange}
              className="col-span-3"
              required
              />
            </div>
            {/* <div className="grid gap-2">
              <label htmlFor="sender_name" className="text-sm font-medium">
                  Contact Name
              </label>
              <Input
                  id="sender_name"
                  placeholder="Enter sender name..."
                  value={formData.sender_name}
                  onChange={handleChange}
                  required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="sender_email" className="text-sm font-medium">
                  Contact Email
              </label>
              <Input
                  id="sender_email"
                  placeholder="Enter sender email..."
                  value={formData.sender_email}
                  onChange={handleChange}
              />
            </div> */}
            <div className="grid gap-2">
              <label htmlFor="account_id" className="text-sm font-medium">
                  Email Account
              </label>
              <select
                  id="account_id"
                  value={formData.account_id || ""}
                  onChange={handleChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                  <option value="">Account(s)</option>
                  {isLoadingAccounts ? (
                      <option disabled>Loading accounts...</option>
                  ) : emailAccounts && emailAccounts.length > 0 ? (
                      emailAccounts.map(account => (
                          <option key={account.id} value={account.id}>
                            {account.emailAddress} ({account.provider})
                          </option>
                      ))
                  ) : (
                      <option disabled>No email accounts found</option>
                  )}
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="column_id" className="text-sm font-medium">
              Column
              </label>
              <select
              id="column_id"
              value={formData.column_id || ""} 
              onChange={handleChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                  <option value="">Select Column</option>
                  <option value="1">Inbox</option>
                  <option value="2">In Progress</option>
                  <option value="3">Waiting</option>
                  <option value="4">Completed</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="priority" className="text-sm font-medium">
                  Priority
              </label>
              <select 
                  id="priority" 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.priority}
                  onChange={handleChange}
              >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="description" className="text-sm font-medium">
              Description
              </label>
              <Textarea
              id="description"
              placeholder="Enter task description..."
              className="col-span-3"
              value={formData.description}
              onChange={handleChange}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="due_date" className="text-sm font-medium">
              Due Date
              </label>
              <Input
              id="due_date"
              type="date"
              className="col-span-3"
              value={formData.due_date}
              onChange={handleChange}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                  Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                  { isSubmitting ? "Adding..." : "Add Task" }
              </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};