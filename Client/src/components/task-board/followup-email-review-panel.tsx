import { FC, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit2, Check, Trash2, CheckSquare, ChevronUp, ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFollowUpEmails, useFollowUpEmailMutations } from "@/hooks/use-follow-up-emails";
import { useTaskById } from "@/hooks/use-tasks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface FollowupEmail {
  id: number;
  recipient: string;
  subject: string;
  content: string;
  status?: string;
}

export const FollowupEmailReviewPanel: FC<{ isOpen: boolean; onClose: () => void; taskId: number | null }> = ({
  isOpen,
  onClose,
  taskId
}) => {
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [editingEmailId, setEditingEmailId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<{
    recipient: string;
    email_subject: string;
    email_content: string;
  }>({
    recipient: '',
    email_subject: '',
    email_content: ''
  });
  
  const { data: followUpEmails = [], isLoading } = useFollowUpEmails(taskId);
  const { sendFollowUpEmail, deleteFollowUpEmail, updateFollowUpEmail } = useFollowUpEmailMutations();
  const { data: task } = useTaskById(taskId);

  const toggleEmailExpansion = (emailId: string) => {
    setExpandedEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  const handleApproveEmail = (emailId: number) => {
    sendFollowUpEmail.mutate(emailId);
  };

  const handleDiscardEmail = (emailId: number) => {
    deleteFollowUpEmail.mutate(emailId);
  };

  const handleApproveAll = () => {
    // Only approve emails that are in 'drafted' status
    followUpEmails
      .filter(email => email.status === 'drafted')
      .forEach(email => {
        sendFollowUpEmail.mutate(email.id);
      });
  };

  const startEditing = (email: any) => {
    setEditingEmailId(email.id);
    setEditFormData({
      recipient: email.recipient,
      email_subject: email.email_subject,
      email_content: email.email_content
    });
  };

  const cancelEditing = () => {
    setEditingEmailId(null);
    setEditFormData({
      recipient: '',
      email_subject: '',
      email_content: ''
    });
  };

  const handleSaveEdit = (emailId: number) => {
    updateFollowUpEmail.mutate({
      id: emailId,
      recipient: editFormData.recipient,
      email_subject: editFormData.email_subject,
      email_content: editFormData.email_content
    }, {
      onSuccess: () => {
        cancelEditing();
      }
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Filter to show only drafted emails
  const draftedEmails = followUpEmails.filter(email => email.status === 'drafted');

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <div className="h-full flex flex-col">
          <SheetHeader className="space-y-4 pb-4">
            <SheetTitle className="text-xl font-semibold">Review Follow-up Emails</SheetTitle>
            <div className="text-sm text-muted-foreground">
              {isLoading ? (
                <div className="flex items-center">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading follow-up emails...
                </div>
              ) : (
                `${draftedEmails.length} follow-up email${draftedEmails.length !== 1 ? 's' : ''} drafted`
              )}
            </div>
          </SheetHeader>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : draftedEmails.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p>No follow-up emails drafted for this task.</p>
              {task && (
                <p className="mt-2 text-sm">
                  Task: {task.title}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6 my-4">
              {draftedEmails.map((email) => (
                <Card key={email.id} className="relative">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {editingEmailId === email.id ? (
                        // Edit mode
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm font-medium mb-1 block">To:</label>
                            <Input 
                              name="recipient"
                              value={editFormData.recipient}
                              onChange={handleInputChange}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1 block">Subject:</label>
                            <Input 
                              name="email_subject"
                              value={editFormData.email_subject}
                              onChange={handleInputChange}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium mb-1 block">Content:</label>
                            <Textarea 
                              name="email_content"
                              value={editFormData.email_content}
                              onChange={handleInputChange}
                              className="w-full min-h-[150px]"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8"
                              onClick={cancelEditing}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => handleSaveEdit(email.id)}
                              disabled={updateFollowUpEmail.isPending}
                            >
                              {updateFollowUpEmail.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4 mr-1" />
                              )}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <>
                          <div>
                            <div className="font-medium">To: {email.recipient}</div>
                            <div className="text-sm font-medium mt-1">{email.email_subject}</div>
                          </div>

                          <div 
                            className={cn(
                              "bg-slate-50 p-3 rounded-lg cursor-pointer transition-all relative group",
                              expandedEmails.has(email.id.toString()) ? "min-h-[100px]" : "max-h-[60px] overflow-hidden"
                            )}
                            onClick={() => toggleEmailExpansion(email.id.toString())}
                          >
                            <p className="text-sm text-muted-foreground whitespace-pre-line">
                              {email.email_content}
                            </p>
                            <div className="absolute right-2 top-2 opacity-50 group-hover:opacity-100">
                              {expandedEmails.has(email.id.toString()) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2 justify-end">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8"
                              onClick={() => startEditing(email)}
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => handleApproveEmail(email.id)}
                              disabled={sendFollowUpEmail.isPending}
                            >
                              {sendFollowUpEmail.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4 mr-1" />
                              )}
                              Approve
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleDiscardEmail(email.id)}
                              disabled={deleteFollowUpEmail.isPending}
                            >
                              {deleteFollowUpEmail.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 mr-1" />
                              )}
                              Discard
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {draftedEmails.length > 0 && (
            <div className="mt-auto pt-4 border-t">
              <Button 
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={handleApproveAll}
                disabled={sendFollowUpEmail.isPending}
              >
                {sendFollowUpEmail.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckSquare className="h-4 w-4 mr-2" />
                )}
                Approve All Emails
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};