/**
 * NotificationBanner Primitive
 * 
 * Shared notification banner for success/warning/error messages.
 * Styled for the terminal/CLI aesthetic.
 */
import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '../../../utils/cn';

export type NotificationType = 'success' | 'warning' | 'error';

export interface Notification {
  type: NotificationType;
  message: string;
}

interface NotificationBannerProps {
  notification: Notification | null;
  className?: string;
}

const typeStyles: Record<NotificationType, string> = {
  success: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20',
  warning: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20',
  error: 'text-[var(--color-error)] bg-[var(--color-error)]/10 border-[var(--color-error)]/20',
};

const TypeIcon: React.FC<{ type: NotificationType }> = ({ type }) => {
  if (type === 'success') return <CheckCircle size={10} />;
  return <AlertCircle size={10} />;
};

export const NotificationBanner: React.FC<NotificationBannerProps> = ({ notification, className }) => {
  if (!notification) return null;

  return (
    <div className={cn(
      'text-[10px] px-2 py-1.5 border flex items-center gap-2',
      typeStyles[notification.type],
      className,
    )}>
      <TypeIcon type={notification.type} />
      {notification.message}
    </div>
  );
};
