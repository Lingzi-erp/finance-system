import React from "react";

interface CardProps {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Card({ className = "", children, onClick }: CardProps) {
  return (
    <div 
      className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  className?: string;
  children: React.ReactNode;
}

export function CardHeader({ className = "", children }: CardHeaderProps) {
  return (
    <div className={`p-4 pb-0 ${className}`}>
      {children}
    </div>
  );
}

interface CardTitleProps {
  className?: string;
  children: React.ReactNode;
}

export function CardTitle({ className = "", children }: CardTitleProps) {
  return (
    <h3 className={`text-xl font-semibold text-gray-900 ${className}`}>
      {children}
    </h3>
  );
}

interface CardContentProps {
  className?: string;
  children: React.ReactNode;
}

export function CardContent({ className = "", children }: CardContentProps) {
  return (
    <div className={`p-4 ${className}`}>
      {children}
    </div>
  );
}

interface CardFooterProps {
  className?: string;
  children: React.ReactNode;
}

export function CardFooter({ className = "", children }: CardFooterProps) {
  return (
    <div className={`p-4 pt-0 ${className}`}>
      {children}
    </div>
  );
} 