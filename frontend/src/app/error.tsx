'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 可以在这里上报错误到日志服务
    console.error('页面错误:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center p-8 max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">页面出错了</h1>
        <p className="text-slate-600 mb-6">
          抱歉，页面加载时发生了错误。请尝试刷新页面或返回首页。
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            重试
          </Button>
          <Link href="/">
            <Button>
              <Home className="w-4 h-4 mr-2" />
              返回首页
            </Button>
          </Link>
        </div>
        <details className="mt-6 text-left">
          <summary className="text-sm text-slate-500 cursor-pointer">
            错误详情
          </summary>
          <pre className="mt-2 p-4 bg-slate-800 text-red-400 rounded-lg text-xs overflow-auto max-h-48">
            {error.message}
            {'\n'}
            {error.stack}
          </pre>
        </details>
      </div>
    </div>
  );
}

