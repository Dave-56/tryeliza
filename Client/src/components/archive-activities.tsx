import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Package, Archive } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ArchiveStats {
  emailsArchived: number;
  categoryArchives: number;
  keywordArchives: number;
  categoryBreakdown: Record<string, number>;
}

interface ArchiveActivity {
  id: number;
  title: string;
  archive_reason: string;
  category: string;
  status: string;
  archived_at: string;
}

async function fetchArchiveStats(): Promise<ArchiveStats> {
  const response = await fetch('/api/archive-stats');
  if (!response.ok) {
    throw new Error('Failed to fetch archive stats');
  }
  return response.json();
}

async function fetchArchiveActivities(): Promise<ArchiveActivity[]> {
  const response = await fetch('/api/archive-activities');
  if (!response.ok) {
    throw new Error('Failed to fetch archive activities');
  }
  return response.json();
}

export function ArchiveActivities() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['archiveStats'],
    queryFn: fetchArchiveStats,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['archiveActivities'],
    queryFn: fetchArchiveActivities,
    refetchInterval: 30000,
  });

  if (statsLoading || activitiesLoading) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Archive Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            <div className="flex items-center">
              <Package className="mr-2 h-4 w-4 text-muted-foreground" />
              Loading archive statistics...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          Archive Activities
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Emails Archived Today
              </p>
              <p className="text-2xl font-bold">{stats?.emailsArchived || 0}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Category Archives
              </p>
              <p className="text-2xl font-bold">{stats?.categoryArchives || 0}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Keyword Archives
              </p>
              <p className="text-2xl font-bold">{stats?.keywordArchives || 0}</p>
            </div>
          </div>

          {/* Category Breakdown */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              Category Breakdown
            </h3>
            <div className="space-y-2">
              {stats?.categoryBreakdown && Object.entries(stats.categoryBreakdown).map(([category, count]) => (
                <div key={category} className="flex justify-between items-center">
                  <span className="text-sm">{category}</span>
                  <span className="text-sm font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activities */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              Recent Archive Activities
            </h3>
            <div className="space-y-4">
              {activities?.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {activity.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {activity.archive_reason}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(activity.archived_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
