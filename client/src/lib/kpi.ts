// KPI calculation utilities for business days
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isWeekend,
  isSameMonth,
  isBefore,
  isAfter,
  format,
} from 'date-fns';
import type { Holiday, Customer, StatusLog, KPIData } from '@shared/types';

// Check if a date is a holiday
const isHoliday = (date: Date, holidays: Holiday[]): boolean => {
  const dateStr = format(date, 'yyyy-MM-dd');
  return holidays.some(h => h.date === dateStr);
};

// Get business days in a month (excluding weekends and holidays)
export const getBusinessDaysInMonth = (date: Date, holidays: Holiday[]): number => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const days = eachDayOfInterval({ start, end });
  
  return days.filter(day => !isWeekend(day) && !isHoliday(day, holidays)).length;
};

// Get elapsed business days in current month
export const getElapsedBusinessDays = (date: Date, holidays: Holiday[]): number => {
  const start = startOfMonth(date);
  const today = new Date();
  
  // If checking a future month, return 0
  if (isAfter(start, today)) return 0;
  
  // If checking a past month, return all business days
  const end = isSameMonth(date, today) ? today : endOfMonth(date);
  const days = eachDayOfInterval({ start, end });
  
  return days.filter(day => !isWeekend(day) && !isHoliday(day, holidays)).length;
};

// Calculate KPI data
export const calculateKPI = (
  customers: Customer[],
  statusLogs: StatusLog[],
  holidays: Holiday[],
  date: Date = new Date()
): KPIData => {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  
  // 현재 DB에 있는 고객 ID Set (삭제되지 않은 고객만)
  const existingCustomerIds = new Set(customers.map(c => c.id));
  
  // 계약완료 상태 목록 (한글 상태명)
  const contractStatuses = ['계약완료(선불)', '계약완료(외주)', '계약완료(후불)'];
  
  // 이번 달에 계약완료 상태로 변경된 로그 중, 현재 DB에 존재하는 고객만 필터링
  const contractLogs = statusLogs.filter(log => {
    const changedAt = log.changed_at instanceof Date ? log.changed_at : new Date(log.changed_at);
    return contractStatuses.includes(log.new_status) && 
           isSameMonth(changedAt, date) &&
           !isBefore(changedAt, monthStart) &&
           existingCustomerIds.has(log.customer_id); // 현재 DB에 존재하는 고객만
  });
  
  // 이번 달 계약완료 고객의 고유 ID
  const uniqueContractCustomerIds = new Set(contractLogs.map(l => l.customer_id));
  const currentContracts = uniqueContractCustomerIds.size;
  
  // 현재 매출: 이번 달 계약완료한 고객들의 approved_amount 합계
  const currentRevenue = customers
    .filter(c => uniqueContractCustomerIds.has(c.id))
    .reduce((sum, c) => sum + (c.approved_amount || 0), 0);
  
  // Business days calculation
  const totalBusinessDays = getBusinessDaysInMonth(date, holidays);
  const businessDaysElapsed = getElapsedBusinessDays(date, holidays);
  
  // Projected calculations (linear projection)
  const ratio = businessDaysElapsed > 0 ? totalBusinessDays / businessDaysElapsed : 1;
  const expectedContracts = Math.round(currentContracts * ratio);
  const expectedRevenue = Math.round(currentRevenue * ratio);
  
  return {
    expectedContracts,
    currentContracts,
    expectedRevenue,
    currentRevenue,
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
