import { FC, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Sparkles, Clock, Loader2 } from "lucide-react";
import { FollowupEmailReviewPanel } from '@/components/task-board';
import { useFollowUpEmails } from "@/hooks/use-follow-up-emails";
import { cn } from "@/lib/utils";

export interface FloatingAutoFollowupProps {
  taskId: number | null;
}

export const FloatingAutoFollowup: FC<FloatingAutoFollowupProps> = ({ taskId }) => {
  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const { data: followUpEmails = [], isLoading } = useFollowUpEmails(taskId);
  
  // Filter to only show drafted emails
  const draftedEmails = followUpEmails.filter(email => email.status === 'drafted');
  
  // Only render when we have drafted emails to show
  // Don't render anything during loading to prevent flash
  if (draftedEmails.length === 0) {
    return null;
  }

  return (
    <>
      <div className="sticky bottom-4 z-10 mx-auto w-[90%]">
        <Card className="bg-gradient-to-r from-purple-100 to-indigo-100 border-purple-200 shadow-lg overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 -mt-8 -mr-8 bg-purple-200 rounded-full opacity-30"></div>
          <div className="absolute bottom-0 left-0 w-16 h-16 -mb-4 -ml-4 bg-indigo-200 rounded-full opacity-30"></div>
          <CardContent className="p-5 relative">
            <div className="flex items-center gap-3">
              <div className="bg-white p-2 rounded-full shadow-md">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center">
                  <h3 className="font-semibold text-purple-800 text-lg">
                    Eliza <span className="text-indigo-600">✨</span>
                  </h3>
                  <Sparkles className="h-4 w-4 text-yellow-400 ml-1" />
                </div>
                {isLoading ? (
                  <p className="text-sm flex items-center text-purple-700">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Preparing follow-ups...
                  </p>
                ) : (
                  <p className="text-sm text-purple-700 flex items-center">
                    <span className="font-medium">{draftedEmails.length}</span>
                    <span>&nbsp;follow-up email{draftedEmails.length !== 1 ? 's' : ''} ready to send</span>
                  </p>
                )}
                <div className="mt-3">
                  <Button
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white border-none shadow-md transition-all hover:shadow-lg"
                    onClick={() => setIsReviewPanelOpen(true)}
                  >
                    Review & Send
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <FollowupEmailReviewPanel
        isOpen={isReviewPanelOpen}
        onClose={() => setIsReviewPanelOpen(false)}
        taskId={taskId}
      />
    </>
  );
};