import { cn } from '@/lib/utils';

interface TimeDisplayProps {
  milliseconds: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function TimeDisplay({ milliseconds, className, size = 'md' }: TimeDisplayProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-3xl',
    lg: 'text-5xl',
  };

  return (
    <span 
      className={cn(
        "font-mono tabular-nums tracking-tight",
        sizeClasses[size],
        className
      )}
    >
      {formatTime(milliseconds)}
    </span>
  );
}
