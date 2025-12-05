# 发布.ps1 - 一键发布脚本
# 使用方法：.\发布.ps1 -Version 1.0.1 -Message "修复了xxx问题"

param(
    [string]$Version = "",
    [string]$Message = "发布新版本"
)

$ErrorActionPreference = "Stop"

if ($Version -eq "") {
    Write-Host ""
    Write-Host "=== 财务系统发布工具 ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法：.\发布.ps1 -Version <版本号> [-Message <说明>]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "示例：" -ForegroundColor Gray
    Write-Host "  .\发布.ps1 -Version 1.0.1" -ForegroundColor Gray
    Write-Host "  .\发布.ps1 -Version 1.1.0 -Message '新增了报表功能'" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# 检查 GH_TOKEN
if (-not $env:GH_TOKEN) {
    Write-Host "错误：未设置 GH_TOKEN 环境变量！" -ForegroundColor Red
    Write-Host "请先设置：`$env:GH_TOKEN = '你的GitHub Token'" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=== 开始发布 v$Version ===" -ForegroundColor Cyan
Write-Host ""

$rootDir = $PSScriptRoot

# 1. 更新版本号
Write-Host "[1/5] 更新版本号..." -ForegroundColor Yellow
$packageJsonPath = Join-Path $rootDir "desktop\package.json"
$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$oldVersion = $packageJson.version
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 10 | Set-Content $packageJsonPath -Encoding UTF8
Write-Host "      $oldVersion → $Version" -ForegroundColor Green

# 2. 构建前端
Write-Host "[2/5] 构建前端..." -ForegroundColor Yellow
Set-Location (Join-Path $rootDir "frontend")
npm run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }
Write-Host "      前端构建完成" -ForegroundColor Green

# 3. 复制资源
Write-Host "[3/5] 复制资源..." -ForegroundColor Yellow
Set-Location (Join-Path $rootDir "desktop")
Remove-Item -Path "resources\frontend" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "..\frontend\.next\standalone" -Destination "resources\frontend" -Recurse -Force
Copy-Item -Path "..\frontend\.next\static" -Destination "resources\frontend\.next\static" -Recurse -Force
Copy-Item -Path "..\frontend\public" -Destination "resources\frontend\public" -Recurse -Force
Write-Host "      资源复制完成" -ForegroundColor Green

# 4. 打包并发布
Write-Host "[4/5] 打包并发布到 GitHub..." -ForegroundColor Yellow
npm run dist -- --publish always
if ($LASTEXITCODE -ne 0) { throw "打包发布失败" }
Write-Host "      发布完成" -ForegroundColor Green

# 5. 提交 Git
Write-Host "[5/5] 提交代码..." -ForegroundColor Yellow
Set-Location $rootDir
git add .
git commit -m "$Message v$Version"
git push
Write-Host "      代码已推送" -ForegroundColor Green

Write-Host ""
Write-Host "=== 发布成功！v$Version ===" -ForegroundColor Green
Write-Host ""
Write-Host "用户下次启动应用时会自动检测到更新。" -ForegroundColor Cyan
Write-Host ""

