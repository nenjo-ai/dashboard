"use client";

import { useRef } from "react";

interface MobileTouchButtonProps {
  onPress: () => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

export function MobileTouchButton({
  onPress,
  className,
  style,
  disabled,
  title,
  ariaLabel,
  children,
}: MobileTouchButtonProps) {
  const touchedRef = useRef(false);
  const suppressClickRef = useRef(false);

  return (
    <button
      type="button"
      className={className}
      style={style}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      onTouchStart={() => {
        touchedRef.current = true;
        suppressClickRef.current = false;
      }}
      onTouchCancel={() => {
        touchedRef.current = false;
        suppressClickRef.current = false;
      }}
      onTouchEnd={(e) => {
        if (!touchedRef.current) return;
        touchedRef.current = false;
        suppressClickRef.current = true;
        e.preventDefault();
        onPress();
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (!touchedRef.current) {
          onPress();
        }
      }}
    >
      {children}
    </button>
  );
}
