import {
  Inbox,
  Settings,
  ChevronLeft,
  BarChart,
  CalendarClock,
  LayoutGrid
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Define main menu items separately from settings
const menuItems = [
  // {
  //   title: "Inbox Summary",
  //   icon: <Inbox className="h-4 w-4" />,
  //   path: "/",
  //   value: "inbox",
  // },
  {
    title: "Email Digest",
    icon: <Inbox className="h-4 w-4" />,
    path: "/email-digest",
    value: "email-digest",
  },
  {
    title: "Tasks",
    icon: <LayoutGrid className="h-4 w-4" />,
    path: "/workflow",
    value: "workflow",
  },
  {
    title: "Analytics",
    icon: <BarChart className="h-4 w-4" />,
    path: "/analytics",
    value: "analytics",
  }
];

// Settings menu item defined separately
const settingsItem = {
  title: "Settings",
  icon: <Settings className="h-4 w-4" />,
  path: "/settings",
  value: "settings",
};

export function Sidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (value: string) => void;
}) {
  const [location, setLocation] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const MenuItem = ({ item }: { item: (typeof menuItems)[0] }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => {
            onTabChange(item.value);
            setLocation(item.path);
          }}
          className={cn(
            "w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors",
            isCollapsed ? "justify-center px-0" : "px-4",
            activeTab === item.value
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted-foreground/10",
          )}
        >
          {item.icon}
          {!isCollapsed && <span>{item.title}</span>}
        </button>
      </TooltipTrigger>
      {isCollapsed && (
        <TooltipContent side="right">{item.title}</TooltipContent>
      )}
    </Tooltip>
  );

  return (
    <TooltipProvider>
      <div
        className={cn(
          "h-svh bg-muted/50 border-r transition-all duration-300 ease-in-out",
          isCollapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-svh flex-col">
          <div className="flex-1 overflow-y-auto">
            <ScrollArea className="py-6">
              <nav className="px-2 space-y-3 mt-8">
                {menuItems.map((item) => (
                  <MenuItem key={item.value} item={item} />
                ))}
              </nav>
            </ScrollArea>
          </div>

          {/* Settings positioned at the bottom */}
          <div className="px-2 mb-4">
            <MenuItem item={settingsItem} />
          </div>

          {/* Collapse button */}
          <div className="p-4 border-t border-border/50">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="w-full flex items-center justify-center hover:bg-muted-foreground/10 rounded-md h-8"
            >
              <ChevronLeft
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isCollapsed && "rotate-180",
                )}
              />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}