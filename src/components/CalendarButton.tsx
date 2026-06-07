import { Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  openGoogleCalendar, 
  createAdjournmentCalendarEvent,
  isValidCalendarDate 
} from '@/lib/calendar';
import { toast } from 'sonner';

interface CalendarButtonProps {
  caseTitle?: string;
  caseNumber?: string;
  nextDate: string;
  courtName?: string;
  reason?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
}

export function CalendarButton({
  caseTitle,
  caseNumber,
  nextDate,
  courtName,
  reason,
  size = 'sm',
  variant = 'outline',
}: CalendarButtonProps) {
  const handleAddToCalendar = () => {
    if (!isValidCalendarDate(nextDate)) {
      toast.error('Invalid date for calendar');
      return;
    }

    const event = createAdjournmentCalendarEvent(
      caseTitle || 'Court Hearing',
      caseNumber,
      new Date(nextDate),
      courtName,
      reason
    );

    openGoogleCalendar(event);
    toast.success('Opening Google Calendar...');
  };

  if (!nextDate || !isValidCalendarDate(nextDate)) {
    return null;
  }

  return (
    <Button
      size={size}
      variant={variant}
      onClick={(e) => {
        e.stopPropagation();
        handleAddToCalendar();
      }}
      className="gap-2"
    >
      <Calendar className="w-4 h-4" />
      Add to Calendar
      <ExternalLink className="w-3 h-3" />
    </Button>
  );
}
