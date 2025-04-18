import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Mail, Clock, AlertCircle, CheckCircle, RefreshCw, ExternalLink, 
  Calendar, ChevronRight, Clock3, Archive, BellOff, MoreHorizontal
} from "lucide-react";

type ThreadStatus = 'waiting_on_them' | 'you_owe_reply' | 'stalled';

interface Thread {
  thread_id: string;
  subject: string;
  participants: { name: string; email: string }[];
  status: ThreadStatus;
  last_activity: string;
  resolved: boolean;
  confidence: number;
  days_waiting: number;
}

const MOCK_THREADS: Thread[] = [
  {
    thread_id: "t1",
    subject: "Project proposal review",
    participants: [{ name: "Sarah Johnson", email: "sarah@example.com" }],
    status: "waiting_on_them",
    last_activity: "2025-04-10T14:30:00Z",
    resolved: false,
    confidence: 0.92,
    days_waiting: 7
  },
  {
    thread_id: "t2",
    subject: "Meeting scheduling for next week",
    participants: [{ name: "David Chen", email: "david@example.com" }],
    status: "you_owe_reply",
    last_activity: "2025-04-15T09:15:00Z",
    resolved: false,
    confidence: 0.88,
    days_waiting: 2
  },
  {
    thread_id: "t3",
    subject: "Quarterly budget review",
    participants: [{ name: "Finance Team", email: "finance@example.com" }],
    status: "stalled",
    last_activity: "2025-04-05T11:20:00Z",
    resolved: false,
    confidence: 0.75,
    days_waiting: 12
  },
  {
    thread_id: "t4",
    subject: "Client presentation feedback",
    participants: [{ name: "Alex Wong", email: "alex@example.com" }],
    status: "waiting_on_them",
    last_activity: "2025-04-14T16:45:00Z",
    resolved: false,
    confidence: 0.89,
    days_waiting: 3
  }
];

// Status mapping for UI elements
const STATUS_CONFIG = {
  waiting_on_them: {
    label: "Waiting on them",
    icon: Clock,
    color: "bg-amber-100 text-amber-800",
    description: "You sent the last message, awaiting reply"
  },
  you_owe_reply: {
    label: "You owe reply",
    icon: Mail,
    color: "bg-blue-100 text-blue-800",
    description: "They've replied, waiting for your response"
  },
  stalled: {
    label: "Stalled",
    icon: AlertCircle,
    color: "bg-red-100 text-red-800",
    description: "No recent activity in this thread"
  }
};

export default function FollowupTracker({ onTabChange }: { onTabChange: (value: string) => void }) {
  const [threads, setThreads] = useState(MOCK_THREADS);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState("all");

  // When the active tab changes, call the onTabChange prop if it exists
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };
  // Simulate fetching data
  const refreshThreads = () => {
    setIsLoading(true);
    // In a real implementation, this would be an API call
    setTimeout(() => {
      setIsLoading(false);
      setLastSynced(new Date());
    }, 1500);
  };

  // Mark a thread as resolved
  const markAsDone = (threadId: string) => {
    setThreads(threads.map(thread => 
      thread.thread_id === threadId ? { ...thread, resolved: true } : thread
    ));
  };

  // Filter threads based on active tab
  const filteredThreads = threads.filter(thread => {
    if (thread.resolved) return false;
    if (activeTab === "all") return true;
    return thread.status === activeTab;
  });

  // Count threads by status
  const counts = {
    all: threads.filter(t => !t.resolved).length,
    waiting_on_them: threads.filter(t => t.status === "waiting_on_them" && !t.resolved).length,
    you_owe_reply: threads.filter(t => t.status === "you_owe_reply" && !t.resolved).length,
    stalled: threads.filter(t => t.status === "stalled" && !t.resolved).length
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Pulse</h1>
          <p className="text-muted-foreground">
            Track and manage your ongoing email conversations
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Last synced: {lastSynced.toLocaleTimeString()}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshThreads} 
            disabled={isLoading}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Sync</span>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">
            All
            <Badge variant="secondary" className="ml-2">{counts.all}</Badge>
          </TabsTrigger>
          <TabsTrigger value="waiting_on_them">
            Waiting on Them
            <Badge variant="secondary" className="ml-2">{counts.waiting_on_them}</Badge>
          </TabsTrigger>
          <TabsTrigger value="you_owe_reply">
            You Owe Reply
            <Badge variant="secondary" className="ml-2">{counts.you_owe_reply}</Badge>
          </TabsTrigger>
          <TabsTrigger value="stalled">
            Stalled
            <Badge variant="secondary" className="ml-2">{counts.stalled}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredThreads.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-xl font-medium">All caught up!</h3>
                <p className="text-muted-foreground text-center mt-2">
                  No pending follow-ups in this category.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredThreads.map(thread => (
                <Card key={thread.thread_id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex items-start p-4">
                      <Avatar className="h-10 w-10 mr-4">
                        <div className="bg-primary text-primary-foreground rounded-full h-full w-full flex items-center justify-center">
                          {thread.participants[0].name.charAt(0)}
                        </div>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium truncate">{thread.subject}</h3>
                          <Badge 
                            className={`${STATUS_CONFIG[thread.status as ThreadStatus].color} ml-2`}
                          >
                            {React.createElement(STATUS_CONFIG[thread.status as ThreadStatus].icon, { className: "h-3 w-3 mr-1" })}
                            {STATUS_CONFIG[thread.status as ThreadStatus].label}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-muted-foreground mt-1">
                          <span>{thread.participants[0].name}</span>
                          <span className="mx-2">•</span>
                          <span>{thread.days_waiting} days ago</span>
                        </div>
                        
                        <Badge 
                          className={`${STATUS_CONFIG[thread.status as ThreadStatus].color} ml-2`}
                        >
                          {React.createElement(STATUS_CONFIG[thread.status as ThreadStatus].icon, { className: "h-3 w-3 mr-1" })}
                          {STATUS_CONFIG[thread.status as ThreadStatus].label}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="border-t flex">
                      <Button 
                        variant="ghost" 
                        className="flex-1 rounded-none h-12"
                        onClick={() => markAsDone(thread.thread_id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Done
                      </Button>
                      
                      <div className="border-l h-12" />
                      
                      <Button 
                        variant="ghost" 
                        className="flex-1 rounded-none h-12"
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Remind Later
                      </Button>
                      
                      <div className="border-l h-12" />
                      
                      <Button 
                        variant="ghost" 
                        className="flex-1 rounded-none h-12"
                        onClick={() => window.open(`https://mail.google.com/mail/u/0/#search/rfc822msgid:${thread.thread_id}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in Gmail
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}