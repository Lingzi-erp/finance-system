import React from 'react';

interface LoadingProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  className?: string;
}

/**
 * 加载状态组件
 */
export function Loading({ size = 'medium', text = '加载中...', className = '' }: LoadingProps) {
  const sizeMap = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12',
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className={`animate-spin rounded-full border-t-2 border-blue-500 ${sizeMap[size]}`}></div>
      {text && <p className="mt-2 text-gray-600">{text}</p>}
    </div>
  );
}

interface PageLoadingProps {
  text?: string;
}

/**
 * 页面加载状态组件
 */
export function PageLoading({ text = '页面加载中...' }: PageLoadingProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loading size="large" text={text} />
    </div>
  );
}

interface LoadingOverlayProps {
  show: boolean;
  text?: string;
}

/**
 * 加载遮罩组件
 */
export function LoadingOverlay({ show, text = '处理中...' }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <Loading size="large" text={text} />
      </div>
    </div>
  );
} 