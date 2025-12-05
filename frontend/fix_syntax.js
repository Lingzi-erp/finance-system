/**
 * 修复语法错误
 */
const fs = require('fs');
const path = require('path');

const files = [
  'src/app/statistics/page.tsx',
  'src/app/statistics/flows/page.tsx',
  'src/app/products/settings/page.tsx',
  'src/app/products/new/page.tsx',
  'src/app/formulas/page.tsx',
  'src/app/batches/page.tsx',
  'src/app/accounts/overview/page.tsx',
  'src/app/accounts/aging/page.tsx',
];

for (const file of files) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) continue;
  
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;
  
  // 修复损坏的 loadUserInfo 函数
  // 将整个 loadUserInfo 函数替换为空（因为单机版不需要）
  content = content.replace(
    /const loadUserInfo = async \(\) => \{\s*try \{\s*const info = if \(!info\) \{\s*router\.push\('\/login'\);\s*return;\s*\}\s*setUserInfo\(info\);\s*\} catch \(err\) \{\s*router\.push\('\/login'\);\s*\}\s*\};/g,
    ''
  );
  
  // 移除 loadUserInfo() 调用
  content = content.replace(/loadUserInfo\(\);?\s*/g, '');
  
  // 移除 userInfo 状态定义
  content = content.replace(/const \[userInfo, setUserInfo\] = useState<[^>]+>\(null\);?\s*/g, '');
  
  // 移除 if (userInfo) 条件（保留内部代码）
  content = content.replace(/if \(userInfo\) \{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1');
  
  // 清理多余空行
  content = content.replace(/\n{3,}/g, '\n\n');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`✓ ${file}`);
  }
}

console.log('完成!');

