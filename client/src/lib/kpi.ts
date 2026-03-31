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
import type { Customer, StatusLog, KPIData, SettlementItem } from '@shared/types';

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
  date: Date = new Date(),
  settlements: SettlementItem[] = []
): KPIData => {
  const CONTRACT_AND_BEYOND_STATUSES = [
    '계약완료(선불)', '계약완료(외주)', '계약완료(후불)',
    '서류취합완료(선불)', '서류취합완료(외주)', '서류취합완료(후불)',
    '신청완료(선불)', '신청완료(외주)', '신청완료(후불)',
    '집행완료', '집행완료(선불)', '집행완료(후불)', '집행완료(외주)',
    '민원처리',
  ];
  
  const monthlyCustomers = customers.filter(c => {
    if (!c.entry_date) return false;
    const entryDate = new Date(c.entry_date);
    return isSameMonth(entryDate, date);
  });
  const totalCounselingCount = monthlyCustomers.length;
  
  const contractCount = monthlyCustomers.filter(c =>
    c.status_code && CONTRACT_AND_BEYOND_STATUSES.includes(c.status_code)
  ).length;
  
  const contractRate = totalCounselingCount > 0 
    ? Math.round((contractCount / totalCounselingCount) * 100) 
    : 0;
  
  const currentMonth = format(date, 'yyyy-MM');
  const monthlyRevenue = settlements
    .filter(s => s.settlement_month === currentMonth && s.status === '정상' && !s.is_clawback)
    .reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  
  const totalBusinessDays = getBusinessDaysInMonth(date, holidayMap);
  const businessDaysElapsed = getElapsedBusinessDays(date, holidayMap);
  
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
