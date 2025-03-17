import { FC, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useColumnMutations, useColumns } from "@/hooks/use-column";
import { useToast } from "@/hooks/use-toast";

export const AddColumnDialog: FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [columnName, setColumnName] = useState("");
  const [positionType, setPositionType] = useState<string>("end");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { createColumn } = useColumnMutations();
  const { data: columns, isLoading: isLoadingColumns } = useColumns();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!columnName.trim()) {
      toast({
        title: "Error",
        description: "Column name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Calculate position based on selection
      let position: number | undefined;
      
      if (columns && columns.length > 0) {
        if (positionType === "end") {
          // Place at the end
          position = columns.length;
        } else if (positionType.startsWith("after-")) {
          // Extract column id from the position type
          const afterColumnId = parseInt(positionType.replace("after-", ""));
          const afterColumn = columns.find(col => col.id === afterColumnId);
          
          if (afterColumn) {
            position = afterColumn.position + 1;
          }
        }
      } else {
        // First column
        position = 0;
      }
      
      await createColumn.mutateAsync({
        title: columnName,
        position
      });
      
      toast({
        title: "Success",
        description: "Column created successfully",
        variant: "default",
      });
      
      // Reset form and close dialog
      setColumnName("");
      setPositionType("end");
      onClose();
    } catch (error) {
      console.error("Error creating column:", error);
      toast({
        title: "Error",
        description: "Failed to create column",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Column</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="columnName" className="text-sm font-medium">
                Column Name
              </label>
              <Input
                id="columnName"
                placeholder="Enter column name..."
                className="col-span-3"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="position" className="text-sm font-medium">
                Position
              </label>
              <select 
                id="position"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={positionType}
                onChange={(e) => setPositionType(e.target.value)}
              >
                <option value="end">At the end</option>
                {isLoadingColumns ? (
                  <option disabled>Loading columns...</option>
                ) : columns && columns.length > 0 ? (
                  columns.map(column => (
                    <option key={column.id} value={`after-${column.id}`}>
                      After "{column.title}"
                    </option>
                  ))
                ) : (
                  <option disabled>No existing columns</option>
                )}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Add Column"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};