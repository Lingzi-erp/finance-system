import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并类名工具函数
 * 结合clsx和tailwind-merge，用于处理条件类名和合并tailwind类
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
} 