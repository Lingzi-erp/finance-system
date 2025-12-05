import React, { ReactNode } from 'react';

interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
  keyExtractor: (item: T) => string | number;
  className?: string;
}

/**
 * 通用数据表格组件
 */
export function DataTable<T>({
  data,
  columns,
  loading = false,
  emptyMessage = '暂无数据',
  keyExtractor,
  className = '',
}: DataTableProps<T>) {
  // 渲染单元格内容
  const renderCell = (item: T, column: Column<T>): ReactNode => {
    if (typeof column.accessor === 'function') {
      return column.accessor(item);
    }
    
    const value = item[column.accessor as keyof T];
    return value as ReactNode;
  };

  return (
    <div className={`bg-white rounded shadow overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.className || ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-4 text-center">
                加载中...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-4 text-center">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr key={keyExtractor(item)} className="hover:bg-gray-50">
                {columns.map((column, index) => (
                  <td
                    key={index}
                    className={`px-6 py-4 whitespace-nowrap ${column.className || ''}`}
                  >
                    {renderCell(item, column)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
} 