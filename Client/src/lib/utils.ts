import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Task } from "@/types/task";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizePriority(priority: string | null | undefined): Task['priority'] | '' {
  if (!priority) return '';
  
  const lowercased = priority.toLowerCase();
  
  switch (lowercased) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'urgent':
      return 'Urgent';
    default:
      return '';
  }
}