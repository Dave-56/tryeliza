import { TaskPanel } from "@/components/task-board/task-panel";
import { Dispatch, SetStateAction } from "react";

interface WorkflowPageProps {
  onTabChange?: Dispatch<SetStateAction<string>>;
}

export default function WorkflowPage({ onTabChange }: WorkflowPageProps) {
  return <TaskPanel onTabChange={onTabChange} />;
}