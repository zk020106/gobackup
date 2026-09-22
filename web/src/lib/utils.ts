import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// 函数：cn。合并条件 className 并处理 Tailwind 冲突。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
