import { Info, Calendar, Mail, Plane, Newspaper, Megaphone, AlertCircle } from "lucide-react";

export const CATEGORY_ORDER = [
  "Important Info",
  "Calendar",
  "Payments",
  "Travel",
  "Newsletters", // Changed from Newsletter to Newsletters to match backend
  "Notifications"
];

export const CATEGORY_CONFIG: Record<string, { icon: any; gradientClass: string }> = {
  "Important Info": {
    icon: Info,
    gradientClass: "from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30"
  },
  "Calendar": {
    icon: Calendar,
    gradientClass: "from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30"
  },
  "Payments": {
    icon: AlertCircle,
    gradientClass: "from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/30"
  },
  "Travel": {
    icon: Plane,
    gradientClass: "from-yellow-50 to-yellow-100 dark:from-yellow-950/30 dark:to-yellow-900/30"
  },
  "Newsletters": {
    icon: Newspaper,
    gradientClass: "from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30"
  },
  "Notifications": {
    icon: Megaphone,
    gradientClass: "from-indigo-50 to-indigo-100 dark:from-indigo-950/30 dark:to-indigo-900/30"
  }
};

export const EMAIL_CATEGORIES = {
  "Important Info": "important-info",
  "Calendar": "calendar",
  "Payments": "payments",
  "Travel": "travel",
  "Newsletters": "newsletters",
  "Notifications": "notifications",
};