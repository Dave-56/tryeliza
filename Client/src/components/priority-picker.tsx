import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ArrowUp, ArrowRight, ArrowDown } from "lucide-react";

const priorities = [
  { value: "Urgent", label: "Urgent", icon: <AlertTriangle className="h-4 w-4 text-red-500" /> },
  { value: "High", label: "High", icon: <ArrowUp className="h-4 w-4 text-orange-500" /> },
  { value: "Medium", label: "Medium", icon: <ArrowRight className="h-4 w-4 text-yellow-500" /> },
  { value: "Low", label: "Low", icon: <ArrowDown className="h-4 w-4 text-green-500" /> },
];

export function PriorityPicker({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {priorities.map((priority) => (
          <SelectItem
            key={priority.value}
            value={priority.value}
            className="flex items-center gap-2"
          >
            {priority.icon}
            {priority.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
