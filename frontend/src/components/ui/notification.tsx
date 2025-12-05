import React, { useState, useEffect } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationProps {
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  onClose: () => void;
}

/**
 * 通知组件
 */
export function Notification({
  type,
  title,
  message,
  duration = 5000,
  onClose,
}: NotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // 等待淡出动画完成后再调用 onClose
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  // 根据类型设置不同的样式
  const typeStyles = {
    success: {
      bgColor: 'bg-green-50',
      borderColor: 'border-green-400',
      iconColor: 'text-green-400',
      icon: (
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    error: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-400',
      iconColor: 'text-red-400',
      icon: (
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    warning: {
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-400',
      iconColor: 'text-yellow-400',
      icon: (
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    info: {
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-400',
      iconColor: 'text-blue-400',
      icon: (
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
  };

  const style = typeStyles[type];

  return (
    <div
      className={`fixed top-4 right-4 max-w-sm w-full ${style.bgColor} border-l-4 ${
        style.borderColor
      } p-4 rounded shadow-md transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex">
        <div className={`flex-shrink-0 ${style.iconColor}`}>{style.icon}</div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-gray-800">{title}</h3>
          <div className="mt-1 text-sm text-gray-700">{message}</div>
        </div>
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button
              onClick={() => {
                setIsVisible(false);
                setTimeout(onClose, 300);
              }}
              className="inline-flex rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none"
            >
              <span className="sr-only">关闭</span>
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface NotificationContextType {
  showNotification: (props: Omit<NotificationProps, 'onClose'>) => void;
}

export const NotificationContext = React.createContext<NotificationContextType>({
  showNotification: () => {},
});

interface NotificationProviderProps {
  children: React.ReactNode;
}

interface NotificationItem extends Omit<NotificationProps, 'onClose'> {
  id: string;
}

/**
 * 通知上下文提供者组件
 */
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const showNotification = (props: Omit<NotificationProps, 'onClose'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { ...props, id }]);
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div className="fixed top-0 right-0 z-50 p-4 space-y-4">
        {notifications.map((notification) => (
          <Notification
            key={notification.id}
            {...notification}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

/**
 * 通知钩子
 */
export function useNotification() {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
} 