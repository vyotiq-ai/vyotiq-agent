import React, { useState, useEffect, memo } from 'react';

interface ElapsedTimeProps {
  startTime: number;
  className?: string;
  format?: 'short' | 'long';
}

const formatElapsed = (ms: number, format: 'short' | 'long'): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (format === 'long') {
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
  
  // Short format
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  if (minutes > 0) {
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
};

const ElapsedTimeComponent: React.FC<ElapsedTimeProps> = ({ 
  startTime, 
  className,
  format = 'short' 
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Update immediately
    setElapsed(Date.now() - startTime);
    
    // Then update every 100ms for smooth display
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className={className}>
      {formatElapsed(elapsed, format)}
    </span>
  );
};

export const ElapsedTime = memo(ElapsedTimeComponent);
