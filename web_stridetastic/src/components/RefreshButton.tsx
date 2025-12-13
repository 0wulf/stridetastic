'use client';

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RefreshButtonVariant = 'primary' | 'outline';
export type RefreshButtonSize = 'sm' | 'md';

interface RefreshButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onRefresh: () => void | Promise<void>;
  label?: string;
  isRefreshing?: boolean;
  variant?: RefreshButtonVariant;
  size?: RefreshButtonSize;
  iconPosition?: 'left' | 'right';
}

/**
 * Consistent refresh button with built-in loading feedback.
 * If `isRefreshing` is not provided, the component manages a local pending state.
 */
export function RefreshButton({
  onRefresh,
  label = 'Refresh',
  isRefreshing,
  variant = 'primary',
  size = 'md',
  iconPosition = 'left',
  className,
  disabled,
  onClick,
  ...rest
}: RefreshButtonProps) {
  const [internalRefreshing, setInternalRefreshing] = useState(false);
  const busy = isRefreshing ?? internalRefreshing;

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || busy) {
      return;
    }

  onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    try {
      if (isRefreshing === undefined) {
        setInternalRefreshing(true);
      }
      await onRefresh();
    } finally {
      if (isRefreshing === undefined) {
        setInternalRefreshing(false);
      }
    }
  };

  const variantClasses: Record<RefreshButtonVariant, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600 border border-transparent',
    outline: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus-visible:outline-blue-600',
  };

  const sizeClasses: Record<RefreshButtonSize, string> = {
    sm: 'px-3 py-1.5 text-sm min-h-[36px]',
    md: 'px-4 py-2 text-sm sm:text-base min-h-[44px]',
  };

  return (
    <button
      type="button"
  {...rest}
      onClick={handleClick}
      disabled={disabled || busy}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 touch-manipulation disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {iconPosition === 'left' && (
        <RefreshCw className={cn('h-4 w-4', label ? 'mr-2' : '', busy && 'animate-spin')} />
      )}
      {label && <span>{label}</span>}
      {iconPosition === 'right' && (
        <RefreshCw className={cn('h-4 w-4', label ? 'ml-2' : '', busy && 'animate-spin')} />
      )}
    </button>
  );
}

export default RefreshButton;
