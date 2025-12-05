import React, { ReactNode } from 'react';

interface FilterPanelProps {
  children: ReactNode;
  className?: string;
}

/**
 * 筛选面板容器组件
 */
export function FilterPanel({ children, className = '' }: FilterPanelProps) {
  return (
    <div className={`bg-white p-4 rounded shadow mb-6 ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
  );
}

interface FilterItemProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * 筛选项组件
 */
export function FilterItem({ label, children, className = '' }: FilterItemProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

interface FilterSelectProps {
  value: string | number | undefined;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string | number; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 筛选下拉选择组件
 */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder = '全部',
  disabled = false,
  className = '',
}: FilterSelectProps) {
  return (
    <select
      value={value || ''}
      onChange={onChange}
      className={`w-full border border-gray-300 rounded px-3 py-2 ${className}`}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface FilterSearchProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch: (e: React.FormEvent) => void;
  placeholder?: string;
  className?: string;
}

/**
 * 筛选搜索组件
 */
export function FilterSearch({
  value,
  onChange,
  onSearch,
  placeholder = '搜索...',
  className = '',
}: FilterSearchProps) {
  return (
    <form onSubmit={onSearch} className={`flex ${className}`}>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 border border-gray-300 rounded-l px-3 py-2"
      />
      <button
        type="submit"
        className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-r"
      >
        搜索
      </button>
    </form>
  );
} 