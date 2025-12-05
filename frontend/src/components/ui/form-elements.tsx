import React, { ReactNode } from 'react';

interface FormGroupProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * 表单组组件
 */
export function FormGroup({
  label,
  htmlFor,
  error,
  required = false,
  children,
  className = '',
}: FormGroupProps) {
  return (
    <div className={`mb-4 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

/**
 * 输入框组件
 */
export function Input({ error, className = '', ...props }: InputProps) {
  return (
    <input
      className={`w-full px-3 py-2 border ${
        error ? 'border-red-500' : 'border-gray-300'
      } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${className}`}
      {...props}
    />
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

/**
 * 文本域组件
 */
export function Textarea({ error, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`w-full px-3 py-2 border ${
        error ? 'border-red-500' : 'border-gray-300'
      } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${className}`}
      {...props}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string | number; label: string }[];
  error?: string;
}

/**
 * 下拉选择组件
 */
export function Select({ options, error, className = '', ...props }: SelectProps) {
  return (
    <select
      className={`w-full px-3 py-2 border ${
        error ? 'border-red-500' : 'border-gray-300'
      } rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${className}`}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

/**
 * 复选框组件
 */
export function Checkbox({ label, error, className = '', ...props }: CheckboxProps) {
  return (
    <div className={`flex items-center ${className}`}>
      <input
        type="checkbox"
        className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ${
          error ? 'border-red-500' : ''
        }`}
        {...props}
      />
      <label htmlFor={props.id} className="ml-2 block text-sm text-gray-700">
        {label}
      </label>
    </div>
  );
}

interface RadioGroupProps {
  name: string;
  options: { value: string | number; label: string }[];
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  className?: string;
}

/**
 * 单选按钮组组件
 */
export function RadioGroup({
  name,
  options,
  value,
  onChange,
  error,
  className = '',
}: RadioGroupProps) {
  return (
    <div className={className}>
      <div className="space-y-2">
        {options.map((option) => (
          <div key={option.value} className="flex items-center">
            <input
              id={`${name}-${option.value}`}
              name={name}
              type="radio"
              value={option.value}
              checked={value === option.value}
              onChange={onChange}
              className={`h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 ${
                error ? 'border-red-500' : ''
              }`}
            />
            <label
              htmlFor={`${name}-${option.value}`}
              className="ml-2 block text-sm text-gray-700"
            >
              {option.label}
            </label>
          </div>
        ))}
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

/**
 * 按钮组件
 */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const variantStyles = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    success: 'bg-green-500 hover:bg-green-600 text-white',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  };

  const sizeStyles = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`rounded font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
        variantStyles[variant]
      } ${sizeStyles[size]} ${isLoading || disabled ? 'opacity-70 cursor-not-allowed' : ''} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          加载中...
        </div>
      ) : (
        children
      )}
    </button>
  );
} 