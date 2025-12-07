"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Building2, Package, FileText, Menu, X, Boxes, 
  BarChart3, Settings, ChevronDown, Receipt, CreditCard, Database, 
  Wallet, Home
} from "lucide-react";

// 导航分组配置
const navGroups = [
  {
    id: "master",
    label: "基础资料",
    icon: Database,
    items: [
      { href: "/entities", label: "客商管理", icon: Building2, description: "供应商、客户、仓库" },
      { href: "/products", label: "商品档案", icon: Package, description: "商品信息与分类" },
    ]
  },
  {
    id: "business",
    label: "业务处理",
    icon: FileText,
    items: [
      { href: "/orders", label: "进销单据", icon: FileText, description: "采购、销售单据" },
      { href: "/stocks", label: "库存台账", icon: Boxes, description: "实时库存查询" },
      { href: "/batches", label: "批次追溯", icon: Package, description: "批次成本与追溯" },
    ]
  },
  {
    id: "finance",
    label: "财务管理",
    icon: Wallet,
    items: [
      { href: "/accounts", label: "往来账款", icon: Receipt, description: "应收应付管理" },
      { href: "/payments", label: "资金流水", icon: CreditCard, description: "收款付款记录" },
    ]
  },
];

// 系统设置子链接
const systemLinks = [
  { href: "/initial-data", label: "期初数据", icon: Database, description: "期初库存与账款" },
  { href: "/backup", label: "数据备份", icon: Database, description: "备份与数据恢复" },
  { href: "/system", label: "系统维护", icon: Settings, description: "系统设置与维护" },
];

export function Navbar() {
  const pathname = usePathname() || '';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 标记组件已挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 检查链接是否激活
  const isLinkActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // 检查系统设置是否激活
  const isSystemActive = () => {
    return systemLinks.some(link => isLinkActive(link.href));
  };

  // 检查分组是否激活
  const isGroupActive = (group: typeof navGroups[0]) => {
    return group.items.some(item => isLinkActive(item.href));
  };

  // 切换下拉菜单
  const toggleDropdown = (id: string) => {
    setOpenDropdown(openDropdown === id ? null : id);
  };

  // 未挂载时显示骨架屏，避免闪烁
  if (!mounted) {
    return (
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-md">
                <Home className="w-5 h-5 text-white" />
              </div>
              <span className="hidden sm:block text-lg font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                财务中心
              </span>
            </div>
            <div className="hidden md:flex items-center gap-4">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur supports-[backdrop-filter]:backdrop-blur-lg border-b border-slate-200 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
              <Home className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="text-lg font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                财务中心
              </span>
            </div>
          </Link>
          
          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-0.5" ref={dropdownRef}>
            {/* 分组下拉菜单 */}
            {navGroups.map((group) => {
              const GroupIcon = group.icon;
              const isActive = isGroupActive(group);
              const isOpen = openDropdown === group.id;
              
              return (
                <div key={group.id} className="relative">
                  <button
                    onClick={() => toggleDropdown(group.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all ${
                      isActive
                        ? 'text-amber-700 bg-amber-50 font-medium'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <GroupIcon className="h-4 w-4" />
                    {group.label}
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {isOpen && (
                    <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        const itemActive = isLinkActive(item.href);
                        
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpenDropdown(null)}
                            className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                              itemActive
                                ? 'text-amber-700 bg-amber-50'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <ItemIcon className={`h-4 w-4 ${itemActive ? 'text-amber-600' : 'text-slate-400'}`} />
                            <div>
                              <div className="font-medium">{item.label}</div>
                              <div className="text-xs text-slate-400">{item.description}</div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* 数据中心 - 独立链接 */}
            <Link
              href="/statistics"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all ${
                pathname.startsWith('/statistics')
                  ? 'text-amber-700 bg-amber-50 font-medium'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              数据中心
            </Link>
            
            {/* 系统设置下拉菜单 */}
            <div className="relative">
              <button
                onClick={() => toggleDropdown('system')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all ${
                  isSystemActive()
                    ? 'text-amber-700 bg-amber-50 font-medium'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Settings className="h-4 w-4" />
                系统
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${openDropdown === 'system' ? 'rotate-180' : ''}`} />
              </button>
              
              {openDropdown === 'system' && (
                <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                  {systemLinks.map((link) => {
                    const isActive = isLinkActive(link.href);
                    const IconComponent = link.icon;
                    
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setOpenDropdown(null)}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          isActive
                            ? 'text-amber-700 bg-amber-50'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <IconComponent className={`h-4 w-4 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                        <div>
                          <div className="font-medium">{link.label}</div>
                          <div className="text-xs text-slate-400">{link.description}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          
          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-slate-100 bg-white">
            {/* 分组导航 */}
            {navGroups.map((group) => {
              const GroupIcon = group.icon;
              
              return (
                <div key={group.id}>
                  <div className="px-3 py-2 mt-2 border-t border-slate-100 first:border-t-0 first:mt-0">
                    <div className="flex items-center gap-2 text-xs text-slate-400 uppercase font-semibold tracking-wider">
                      <GroupIcon className="h-3.5 w-3.5" />
                      {group.label}
                    </div>
                  </div>
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = isLinkActive(item.href);
                    
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-3 rounded-lg mx-2 ${
                          isActive 
                            ? 'text-amber-700 bg-amber-50' 
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <ItemIcon className={`h-5 w-5 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                        <div>
                          <div className="font-medium">{item.label}</div>
                          <div className="text-xs text-slate-400">{item.description}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
            
            {/* 移动端数据中心 */}
            <Link
              href="/statistics"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg mx-2 mt-2 border-t border-slate-100 ${
                pathname.startsWith('/statistics')
                  ? 'text-amber-700 bg-amber-50' 
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className={`h-5 w-5 ${pathname.startsWith('/statistics') ? 'text-amber-600' : 'text-slate-400'}`} />
              <div>
                <div className="font-medium">数据中心</div>
                <div className="text-xs text-slate-400">数据分析与报表</div>
              </div>
            </Link>
            
            {/* 移动端系统设置 */}
            <div className="px-3 py-2 mt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-400 uppercase font-semibold tracking-wider">
                <Settings className="h-3.5 w-3.5" />
                系统设置
              </div>
            </div>
            {systemLinks.map((link) => {
              const isActive = isLinkActive(link.href);
              const IconComponent = link.icon;
              
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg mx-2 ${
                    isActive 
                      ? 'text-amber-700 bg-amber-50' 
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <IconComponent className={`h-5 w-5 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                  <div>
                    <div className="font-medium">{link.label}</div>
                    <div className="text-xs text-slate-400">{link.description}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
