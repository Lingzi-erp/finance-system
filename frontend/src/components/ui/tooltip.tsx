import React, { useState, ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ children, content, position = 'top' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  // 根据位置设置样式
  const getPositionStyles = () => {
    switch (position) {
      case 'top':
        return 'bottom-full left-1/2 transform -translate-x-1/2 mb-2';
      case 'bottom':
        return 'top-full left-1/2 transform -translate-x-1/2 mt-2';
      case 'left':
        return 'right-full top-1/2 transform -translate-y-1/2 mr-2';
      case 'right':
        return 'left-full top-1/2 transform -translate-y-1/2 ml-2';
      default:
        return 'bottom-full left-1/2 transform -translate-x-1/2 mb-2';
    }
  };

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          className={`absolute z-50 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap ${getPositionStyles()}`}
        >
          {content}
          <div
            className={`absolute w-2 h-2 bg-gray-800 transform rotate-45 ${
              position === 'top' ? 'top-full -translate-y-1/2 left-1/2 -translate-x-1/2' :
              position === 'bottom' ? 'bottom-full translate-y-1/2 left-1/2 -translate-x-1/2' :
              position === 'left' ? 'left-full -translate-x-1/2 top-1/2 -translate-y-1/2' :
              'right-full translate-x-1/2 top-1/2 -translate-y-1/2'
            }`}
          />
        </div>
      )}
    </div>
  );
} 