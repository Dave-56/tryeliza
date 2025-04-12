import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useMemo, ReactNode } from 'react';
import {Calendar, Mail, Plane, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Wand2, RefreshCcw, Sun, Moon, ChevronLeft, ChevronRight, Bell } from "lucide-react";
import { format, startOfWeek, addDays, isToday, parseISO, subWeeks, isSameDay, differenceInWeeks, addWeeks, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";
import { useEmailAccounts, useManualSync } from "@/hooks/use-email";
import { useEmailDigest, formatUTCToLocal, useGenerateSummary } from "@/hooks/use-summaries";
import { HighlightedText, CategoryType } from "../utils/highlight-processor.tsx";
import PoweredByGiphy from '../assets/PoweredBy_200px-Black_HorizLogo.png';
import { splitIntoBulletPoints } from '../utils/bullet-point.ts';
import { motion } from 'framer-motion';

function WeeklyCalendar({ lastUpdated, refetch, isFetching, selectedDate, onDateSelect, now }: { 
  lastUpdated?: string, 
  refetch: () => void, 
  isFetching: boolean,
  selectedDate: Date | null,
  onDateSelect: (date: Date | null) => void,
  now: Date
}) {
  console.log('lastUpdated:', lastUpdated);
  console.log('isFetching:', isFetching);
  const [weekOffset, setWeekOffset] = useState(0);
  const currentWeekStart = startOfWeek(now);
  const displayedWeekStart = weekOffset < 0 
    ? subWeeks(currentWeekStart, Math.abs(weekOffset)) 
    : currentWeekStart;
  
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(displayedWeekStart, i);
    return {
      date,
      dayName: format(date, 'EEE'),
      dayNum: format(date, 'd'),
      isPast: startOfDay(date) <= now
    };
  });

  const handleDateClick = (date: Date) => {
    if (startOfDay(date) <= now) {
      if (selectedDate && isSameDay(selectedDate, date)) {
        onDateSelect(null);
      } else {
        onDateSelect(startOfDay(date));
      }
    }
  };
  
  const goToPreviousWeek = () => setWeekOffset(prev => prev - 1);
  const goToNextWeek = () => weekOffset < 0 && setWeekOffset(prev => prev + 1);
  const isCurrentWeek = weekOffset === 0;
  const weekRangeText = `${format(displayedWeekStart, 'MMM d')} - ${format(addDays(displayedWeekStart, 6), 'MMM d')}`;

  return (
    <div className="mt-2 mb-6">
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm text-muted-foreground">
              <span className="ml-2 text-primary font-medium">
                Viewing: {format(startOfDay(selectedDate || now), 'MMM d, yyyy')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
              <Calendar className="h-4 w-4" />
              {lastUpdated && (
                <span className="text-xs">
                  Last run: {format(parseISO(lastUpdated), 'MMM d, h:mm a')}
                </span>
              )}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 p-0 ml-1"
                onClick={refetch}
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
          
          <div className="flex justify-between items-center mb-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToPreviousWeek}
              className="flex items-center gap-1"
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
// Add this near your other interface definitions
interface AnimatedEmptyStateProps {
  icon: ReactNode;
  text: string;
  category: CategoryType;  // Add category prop
}


interface InboxSummaryProps {
  onTabChange?: (tab: string) => void;
}

const useGiphyMotivation = (timeOfDay: "morning" | "evening") => {
  const [gifUrl, setGifUrl] = useState<string | null>(() => {
    return localStorage.getItem(`giphy-${timeOfDay}`) || null;
  });
  const [isLoading, setIsLoading] = useState(!gifUrl);

  const getSearchTerm = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    const searchTerms: Record<"morning" | "evening", Record<number, string>> = {
      morning: {
        0: "lazy sunday coffee", // Sunday
        1: "monday morning coffee",
        2: "tuesday morning motivation",
        3: "wednesday coffee",
        4: "thursday morning",
        5: "friday morning vibes",
        6: "saturday morning relax"
      },
      evening: {
        0: "sunday evening relax", // Sunday
        1: "monday evening chill",
        2: "tuesday evening vibes",
        3: "wednesday evening",
        4: "thursday evening chill",
        5: "TGIF party",
        6: "saturday evening vibes"
      }
    };

    return searchTerms[timeOfDay][dayOfWeek];
  };

  const fetchNewGif = async () => {
    const searchTerm = getSearchTerm();
    setIsLoading(true);
    try {
      console.log(searchTerm);
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/random?api_key=${import.meta.env.VITE_PUBLIC_GIPHY_API_KEY}&tag=${encodeURIComponent(searchTerm)}&rating=g`
      );
      const data = await response.json();
      const newGifUrl = data.data.images.original.url;
      setGifUrl(newGifUrl);
      localStorage.setItem(`giphy-${timeOfDay}`, newGifUrl);
    } catch (error) {
      console.error('Error fetching GIF:', error);
      // Static fallback GIFs from GIPHY
      const fallbackGifs = {
        morning: "https://media.giphy.com/media/3o7TKz2eMXx7dn95FS/giphy.gif", // Cozy coffee morning
        evening: "https://media.giphy.com/media/jRlP4zbERYW5HoCLvX/giphy.gif"  // Chill evening vibes
      };
      const fallbackUrl = fallbackGifs[timeOfDay];
      setGifUrl(fallbackUrl);
      localStorage.setItem(`giphy-${timeOfDay}`, fallbackUrl);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Log the current search term
    console.log(`Current search term for ${timeOfDay}:`, getSearchTerm());
    
    // Always fetch a new GIF when timeOfDay changes
    fetchNewGif();
  }, [timeOfDay]);

  return { gifUrl, isLoading, refreshGif: fetchNewGif };
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Important Info':
      return <AlertCircle className="h-5 w-5 text-slate-400" />;
    case 'Calendar':
      return <Calendar className="h-5 w-5 text-slate-400" />;
    case 'Payments':
      return (
        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'Travel':
      return <Plane className="h-5 w-5 text-slate-400" />;
    case 'Newsletters':
      return (
        <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    case 'Notifications':
      return <Bell className="h-5 w-5 text-slate-400" />;
    default:
      return <AlertCircle className="h-5 w-5 text-slate-400" />;
  }
};

export function EmailPulse({ onTabChange }: InboxSummaryProps) {
  const now = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<"morning" | "evening">(
    new Date().getHours() < 16 ? 'morning' : 'evening'
  );

  // Update time of day every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const currentHour = new Date().getHours();
      setTimeOfDay(currentHour < 16 ? 'morning' : 'evening');
    }, 60000); // check every minute

    return () => clearInterval(interval);
  }, []);

  const { data: digestData, isLoading, isFetching, error, refetch } = useEmailDigest(timeOfDay, selectedDate);
  const { mutate: generateSummary, isPending: isGenerating } = useGenerateSummary();
  const { data: emailAccounts, isLoading: isLoadingAccounts } = useEmailAccounts();
  const { user, isLoading: isLoadingUser } = useUser();
  const [_, setLocation] = useLocation();

  const handleDateSelect = (date: Date | null) => {
    setSelectedDate(date);
  };

  const handleGenerateSummary = () => {
    console.log('Generating summary with:', { period: timeOfDay, date: selectedDate });
    generateSummary(
      { period: timeOfDay, date: selectedDate },
      {
        onError: (error) => {
          console.error('Error generating summary:', error);
        }
      }
    );
  };

  const { gifUrl, isLoading: isGifLoading, refreshGif } = useGiphyMotivation(timeOfDay);

  const handleMessageClick = (messageId: string) => {
    const encodedId = encodeURIComponent(messageId.trim());
    window.open(`https://mail.google.com/mail/u/0/#inbox/${encodedId}`, '_blank');
  };

  if (isLoading || isLoadingAccounts || isLoadingUser) {
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
              <h3 className="text-lg font-medium">Loading your inbox...</h3>
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

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="container mx-auto max-w-4xl px-4">
        <div className="mb-4">
          <WeeklyCalendar 
            lastUpdated={digestData?.lastUpdated} 
            refetch={handleGenerateSummary} 
            isFetching={isFetching || isGenerating} 
            selectedDate={selectedDate} 
            onDateSelect={handleDateSelect} 
            now={now}
          />
        </div>

        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center rounded-md bg-white p-1 shadow-sm">
            <button
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-2.5 text-base font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                timeOfDay === "morning" ? "bg-slate-100 text-foreground shadow-sm" : ""
              )}
              onClick={() => setTimeOfDay("morning")}
            >
              <Sun className="mr-2 h-5 w-5" />
              Morning
            </button>
            <button
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-5 py-2.5 text-base font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                timeOfDay === "evening" ? "bg-slate-100 text-foreground shadow-sm" : ""
              )}
              onClick={() => setTimeOfDay("evening")}
            >
              <Moon className="mr-2 h-5 w-5" />
              Evening
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-8 max-w-3xl mx-auto">
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center border-b pb-8">
              <h1 className="text-3xl font-serif text-slate-900 mb-2">Your Daily Digest</h1>
              <p className="text-slate-600">Important updates from your inbox</p>
            </div>

            {/* Daily Motivation GIF */}
            <div className="overflow-hidden rounded-lg border border-slate-100 relative group">
              {isGifLoading ? (
                <div className="w-full h-[24rem] bg-slate-100 animate-pulse flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="relative">
                  <img 
                    src={gifUrl || "https://media.giphy.com/media/3o7TKz2eMXx7dn95FS/giphy.gif"}
                    alt={`Daily ${timeOfDay} motivation`}
                    className="w-full h-[24rem] object-cover rounded-lg"
                  />
                  <div className="absolute bottom-2 right-2">
                    <img 
                      src={PoweredByGiphy}
                      alt="Powered by GIPHY"
                      className="h-6"
                    />
                  </div>
                </div>
              )}
              <button
                onClick={refreshGif}
                className="absolute top-2 right-2 p-2 rounded-full bg-white/80 hover:bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                title="Get new GIF"
              >
                {/* <RefreshCcw className="h-4 w-4 text-slate-600" /> */}
              </button>
            </div>
            
            {/* Categories Sections */}
            {digestData?.data?.summary?.categories_summary?.map((category: any) => {
              // Split content into subheadline and bullet points
              const lines = category.key_highlights.split('\n\n');
              const firstLine = lines[0];
              // Get text up to the first period or exclamation mark
              const subheadlineMatch = firstLine.match(/^[^.!]+[.!]/);
              const subheadline = subheadlineMatch ? subheadlineMatch[0] : firstLine;
              // Rest of the first line plus remaining lines are bullet points
              const remainingFirstLine = firstLine.slice(subheadline.length).trim();
              const bulletPoints = [
                ...(remainingFirstLine ? [remainingFirstLine] : []),
                ...lines.slice(1)
              ].filter((line: string) => line.trim());

              return (
                <div key={category.category_name} className="space-y-3">
                  <div className="flex items-center gap-3 mb-4">
                    <motion.div
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ 
                        duration: 2,
                        repeat: Infinity,
                        repeatDelay: 1
                      }}
                    >
                      {getCategoryIcon(category.category_name)}
                    </motion.div>
                    <h2 className="text-xl font-serif text-slate-900">{category.category_name}</h2>
                  </div>
                  <div className="space-y-4 pl-2 border-l-2 border-slate-100">
                    {/* Subheading */}
                    <div className="text-slate-600 font-medium pb-2 border-b border-slate-100">
                      <HighlightedText 
                        category={category.category_name}
                        text={subheadline}
                        onMessageClick={handleMessageClick}
                      />
                    </div>
                    {/* Content */}
                    <div className="space-y-3 pt-2">
                    {bulletPoints.map((point: string, index: number) => (
                        <div key={index} className="flex items-start">
                          <span className="text-slate-400 mr-2">•</span>
                          <div className="flex-1">
                            <HighlightedText 
                              category={category.category_name}
                              text={point}
                              onMessageClick={handleMessageClick}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
