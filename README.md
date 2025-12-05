# 财务报表系统

一个轻量级的私有财务报表管理系统，采用模块化架构设计，用于小型企业的财务数据和仓库管理。

## 项目概述

本系统是一个现代化的财务数据管理平台，主要用于企业内部财务数据的录入、管理和仓库操作。系统采用前后端分离架构，后端使用FastAPI提供高性能API服务，前端使用Next.js构建响应式用户界面，整体设计遵循简约实用的设计风格。

### 主要功能

- **用户管理**：支持多角色用户系统（管理员、二级管理员、普通用户）
- **数据模板管理**：由二级管理员创建和管理数据录入模板
- **数据类型管理**：支持入库、出库、调拨等多种数据类型
- **仓库管理**：支持仓库的创建、管理和各种操作（入库、出库、调拨）
- **数据记录管理**：支持数据的录入、查询、统计
- **权限控制**：严格的数据隔离和权限管理机制

### 角色权限设计

1. **管理员（开发者）**
   - 拥有系统最高权限
   - 可创建二级管理员和普通用户
   - 可访问和修改系统中的所有数据

2. **二级管理员（老板）**
   - 由管理员创建
   - 可创建数据模板和数据类型
   - 只能查看和操作自己创建的数据
   - 可以查看和修改其下属员工创建的数据记录

3. **普通用户（员工）**
   - 由管理员创建并指定其上级（二级管理员）
   - 只能使用其上级创建的数据类型进行操作
   - 只能查看自己创建的数据记录
   - 无权修改任何数据记录

### 数据操作流程

1. **入库操作**
   - 选择入库类型数据模板
   - 填写入库表单
   - 系统自动生成入库记录

2. **出库操作**
   - 选择在库的入库记录
   - 选择出库类型
   - 填写出库表单
   - 系统生成出库记录并关联入库记录

3. **调拨操作**
   - 直接从供货商到收货方的转移
   - 不经过仓库的出入库操作
   - 使用专门的调拨模块处理

## 技术栈

### 后端
- Python 3.11+
- FastAPI - Web框架
- SQLite - 数据库
- SQLAlchemy - ORM框架
- Pydantic - 数据验证
- Python-Jose - JWT认证
- Passlib - 密码加密
- Uvicorn - ASGI服务器

### 前端
- Next.js 14+
- React 18
- TailwindCSS
- ShadcnUI - 组件库
- React Query - 数据请求

## 系统架构

```
财务报表系统
├── backend/                # 后端项目
│   ├── app/               # 应用主目录
│   │   ├── api/          # API路由
│   │   │   └── api_v1/   # V1版本API
│   │   ├── core/         # 核心功能
│   │   │   ├── auth/     # 认证相关
│   │   │   ├── config.py # 配置
│   │   │   └── deps.py   # 依赖注入
│   │   ├── models/       # 数据库模型
│   │   ├── schemas/      # 数据验证模型
│   │   └── services/     # 业务逻辑
│   ├── tests/            # 测试
│   ├── alembic/          # 数据库迁移
│   └── main.py           # 入口文件
│
└── frontend/             # 前端项目
    ├── src/
    │   ├── app/         # Next.js 路由
    │   ├── components/  # React组件
    │   ├── lib/         # 工具函数
    │   ├── types/       # TypeScript类型
    │   └── styles/      # 样式文件
    └── public/          # 静态资源
```

## 核心API

### 仓库管理 API (`/repositories`)

1. **获取仓库列表**
```
GET /repositories
参数:
- skip: int (可选，默认0)
- limit: int (可选，默认100)
- status: bool (可选)
```

2. **获取单个仓库**
```
GET /repositories/{repository_id}
```

3. **创建仓库**
```
POST /repositories
请求体:
{
    "name": string,
    "code": string,
    "description": string (可选),
    "status": boolean,
    "settings": any (可选)
}
```

4. **更新仓库**
```
PUT /repositories/{repository_id}
请求体:
{
    "name": string (可选),
    "code": string (可选),
    "description": string (可选),
    "status": boolean (可选),
    "settings": any (可选)
}
```

5. **删除仓库**
```
DELETE /repositories/{repository_id}
```

## 开发环境要求
- Python 3.11+
- Node.js 18+
- SQLite 3
- Git

## 快速开始

### 后端启动
```bash
# 进入后端目录
cd backend

# 安装依赖
pip install -r requirements.txt

# 初始化数据库
alembic upgrade head

# 启动服务
uvicorn app.main:app --reload
```

### 前端启动
```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 待开发功能

1. **财务核心功能**
   - 添加会计科目管理
   - 添加凭证和会计分录功能
   - 设计账簿和报表模板

2. **系统优化**
   - 添加数据导入导出功能
   - 增加数据可视化组件
   - 完善报表生成功能

3. **安全性增强**
   - 添加操作日志
   - 增加数据备份功能
   - 完善权限控制

## 许可证

本项目采用 MIT 许可证 - 详情请参见 LICENSE 文件