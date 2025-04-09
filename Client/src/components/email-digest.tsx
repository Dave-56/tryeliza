import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {Calendar, Mail, Plane, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Wand2, RefreshCcw, Sun, Moon, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, addDays, isToday, parseISO, subWeeks, isSameDay, differenceInWeeks, addWeeks, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { useEmailAccounts, useManualSync } from "@/hooks/use-email";
import { useEmailDigest, formatUTCToLocal } from "@/hooks/use-summaries";
import { CATEGORY_ORDER, CATEGORY_CONFIG } from "@/constants/email-categories";
import { 
  EmailSummary, 
} from '../types/email-digest';

function WeeklyCalendar({ lastUpdated, refetch, isFetching, selectedDate, onDateSelect, now }: { 
  lastUpdated?: string, 
  refetch: () => void, 
  isFetching: boolean,
  selectedDate: Date | null,
  onDateSelect: (date: Date | null) => void,
  now: Date
}) {
  console.log('DEBUG - now:', format(now, 'yyyy-MM-dd HH:mm:ss'));
  console.log('DEBUG - selectedDate:', selectedDate ? format(selectedDate, 'yyyy-MM-dd HH:mm:ss') : 'null');
  
  // Negative offset means going back in time (previous weeks)
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week, etc.
  
  // Calculate the start of the displayed week based on the offset
  const currentWeekStart = startOfWeek(now);
  console.log('DEBUG - currentWeekStart:', format(currentWeekStart, 'yyyy-MM-dd HH:mm:ss'));
  
  // For negative offsets (past weeks), use subWeeks
  const displayedWeekStart = weekOffset < 0 
    ? subWeeks(currentWeekStart, Math.abs(weekOffset)) 
    : currentWeekStart;
  
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(displayedWeekStart, i);
    const isPast = startOfDay(date) < now;
    return {
      date,
      dayName: format(date, 'EEE'),
      dayNum: format(date, 'd'),
      isPast: startOfDay(date) < now
    };
  });

  const handleDateClick = (date: Date) => {
    // Allow clicking on past dates and today's date
    if (startOfDay(date) <= now) {
      console.log(`Clicked on date: ${format(date, 'yyyy-MM-dd')}`);
      
      // If the same date is clicked again, deselect it
      if (selectedDate && isSameDay(selectedDate, date)) {
        onDateSelect(null);
      } else {
        // Otherwise, select the new date
        onDateSelect(startOfDay(date));
      }
    }
  };
  
  // Navigate to previous week
  const goToPreviousWeek = () => {
    console.log("Going to previous week, current offset:", weekOffset);
    // Decrement the offset to go back one week
    setWeekOffset(prev => prev - 1);
  };
  
  // Navigate to next week (but not beyond current week)
  const goToNextWeek = () => {
    console.log("Going to next week, current offset:", weekOffset);
    // Only allow going forward if we're not already at the current week
    if (weekOffset < 0) {
      const newOffset = weekOffset + 1;
      setWeekOffset(newOffset);
      
      // If there's a selected date, update it to the same day in the next week
      if (selectedDate) {
        const newDate = addWeeks(selectedDate, 1);
        // Only update if the new date is not in the future
        if (newDate <= now) {
          onDateSelect(newDate);
        } else {
          // If the new date would be in the future, deselect the date
          onDateSelect(null);
        }
      }
    }
  };
  
  // Check if we're viewing the current week
  const isCurrentWeek = weekOffset === 0;
  
  // Format the week range for display (e.g., "Mar 10 - Mar 16")
  const weekRangeText = `${format(displayedWeekStart, 'MMM d')} - ${format(addDays(displayedWeekStart, 6), 'MMM d')}`;

  // Extract the formatted date from our special format
  const formattedLastUpdated = lastUpdated 
    ? (lastUpdated.includes('FIXED_DATE_VALUE') 
        ? lastUpdated.split('||')[2] // Extract the formatted date part
        : lastUpdated)
    : "Not available";

  // Check if the selected date is in the currently displayed week
  const isSelectedDateInCurrentWeek = selectedDate && 
    days.some(day => isSameDay(day.date, selectedDate));
  
  // If we have a selected date but it's not in the current week view,
  // automatically navigate to the week containing that date
  useEffect(() => {
    if (selectedDate && !isSelectedDateInCurrentWeek) {
      // Only auto-navigate when the selected date changes, not during manual navigation
      const selectedWeekStart = startOfWeek(selectedDate);
      const currentWeekStart = startOfWeek(now);
      const weekDiff = differenceInWeeks(currentWeekStart, selectedWeekStart);
      
      // Add a check to prevent override during manual navigation
      if (weekDiff >= 0 && weekOffset === 0) {  // Only adjust if we're at the current week
        setWeekOffset(-weekDiff);
      } else if (weekDiff < 0) {
        setWeekOffset(0);
        onDateSelect(null);
      }
    }
  }, [selectedDate]); // Remove isSelectedDateInCurrentWeek and now from dependencies

  return (
    <div className="mt-2 mb-6 relative">
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm text-muted-foreground">
              <span className="ml-2 text-primary font-medium">
                Viewing: {format(startOfDay(selectedDate || now), 'MMM d, yyyy')}
                {!selectedDate}
              </span>
            </div>
            {lastUpdated && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
                <Calendar className="h-4 w-4" />
                <span>Last updated: {formattedLastUpdated}</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 w-7 p-0 ml-1"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  aria-label="Refresh email digest"
                >
                  {isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            )}
          </div>
          
          {/* Week navigation controls */}
          <div className="flex justify-between items-center mb-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToPreviousWeek}
              className="flex items-center gap-1"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-xs">Previous</span>
            </Button>
            
            <div className="text-sm font-medium">{weekRangeText}</div>
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToNextWeek}
              disabled={isCurrentWeek}
              className="flex items-center gap-1"
              aria-label="Next week"
            >
              <span className="text-xs">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => (
              <div
                key={day.date.toISOString()}
                className={cn(
                  "flex flex-col items-center justify-center p-2 rounded-lg",
                  selectedDate 
                    ? (isSameDay(startOfDay(selectedDate), startOfDay(day.date)) ? "bg-black text-white" : "")
                    : (isSameDay(startOfDay(now), startOfDay(day.date)) ? "bg-black text-white" : ""),
                  day.isPast && "cursor-pointer hover:bg-muted"
                )}
                onClick={() => handleDateClick(day.date)}
                role={day.isPast ? "button" : "presentation"}
                tabIndex={day.isPast ? 0 : undefined}
              >
                <span className="text-xs font-medium">{day.dayName}</span>
                <span className="text-sm font-bold">{day.dayNum}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const handleViewEmail = (gmail_id: string, category: string) => {
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${gmail_id}`;
  window.open(gmailUrl, '_blank');
};

interface EmailDigestProps {
  onTabChange?: (tab: string) => void;
}

function useScheduledRefetch() {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    // Function to check if it's time to refetch
    const checkRefetchTime = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      
      // Refetch at 7:00-7:05 AM and 4:00-4:05 PM
      if ((hours === 7 || hours === 16) && minutes < 5) {
        queryClient.invalidateQueries({ queryKey: ['email-digest'] });
      }
    };
    
    // Check every minute
    const intervalId = setInterval(checkRefetchTime, 60000);
    
    // Initial check
    checkRefetchTime();
    
    // Cleanup
    return () => clearInterval(intervalId);
  }, [queryClient]);
}
  
export function EmailDigest({ onTabChange }: EmailDigestProps) {
  const now = useMemo(() => startOfDay(new Date()), []);
  
  // Utility function to parse and render links in the format "descriptive text||url"
  const renderLinkText = (text: string): ReactNode => {
    if (text.includes('||')) {
      const [linkText, url] = text.split('||');
      return (
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80 underline flex items-center gap-1 inline-flex"
        >
          {linkText}
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="text-primary/70 ml-0.5"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      );
    }
    return text;
  };

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({});
  
  // Get the current URL parameters
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get('date');
  const periodParam = params.get('period');
  
  // Initialize selectedDate from URL parameter if it exists, otherwise use today
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    // Initialize from URL params
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    if (dateParam) {
      const parsedDate = startOfDay(parseISO(`${dateParam}T00:00:00`));
      if (!isNaN(parsedDate.getTime()) && parsedDate <= now) {
        return parsedDate;
      }
    }
    return null;
  });
  
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "evening">(() => {
    const params = new URLSearchParams(window.location.search);
    const defaultPeriod = periodParam === 'morning' || periodParam === 'evening' 
      ? periodParam 
      : new Date().getHours() < 16 ? 'morning' : 'evening';
    
    // Always ensure period and date are in URL
    let needsUpdate = false;
    if (!periodParam) {
      params.set('period', defaultPeriod);
      needsUpdate = true;
    }
    if (!dateParam) {
      params.set('date', format(now, 'yyyy-MM-dd'));
      needsUpdate = true;
    }
    if (needsUpdate) {
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
    return defaultPeriod;
  });


  useScheduledRefetch();

  // Get the trigger summary mutation
  // const { mutate: triggerSummary, isPending: isGenerating } = useTriggerSummary();

  // Handle date selection
  const handleDateSelect = (date: Date | null) => {
    setSelectedDate(date);
    // Update URL parameter
    const params = new URLSearchParams(window.location.search);
    if (date) {
      params.set('date', format(date, 'yyyy-MM-dd'));
    } else {
      params.delete('date');
    }
    // Update URL without reloading the page
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    // Reset expanded states when changing date
    setExpandedCategories({});
    setExpandedEmails({});
  };

  // Add this hook for manual triggering
  // const handleGenerateSummary = () => {
  //   triggerSummary(timeOfDay, {
  //     onSuccess: () => {
  //       // Force a refetch after the summary is generated
  //       setTimeout(() => {
  //         refetch();
  //       }, 1000); // Add a slight delay to ensure the backend has processed the summary
  //     }
  //   });
  // };

  const handleTimeOfDayChange = (newTimeOfDay: 'morning' | 'evening') => {
    setTimeOfDay(newTimeOfDay);
    // Clear selected date when changing time of day
    setSelectedDate(null);
  };

  // Updated hooks with proper error handling and date parameter
  const { 
    data: digestData, 
    isLoading, 
    isFetching,
    error, 
    refetch,
  } = useEmailDigest(timeOfDay, selectedDate);

  console.log('Digest Data:', digestData)
  
  // Log the digest data whenever it changes
  useEffect(() => {
    if (digestData) {
      console.log('Email Digest Data:', digestData);
      
      // Check if categories from backend match the expected categories in the frontend
      CATEGORY_ORDER.forEach(categoryName => {
        const found = digestData.categories.some(c => c.category === categoryName);
      });
    }
  }, [digestData]);

  // Handle data fetching when parameters change
  useEffect(() => {
    console.log('DEBUG - useEffect - selectedDate:', selectedDate ? format(selectedDate, 'yyyy-MM-dd HH:mm:ss') : 'null');
    console.log('DEBUG - useEffect - timeOfDay:', timeOfDay);
    if (selectedDate || timeOfDay) {
      refetch();
    }
  }, [timeOfDay, selectedDate, refetch]);

  const { data: emailAccounts, isLoading: isLoadingAccounts } = useEmailAccounts();
  const activeAccount = emailAccounts?.find(account => account.isActive);
  const [_, setLocation] = useLocation();
  const { user, isLoading: isLoadingUser, isIntegratingGoogle, isGoogleSyncing } = useUser();

  // Define loading states
  const isInitialLoading = isLoadingUser || isLoadingAccounts;
  const isDataLoading = ((isLoading || isFetching) && !error);
  const isLoadingState = isInitialLoading || isDataLoading || isIntegratingGoogle || isGoogleSyncing;

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const toggleEmail = (emailId: string) => {
    setExpandedEmails(prev => ({
      ...prev,
      [emailId]: !prev[emailId]
    }));
  };

  // Filter emails by time of day
  const filterEmailsByTimeOfDay = (emails: EmailSummary[]) => {
    return emails.filter(email => {
      if (!email.receivedAt) return timeOfDay === "morning"; // Default to morning if no timestamp
      
      const emailDate = new Date(email.receivedAt);
      const hours = emailDate.getHours();
      
      if (timeOfDay === "morning") {
        return hours >= 5 && hours < 12; // 5 AM to 12 PM
      } else {
        return hours >= 12 || hours < 5; // 12 PM to 5 AM
      }
    });
  };

  // Basic loading checks
  if (isLoadingState) {
    let title = "Loading your emails...";
    let message = "Please wait while we securely sync and analyze your emails.";

    if (isIntegratingGoogle) {
      title = "Setting up Gmail integration...";
      message = "Please wait while we securely connect and sync your Gmail account. This may take a moment...";
    } else if (isGoogleSyncing) {
      title = "Syncing your Gmail account...";
      message = "Please wait while we sync your Gmail account. This may take a moment...";
    } else if (isInitialLoading) {
      title = "Loading...";
      message = "Please wait while we load your account information.";
    }

    return (
      <div className="container max-w-3xl mx-auto px-4">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
              <div className="relative">
                <Mail className="h-12 w-12 text-muted-foreground animate-pulse" />
                <div className="absolute -bottom-1 -right-1">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                {message}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    setLocation('/login');
    return null;
  }

  // Show loading state only for initial load
  if (isLoadingState && !digestData) {
    return (
      <div className="container max-w-3xl mx-auto px-4">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
              <div className="relative">
                <Mail className="h-12 w-12 text-muted-foreground animate-pulse" />
                <div className="absolute -bottom-1 -right-1">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-medium">Loading your emails...</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Please wait while we securely sync and analyze your emails.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle error state with retry button
  if (error) {
    return (
      <div className="container max-w-3xl mx-auto px-4">
        <Card className="shadow-sm border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
              <AlertCircle className="h-12 w-12 text-red-600" />
              <h3 className="text-lg font-medium text-red-800">
                {error instanceof Error ? error.message : 'An error occurred while fetching your emails'}
              </h3>
              <p className="text-sm text-red-600 text-center max-w-md">
                Please try refreshing the page or check your connection.
              </p>
              <Button 
                variant="outline" 
                onClick={() => refetch()}
                className="gap-2"
              >
                <RefreshCcw className="h-4 w-4" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  console.log('Digest Data from useEmailDigest hook:', digestData)
  console.log('lastUpdated value:', digestData?.lastUpdated);
  
  // Check if the lastUpdated value is close to the current time
  if (digestData?.lastUpdated) {
    const currentTime = new Date();
    const formattedCurrentTime = format(currentTime, 'MMM d, yyyy h:mm a');
    console.log('Current time formatted:', formattedCurrentTime);
    
    // Extract the formatted date from our special format for comparison
    const extractedDate = digestData.lastUpdated.includes('FIXED_DATE_VALUE')
      ? digestData.lastUpdated.split('||')[2]
      : digestData.lastUpdated;
      
    console.log('Extracted date for comparison:', extractedDate);
    console.log('Is lastUpdated similar to current time?', 
      extractedDate.includes(format(currentTime, 'MMM d, yyyy')));
  }

  // Map categories to UI format
  return (
    <div className="container mx-auto py-6 max-w-4xl">
      {/* Show notification banner when there's digest data but no active account */}
      {!activeAccount && digestData && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-md p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-900">Enhance your email experience </h3>
              <p className="text-sm text-amber-700 mt-1">
              Connect Gmail to unlock smart summaries, action items, and contextual assistance.
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="border-amber-300 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
              onClick={() => {
                onTabChange?.("settings");
                setLocation('/settings');
              }}
            >
              Connect
            </Button>
          </div>
        </div>
      )}
      {/* Calendar header with integrated Last Updated info */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
        </div>
        <WeeklyCalendar 
          lastUpdated={digestData?.lastUpdated} 
          refetch={handleGenerateSummary} 
          isFetching={isGenerating} 
          selectedDate={selectedDate} 
          onDateSelect={handleDateSelect} 
          now={now}
        />
      </div>

      {/* Time of Day Filter */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center rounded-md bg-muted p-2 text-muted-foreground">
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-2.5 text-base font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
              timeOfDay === "morning"
                ? "bg-background text-foreground shadow-sm"
                : ""
            }`}
            onClick={() => setTimeOfDay("morning")}
          >
            <Sun className="mr-2 h-5 w-5" />
            Morning
          </button>
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-2.5 text-base font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
              timeOfDay === "evening"
                ? "bg-background text-foreground shadow-sm"
                : ""
            }`}
            onClick={() => setTimeOfDay("evening")}
          >
            <Moon className="mr-2 h-5 w-5" />
            Evening
          </button>
        </div>
      </div>

      <div className="space-y-6">
      {CATEGORY_ORDER.map((categoryName) => {
          if (!categoryName) {
            console.error('Invalid category name in CATEGORY_ORDER');
            return null;
          }

          // Find category in digest data
          const digestCategory = digestData?.categories?.find(
            c => c.category?.toLowerCase() === categoryName?.toLowerCase()
          );
          
          // Use digest category or create an empty fallback
          const category = digestCategory || {
            category: categoryName,
            summaries: [],
            summary: `No ${categoryName} emails`
          };

          const config = CATEGORY_CONFIG[category.category] || CATEGORY_CONFIG["Important Info"];
          const Icon = config?.icon || Mail;
          return (
            <Card key={category.category} className={cn("shadow-sm bg-gradient-to-br", category.category === "Alerts" ? "mb-6" : "", config?.gradientClass)}>
              <Collapsible
                open={expandedCategories[category.category]}
                onOpenChange={() => toggleCategory(category.category)}
              >
                <CardHeader className="py-4">
                  <CollapsibleTrigger className="flex w-full justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-lg">{category.category}</CardTitle>
                      <Badge variant="secondary" className="ml-2">
                        {category.summaries.length} {category.summaries.length === 1 ? 'summary' : 'summaries'}
                      </Badge>
                    </div>
                    {expandedCategories[category.category] ?
                      <ChevronUp className="h-5 w-5" /> :
                      <ChevronDown className="h-5 w-5" />
                    }
                  </CollapsibleTrigger>
                </CardHeader>

                <CardContent className="pt-0">
                  <CollapsibleContent className="space-y-4">
                    {category.summaries.map((summary: EmailSummary, idx: number) => (
                      <Collapsible
                        key={idx}
                        open={expandedEmails[summary.gmail_id] || false}
                        onOpenChange={() => toggleEmail(summary.gmail_id)}
                      >
                        <div className="p-4 rounded-lg border bg-background/50">
                          <CollapsibleTrigger className="w-full">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-base tracking-tight text-left">
                                  {summary.subject}
                                </h3>
                                {(() => {
                                  // Use let instead of const to allow reassignment
                                  let score = summary.priority_score || 50;

                                  // Always set Notifications to low priority
                                  if (category.category === "Notifications") {
                                    score = 30; // Force Low priority for Notifications
                                  }
                                  const priorityColor = 
                                    score >= 75 ? 'bg-red-100 text-red-800 border-red-200' :
                                    score >= 40 ? 'bg-green-100 text-green-800 border-green-200' :
                                    'bg-gray-100 text-gray-800 border-gray-200';
                                  
                                  const priorityText = 
                                    score >= 75 ? 'High' :
                                    score >= 40 ? 'Medium' :
                                    'Low';
                                  
                                  return (
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityColor}`}>
                                      {priorityText}
                                    </span>
                                  );
                                })()}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground whitespace-nowrap">
                                  {summary.receivedAt 
                                    ? format(new Date(summary.receivedAt), "MMM d, yyyy") 
                                    : format(now, "MMM d, yyyy")}
                                </span>
                                {expandedEmails[summary.gmail_id] ? 
                                  <ChevronUp className="h-4 w-4" /> : 
                                  <ChevronDown className="h-4 w-4" />
                                }
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent className="mt-3">
                            <div className="space-y-4">
                              {/* Email Headline */}
                              <div className="rounded-md overflow-hidden border border-primary/10">
                                <div className="bg-primary/5 px-4 py-2 flex items-center gap-2 border-b border-primary/10">
                                  <h4 className="text-sm font-bold text-primary/90">Summary</h4>
                                </div>
                                <div className="px-4 py-3 bg-background/80">
                                  <p className="text-sm leading-relaxed text-foreground/90">{summary.headline}</p>
                                </div>
                              </div>

                              {/* Insights Section */}
                              {summary.insights && (
                                <div className="rounded-md overflow-hidden border border-primary/10">
                                  <div className="bg-primary/5 px-4 py-2 flex items-center gap-2 border-b border-primary/10">
                                    <h4 className="text-sm font-bold text-primary/90">Insights</h4>
                                  </div>
                                  <div className="px-4 py-3 bg-background/80 space-y-3">
                                    {/* Key Highlights */}
                                    {summary.insights.key_highlights && summary.insights.key_highlights.length > 0 && (
                                      <div>
                                        <h5 className="text-sm font-semibold mb-1">Key Highlights:</h5>
                                        <ul className="list-disc pl-5 space-y-1">
                                          {summary.insights.key_highlights.map((highlight, i) => (
                                            <li key={i} className="text-sm text-foreground/90">{highlight}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    
                                    {/* Why This Matters */}
                                    {summary.insights.why_this_matters && (
                                      <div>
                                        <h5 className="text-sm font-semibold mb-1">Why This Matters:</h5>
                                        <p className="text-sm text-foreground/90">{summary.insights.why_this_matters}</p>
                                      </div>
                                    )}
                                    
                                    {/* Next Steps */}
                                    {summary.insights.next_step && summary.insights.next_step.length > 0 && (
                                      <div>
                                        <h5 className="text-sm font-semibold mb-1">Next Steps:</h5>
                                        <ul className="list-disc pl-5 space-y-1">
                                          {summary.insights.next_step.map((step, i) => (
                                            <li key={i} className="text-sm text-foreground/90">
                                              {renderLinkText(step)}  
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => handleViewEmail(summary.gmail_id, category.category)}
                                >
                                  <Mail className="h-4 w-4" />
                                  {category.category === "Calendar" ? "View Calendar event" :
                                    category.category === "Travel" ? "View Travel Plans" :
                                      "View in Gmail"}
                                </Button>

                                {/* Add Unsubscribe button for Notificaions and Newsletters */}
                                {(category.category === "Alerts" ||
                                  category.category === "Promotions" ||
                                  category.category === "Newsletter") && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 border-red-200"
                                      onClick={() => {
                                        // Open Gmail unsubscribe page in a new tab
                                        window.open(`https://mail.google.com/mail/u/0/#inbox/${summary.gmail_id}?unsubscribe=1`, '_blank');
                                      }}
                                    >
                                      <Wand2 className="h-4 w-4" />
                                      Unsubscribe
                                    </Button>
                                  )}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </CollapsibleContent>
                </CardContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}