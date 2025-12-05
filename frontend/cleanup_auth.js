/**
 * 批量清理前端 auth 相关代码
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// 递归获取所有 .tsx 文件
function getAllTsxFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllTsxFiles(fullPath, files);
    } else if (entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

function cleanFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // 1. 移除 auth 导入行
  content = content.replace(/import\s*\{[^}]*\}\s*from\s*['"]@\/lib\/auth['"];\n?/g, '');
  
  // 2. 移除 userInfo 相关状态
  content = content.replace(/const\s*\[userInfo,\s*setUserInfo\]\s*=\s*useState<UserFullInfo\s*\|\s*null>\(null\);\n?/g, '');
  
  // 3. 移除 getCurrentUserFull 调用块
  content = content.replace(/const\s+fullUser\s*=\s*await\s+getCurrentUserFull\(\);\s*\n?\s*if\s*\(!fullUser\)\s*\{\s*\n?\s*router\.push\(['"]\/login['"]\);\s*\n?\s*return;\s*\n?\s*\}\s*\n?\s*setUserInfo\(fullUser\);\s*\n?/g, '');
  
  // 4. 简化的 getCurrentUserFull 调用
  content = content.replace(/const\s+fullUser\s*=\s*await\s+getCurrentUserFull\(\);\s*\n?\s*setUserInfo\(fullUser\);\s*\n?/g, '');
  content = content.replace(/await\s+getCurrentUserFull\(\);\s*\n?/g, '');
  
  // 5. 移除 hasPermission 检查（返回 true）
  content = content.replace(/hasPermission\([^)]+\)/g, 'true');
  content = content.replace(/hasAnyPermission\([^)]+\)/g, 'true');
  
  // 6. 移除 userInfo?.is_admin 检查（返回 true）
  content = content.replace(/userInfo\?\.is_admin/g, 'true');
  content = content.replace(/!userInfo\?\.is_admin/g, 'false');
  
  // 7. 移除未使用的 userInfo 变量引用（保持代码可运行）
  // 将 userInfo?.username 替换为空字符串
  content = content.replace(/userInfo\?\.(username|name)/g, '""');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`✓ ${path.relative(srcDir, filePath)}`);
    return true;
  }
  return false;
}

// 主函数
const files = getAllTsxFiles(srcDir);
let modified = 0;

for (const file of files) {
  if (cleanFile(file)) {
    modified++;
  }
}

console.log(`\n完成！修改了 ${modified} 个文件`);

