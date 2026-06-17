import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 把 0..n-1 转成选项字母：0->A, 1->B ... */
export function letter(i: number): string {
  return String.fromCharCode(65 + i);
}

/** 把字母转回索引：A->0, B->1 ... */
export function letterIndex(ch: string): number {
  return ch.toUpperCase().charCodeAt(0) - 65;
}
