import { BaseApi } from './base-api';
import { User, UserCreate, UserUpdate, UserWithSubordinates } from '@/types/user';

/**
 * 用户API服务类
 */
class UserApi extends BaseApi {
  constructor() {
    super('/users');
  }

  /**
   * 获取用户列表
   * @param role 可选的角色筛选
   * @returns 用户列表
   */
  async getUsers(role?: string): Promise<User[]> {
    const params = role ? { role } : {};
    return this.get<User[]>('/', params, '获取用户列表失败');
  }

  /**
   * 获取单个用户
   * @param id 用户ID
   * @returns 用户信息
   */
  async getUser(id: number): Promise<User> {
    return this.get<User>(`/${id}`, {}, '获取用户信息失败');
  }

  /**
   * 获取当前用户的下属
   * @returns 下属用户列表
   */
  async getSubordinates(): Promise<User[]> {
    return this.get<User[]>('/me/subordinates', {}, '获取下属用户失败');
  }

  /**
   * 创建用户
   * @param user 用户创建数据
   * @returns 创建的用户
   */
  async createUser(user: UserCreate): Promise<User> {
    return this.post<User>('/', user, '创建用户失败');
  }

  /**
   * 更新用户
   * @param id 用户ID
   * @param user 更新数据
   * @returns 更新后的用户
   */
  async updateUser(id: number, user: UserUpdate): Promise<User> {
    return this.put<User>(`/${id}`, user, '更新用户失败');
  }

  /**
   * 删除用户
   * @param id 用户ID
   * @returns 操作结果
   */
  async deleteUser(id: number): Promise<void> {
    return this.delete<void>(`/${id}`, '删除用户失败');
  }

  /**
   * 更新用户状态
   * @param id 用户ID
   * @param status 状态
   * @returns 更新后的用户
   */
  async updateUserStatus(id: number, status: boolean): Promise<User> {
    return this.put<User>(`/${id}/status`, { status }, '更新用户状态失败');
  }

  /**
   * 更新用户密码
   * @param id 用户ID
   * @param oldPassword 旧密码
   * @param newPassword 新密码
   * @returns 操作结果
   */
  async updateUserPassword(id: number, oldPassword: string, newPassword: string): Promise<void> {
    return this.put<void>(`/${id}/password`, { old_password: oldPassword, new_password: newPassword }, '更新密码失败');
  }

  /**
   * 获取可选的上级用户列表（二级管理员）
   * @returns 二级管理员列表
   */
  async getManagers(): Promise<User[]> {
    return this.get<User[]>('/', { role: 'manager' }, '获取管理员列表失败');
  }
}

// 创建单例实例
const userApi = new UserApi();

// 导出API方法
export const getUsers = (role?: string) => userApi.getUsers(role);
export const getUser = (id: number) => userApi.getUser(id);
export const getSubordinates = () => userApi.getSubordinates();
export const createUser = (user: UserCreate) => userApi.createUser(user);
export const updateUser = (id: number, user: UserUpdate) => userApi.updateUser(id, user);
export const deleteUser = (id: number) => userApi.deleteUser(id);
export const updateUserStatus = (id: number, status: boolean) => userApi.updateUserStatus(id, status);
export const updateUserPassword = (id: number, oldPassword: string, newPassword: string) => userApi.updateUserPassword(id, oldPassword, newPassword);
export const getManagers = () => userApi.getManagers(); 