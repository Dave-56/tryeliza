/**
 * Utility functions for email formatting and display
 */

/**
 * Formats an email date string to show only day, date and month
 * @param dateString - The date string to format
 * @returns Formatted date string (e.g., "Wed, 12 Mar 2025")
 */

export const formatEmailDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // Format as "Wed, 12 Mar 2025"
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (error) {
      // Return original string if parsing fails
      return dateString;
    }
};

/**
 * Formats email content by detecting URLs and making them clickable with shortened display text
 * @param content - The email content to format
 * @returns HTML string with formatted links
 */
export const formatEmailContent = (content: string) => {
    if (!content) return '';
    
    // URL regex pattern
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    
    // Replace URLs with clickable links and shortened display text
    return content.replace(urlRegex, (url) => {
      // Create a URL object to get the hostname
      let displayUrl;
      try {
        const urlObj = new URL(url);
        // Show domain name + first part of path, limit to ~40 chars
        displayUrl = `${urlObj.hostname}${urlObj.pathname.substring(0, 15)}...`;
        if (displayUrl.length > 40) {
          displayUrl = displayUrl.substring(0, 37) + '...';
        }
      } catch (e) {
        // If URL parsing fails, use a shortened version of the original
        displayUrl = url.length > 40 ? url.substring(0, 37) + '...' : url;
      }
      
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${displayUrl}</a>`;
    });
};