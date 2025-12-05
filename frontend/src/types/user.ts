export interface User {
  id: number;
  username: string;
  role: string; // admin(管理员), manager(二级管理员), user(普通用户)
  superior_id: number | null; // 上级ID，只有普通用户(user)需要设置上级(manager)
  status: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCreate {
  username: string;
  password: string;
  role?: string;
  superior_id?: number | null;
  status?: boolean;
}

export interface UserUpdate {
  username?: string;
  password?: string;
  role?: string;
  superior_id?: number | null;
  status?: boolean;
}

export interface UserWithSubordinates extends User {
  subordinates: User[];
} 