/**
 * 修复剩余的语法错误
 */
const fs = require('fs');

const files = [
  'src/app/statistics/sales/page.tsx',
  'src/app/statistics/purchase/page.tsx',
  'src/app/statistics/accounts/page.tsx',
  'src/app/statistics/accounts/aging/page.tsx',
  'src/app/backup/page.tsx',
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log('Skipped (not found): ' + file);
    continue;
  }
  
  let c = fs.readFileSync(file, 'utf-8');
  const originalContent = c;
  
  // 修复多种形式的损坏代码
  // 形式1: const fullUser = if (!fullUser) { router.push('/login'); return; }
  c = c.replace(/const fullUser = if \(!fullUser\) \{ router\.push\('\/login'\); return; \}\n?/g, '');
  
  // 形式2: const info = if (!info) { router.push('/login'); return; }
  c = c.replace(/const info = if \(!info\) \{ router\.push\('\/login'\); return; \}\n?/g, '');
  
  // 形式3: const userInfo = if (!userInfo) { router.push('/login'); return; }
  c = c.replace(/const userInfo = if \(!userInfo\) \{ router\.push\('\/login'\); return; \}\n?/g, '');
  
  // 清理多余空行
  c = c.replace(/\n{3,}/g, '\n\n');
  
  if (c !== originalContent) {
    fs.writeFileSync(file, c);
    console.log('Fixed: ' + file);
  } else {
    console.log('No changes: ' + file);
  }
}

console.log('Done!');

