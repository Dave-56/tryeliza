import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Mail, Clock, ActivityIcon, AlertCircle, Loader2, CheckSquare, ListTodo, BarChart, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { useAnalytics, useTotalAnalytics, useDateRangeAnalytics, useDraftActivities } from "@/hooks/use-analytics";

interface DraftActivity {
  title: string;
  status: string;
  created_at: string;
}

// Define the structure of an activity for display
interface ActivityDisplay {
  title: string;
  status: string;
  timestamp: string;
  type?: string;
  additionalInfo?: string;
}

export function AnalyticsPanel() {
  const { user, isLoading: isLoadingUser } = useUser();
  const [_, setLocation] = useLocation();
  const { data: analytics, isLoading: isLoadingAnalytics } = useAnalytics();
  const { data: totalAnalytics, isLoading: isLoadingTotalAnalytics } = useTotalAnalytics();
  
  // Fetch draft activities
  const { data: draftActivities, isLoading: isLoadingDraftActivities } = useDraftActivities(10);
  
  // Date range state
  const [startDate, setStartDate] = useState<Date | undefined>(
    new Date(new Date().setDate(new Date().getDate() - 7)) // Default to 7 days ago
  );
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  
  // Format dates for the API
  const formattedStartDate = startDate ? format(startDate, 'yyyy-MM-dd') : undefined;
  const formattedEndDate = endDate ? format(endDate, 'yyyy-MM-dd') : undefined;

  // Fetch date range analytics
  const { 
    data: dateRangeAnalytics, 
    isLoading: isLoadingDateRangeAnalytics 
  } = useDateRangeAnalytics(formattedStartDate, formattedEndDate);

  if(isLoadingAnalytics || isLoadingTotalAnalytics || isLoadingDateRangeAnalytics || isLoadingDraftActivities) 
    return <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>;

  // Convert draft activities to display format
  const allActivities: ActivityDisplay[] = draftActivities?.map(activity => ({
    title: activity.title,
    status: activity.status,
    timestamp: activity.created_at || new Date().toISOString(),
    type: 'draft',
    additionalInfo: activity.email_id ? `Email ID: ${activity.email_id}` : undefined
  })) || [];
  
  // Show loading state while checking authentication
  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    setLocation('/login');
    return null;
  }

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">User Analytics</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ActivityIcon className="h-5 w-5 text-purple-500" />
              <span className="text-sm text-muted-foreground">Emails Processed</span>
            </div>
            <p className="text-2xl font-bold">{analytics?.emailsProcessed || 0}</p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-indigo-500" />
              <span className="text-sm text-muted-foreground">Task Conversion</span>
            </div>
            <p className="text-2xl font-bold">{analytics?.taskConversion.percentage || 0}%</p>
            <p className="text-sm font-normal">{analytics?.taskConversion.emailsToTasks || 0} emails  -&gt; tasks</p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">Drafts Created</span>
            </div>
            <p className="text-2xl font-bold">{analytics?.draftsCreated || 0}</p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Pending Drafts</span>
            </div>
            <p className="text-2xl font-bold">{analytics?.pendingDrafts || 0}</p>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Draft Activities</h2>
        <div className="space-y-4">
          {allActivities.map((activity, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b last:border-0 border-border/50">
              <div className="flex flex-col">
                <p className="font-medium text-sm">{activity.title}</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">{activity.status}</p>
                  {activity.additionalInfo && (
                    <p className="text-xs text-muted-foreground">
                      {activity.additionalInfo}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-sm text-muted-foreground">
                {activity.timestamp ? format(parseISO(activity.timestamp), 'h:mm a, MMM d') : 'Unknown date'}
              </span>
            </div>
          ))}
          {allActivities.length === 0 && (
            <p className="text-sm text-muted-foreground">No recent draft activities</p>
          )}
        </div>
      </Card>
    </div>
  );
}