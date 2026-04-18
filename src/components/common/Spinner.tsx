import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  className?: string;
}

/**
 * A reusable spinner component for indicating loading states.
 * Renders a thick gray ring track with a colored arc indicator.
 *
 * The `color` prop accepts:
 *   - 'border-white' → white (#ffffff)
 *   - A raw hex/rgb value like '#6300be' → used directly
 *   - A Tailwind-style class like 'border-purple-600' → mapped to hex
 *   - Anything else → default blue (#1a73e8)
 */
const Spinner: React.FC<SpinnerProps> = ({ 
  size = 'md',
  color,
  className = '' 
}) => {
  const sizeMap = {
    sm: 24,
    md: 40,
    lg: 80,
  };
  const dim = sizeMap[size];
  const strokeWidth = size === 'sm' ? 3 : size === 'md' ? 4 : 6;
  const radius = (dim - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.3;

  // Map known Tailwind-style border color classes → hex values
  const colorMap: Record<string, string> = {
    'border-white': '#ffffff',
    'border-blue-600': '#2563eb',
    'border-blue-700': '#1d4ed8',
    'border-purple-600': '#9333ea',
    'border-red-600': '#dc2626',
    'border-green-600': '#16a34a',
  };

  let strokeColor = '#1a73e8'; // default blue
  if (color) {
    if (colorMap[color]) {
      strokeColor = colorMap[color];
    } else if (color.startsWith('#') || color.startsWith('rgb')) {
      strokeColor = color;
    }
  }

  return (
    <svg
      width={dim}
      height={dim}
      viewBox={`0 0 ${dim} ${dim}`}
      className={`animate-spin ${className}`}
      role="status"
      aria-label="Loading..."
    >
      <circle
        cx={dim / 2}
        cy={dim / 2}
        r={radius}
        fill="none"
        stroke="#e0e0e0"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={dim / 2}
        cy={dim / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${arcLength} ${circumference - arcLength}`}
      />
    </svg>
  );
};

export default Spinner;