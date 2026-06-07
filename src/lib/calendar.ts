// Google Calendar integration utilities
// Opens Google Calendar with pre-filled adjournment event

export interface CalendarEvent {
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  location?: string;
}

// Format date for Google Calendar URL (YYYYMMDDTHHmmssZ)
function formatDateForGoogle(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Generate Google Calendar URL
export function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const startDate = formatDateForGoogle(event.startDate);
  
  // Default end date is 1 hour after start if not specified
  const endDate = event.endDate 
    ? formatDateForGoogle(event.endDate)
    : formatDateForGoogle(new Date(event.startDate.getTime() + 60 * 60 * 1000));

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${startDate}/${endDate}`,
  });

  if (event.description) {
    params.set('details', event.description);
  }

  if (event.location) {
    params.set('location', event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Open Google Calendar in new tab
export function openGoogleCalendar(event: CalendarEvent): void {
  const url = generateGoogleCalendarUrl(event);
  window.open(url, '_blank', 'noopener,noreferrer');
}

// Create court adjournment calendar event
export function createAdjournmentCalendarEvent(
  caseTitle: string,
  caseNumber: string | undefined,
  nextDate: Date,
  courtName?: string,
  reason?: string
): CalendarEvent {
  const title = caseNumber 
    ? `Court: ${caseNumber}` 
    : `Court: ${caseTitle || 'Court Hearing'}`;

  const descriptionParts: string[] = [];
  
  if (caseTitle) {
    descriptionParts.push(`Case: ${caseTitle}`);
  }
  
  if (caseNumber) {
    descriptionParts.push(`Case Number: ${caseNumber}`);
  }
  
  if (reason) {
    descriptionParts.push(`Purpose: ${reason}`);
  }
  
  descriptionParts.push('');
  descriptionParts.push('Added via myJuris');

  return {
    title,
    description: descriptionParts.join('\n'),
    startDate: nextDate,
    location: courtName,
  };
}

// Check if date is valid for calendar
export function isValidCalendarDate(dateString: string): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date > new Date();
}
