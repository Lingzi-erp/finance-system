const fs = require('fs');
const files = [
  'src/app/statistics/flows/page.tsx',
  'src/app/products/settings/page.tsx',
  'src/app/products/new/page.tsx',
  'src/app/formulas/page.tsx',
  'src/app/batches/page.tsx',
  'src/app/accounts/overview/page.tsx',
  'src/app/accounts/aging/page.tsx',
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  
  let c = fs.readFileSync(file, 'utf-8');
  
  // 移除损坏的 loadUserInfo 函数
  c = c.replace(/const loadUserInfo = async[\s\S]*?finally \{[\s\S]*?\}\s*\};/g, '');
  
  // 移除空的 useEffect
  c = c.replace(/useEffect\(\(\) => \{[\s]*\}, \[\]\);/g, '');
  
  // 移除 userInfo 状态
  c = c.replace(/const \[userInfo, setUserInfo\][^;]+;[\s]*/g, '');
  
  // 修改 loading 初始值为 false
  c = c.replace(/useState\(true\)/g, 'useState(false)');
  
  // 清理多余空行
  c = c.replace(/\n{3,}/g, '\n\n');
  
  fs.writeFileSync(file, c);
  console.log('Fixed: ' + file);
}

console.log('Done!');

