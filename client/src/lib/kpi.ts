// KPI calculation utilities for business days
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWeekend,
  isSameMonth,
  isAfter,
  format,
} from 'date-fns';
import type { Customer, StatusLog, KPIData } from '@shared/types';

// Check if a date is a holiday using Map<string, string> format (from public API)
const isHolidayFromMap = (date: Date, holidayMap: Map<string, string>): boolean => {
  const dateStr = format(date, 'yyyy-MM-dd');
  return holidayMap.has(dateStr);
};

// Get business days in a month (excluding weekends and holidays)
export const getBusinessDaysInMonth = (date: Date, holidayMap: Map<string, string>): number => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const days = eachDayOfInterval({ start, end });
  
  return days.filter(day => !isWeekend(day) && !isHolidayFromMap(day, holidayMap)).length;
};

// Get elapsed business days in current month
export const getElapsedBusinessDays = (date: Date, holidayMap: Map<string, string>): number => {
  const start = startOfMonth(date);
  const today = new Date();
  
  // If checking a future month, return 0
  if (isAfter(start, today)) return 0;
  
  // If checking a past month, return all business days
  const end = isSameMonth(date, today) ? today : endOfMonth(date);
  const days = eachDayOfInterval({ start, end });
  
  return days.filter(day => !isWeekend(day) && !isHolidayFromMap(day, holidayMap)).length;
};

// Calculate KPI data
export const calculateKPI = (
  customers: Customer[],
  statusLogs: StatusLog[],
  holidayMap: Map<string, string>,
  date: Date = new Date()
): KPIData => {
  const CONTRACT_AND_BEYOND_STATUSES = [
    '계약완료(선불)', '계약완료(외주)', '계약완료(후불)',
    '서류취합완료(선불)', '서류취합완료(외주)', '서류취합완료(후불)',
    '신청완료(선불)', '신청완료(외주)', '신청완료(후불)',
    '집행완료', '집행완료(선불)', '집행완료(후불)', '집행완료(외주)',
  ];
  
  // 해당 월에 유입된 고객 (entry_date 기준)
  const monthlyCustomers = customers.filter(c => {
    if (!c.entry_date) return false;
    const entryDate = new Date(c.entry_date);
    return isSameMonth(entryDate, date);
  });
  const totalCounselingCount = monthlyCustomers.length;
  
  // 계약 건수: 해당 월 유입 고객 중 현재 상태가 계약서발송 이후 단계인 고객
  const contractCount = monthlyCustomers.filter(c =>
    c.status_code && CONTRACT_AND_BEYOND_STATUSES.includes(c.status_code)
  ).length;
  
  // 계약률 계산
  const contractRate = totalCounselingCount > 0 
    ? Math.round((contractCount / totalCounselingCount) * 100) 
    : 0;
  
  // 당월 매출: 해당 월에 유입된 고객들 중 집행완료 상태인 고객의 execution_amount 합계
  const monthlyRevenue = customers
    .filter(c => {
      if (!c.entry_date) return false;
      const entryDate = new Date(c.entry_date);
      return isSameMonth(entryDate, date) && c.status_code?.includes('집행완료');
    })
    .reduce((sum, c) => sum + (c.execution_amount || 0), 0);
  
  // Business days calculation
  const totalBusinessDays = getBusinessDaysInMonth(date, holidayMap);
  const businessDaysElapsed = getElapsedBusinessDays(date, holidayMap);
  
  // 예상 매출: (당월 총 집행금액 / 경과영업일) × 전체영업일
  const ratio = businessDaysElapsed > 0 ? totalBusinessDays / businessDaysElapsed : 1;
  const expectedRevenue = Math.round(monthlyRevenue * ratio);
  
  return {
    contractCount,
    totalCounselingCount,
    contractRate,
    monthlyRevenue,
    expectedRevenue,
    businessDaysElapsed,
    totalBusinessDays,
  };
};

// Format currency (Korean Won)
export const formatCurrency = (amount: number): string => {
  if (amount >= 100000000) {
    return `${(amount / 100000000).toFixed(1)}억`;
  }
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(0)}만`;
  }
  return amount.toLocaleString('ko-KR');
};

// Format currency with full number
export const formatCurrencyFull = (amount: number): string => {
  return `${amount.toLocaleString('ko-KR')}원`;
};
