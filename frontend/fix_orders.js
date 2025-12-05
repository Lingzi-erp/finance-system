/**
 * 修复订单相关页面的 auth 引用
 */
const fs = require('fs');

const files = [
  'src/app/orders/new/page.tsx',
  'src/app/orders/[id]/page.tsx',
  'src/app/orders/[id]/edit/page.tsx',
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  
  let c = fs.readFileSync(file, 'utf-8');
  
  // 移除 auth 导入
  c = c.replace(/import\s*\{[^}]*\}\s*from\s*['"]@\/lib\/api\/auth['"];\n?/g, '');
  c = c.replace(/import\s*\{[^}]*\}\s*from\s*['"]@\/lib\/auth['"];\n?/g, '');
  
  // 移除 UserFullInfo 类型声明
  c = c.replace(/const \[currentUserInfo, setCurrentUserInfo\] = useState<UserFullInfo \| null>\(null\);\n?/g, '');
  
  // 修复损坏的 userInfo 赋值
  c = c.replace(/const userInfo = if \(!userInfo\) \{ router\.push\('\/login'\); return; \}\n?\s*setCurrentUserInfo\(userInfo\);/g, '');
  
  // 移除 getCurrentUserInfo 调用
  c = c.replace(/await getCurrentUserInfo\(\);?\n?/g, '');
  c = c.replace(/const userInfo = await getCurrentUserInfo\(\);[\s\S]*?setCurrentUserInfo\(userInfo\);/g, '');
  
  // 移除 currentUserInfo 状态
  c = c.replace(/const \[currentUserInfo, setCurrentUserInfo\][^;]+;\n?/g, '');
  
  // 替换权限检查
  c = c.replace(/hasPermission\([^)]+\)/g, 'true');
  c = c.replace(/currentUserInfo\?\.is_admin/g, 'true');
  
  // 清理多余空行
  c = c.replace(/\n{3,}/g, '\n\n');
  
  fs.writeFileSync(file, c);
  console.log('Fixed: ' + file);
}

console.log('Done!');

