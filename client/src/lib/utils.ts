import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 한국 시간(KST, UTC+9) 기준 오늘 날짜를 YYYY-MM-DD 형식으로 반환.
 * `new Date().toISOString().split('T')[0]`은 UTC 기준이므로 KST 00:00~09:00 사이에는
 * 전날 날짜가 반환되는 버그가 있었음 (예: KST 5/7 새벽 = UTC 5/6 → '2026-05-06').
 * 본 함수는 항상 KST 기준 오늘 날짜를 반환합니다.
 */
export function getTodayKst(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // en-CA 로케일은 'YYYY-MM-DD' 형식으로 반환
  return parts;
}
