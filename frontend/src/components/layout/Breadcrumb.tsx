'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

// 路径映射表，将路径映射为中文名称
const pathMap: Record<string, string> = {
  '': '首页',
  'login': '登录',
  'register': '注册',
  'users': '用户管理',
  'data': '数据模板',
  'data-records': '数据记录',
  'repositories': '仓库管理',
  'warehouse': '仓库操作',
  'user-dashboard': '用户面板',
  'create': '创建',
  'edit': '编辑',
  'view': '查看',
  'detail': '详情',
};

export function Breadcrumb() {
  const pathname = usePathname() || '';
  
  // 如果是登录或注册页面，不显示面包屑
  if (pathname === '/login' || pathname === '/register') {
    return null;
  }
  
  // 分割路径
  const pathSegments = pathname.split('/').filter(Boolean);
  
  // 如果是首页，只显示首页
  if (pathSegments.length === 0) {
    return (
      <nav className="py-3 px-4 border-b border-ink-light bg-paper-light">
        <ol className="flex items-center space-x-1 text-sm">
          <li className="text-ink-black font-medium">首页</li>
        </ol>
      </nav>
    );
  }
  
  // 构建面包屑项
  const breadcrumbItems = [
    { path: '/', label: '首页' },
    ...pathSegments.map((segment, index) => {
      // 构建当前路径
      const path = `/${pathSegments.slice(0, index + 1).join('/')}`;
      
      // 尝试从映射表中获取名称，如果没有则使用路径本身
      // 如果是数字ID，则显示为"详情"
      const label = !isNaN(Number(segment)) 
        ? '详情' 
        : (pathMap[segment] || segment);
      
      return { path, label };
    }),
  ];
  
  return (
    <nav className="py-3 px-4 border-b border-ink-light bg-paper-light">
      <ol className="flex items-center space-x-1 text-sm">
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          
          return (
            <React.Fragment key={item.path}>
              {index > 0 && (
                <li className="text-ink-medium mx-1">
                  <ChevronRight className="h-4 w-4" />
                </li>
              )}
              <li>
                {isLast ? (
                  <span className="text-ink-black font-medium">{item.label}</span>
                ) : (
                  <Link 
                    href={item.path} 
                    className="text-ink-medium hover:text-ink-black hover:underline"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
} 