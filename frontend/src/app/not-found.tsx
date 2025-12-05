import Link from 'next/link';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center p-8 max-w-md">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="w-10 h-10 text-amber-600" />
        </div>
        <h1 className="text-6xl font-bold text-slate-300 mb-2">404</h1>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">页面不存在</h2>
        <p className="text-slate-600 mb-8">
          您访问的页面可能已被移除或地址有误
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/">
            <Button>
              <Home className="w-4 h-4 mr-2" />
              返回首页
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

