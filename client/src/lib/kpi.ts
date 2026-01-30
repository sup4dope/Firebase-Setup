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
  const monthStart = startOfMonth(date);
  
  // 현재 DB에 있는 고객 ID Set (삭제되지 않은 고객만)
  const existingCustomerIds = new Set(customers.map(c => c.id));
  
  // 해당 월에 유입된 고객 수 (entry_date 기준) = 전체 상담 건수
  const totalCounselingCount = customers.filter(c => {
    if (!c.entry_date) return false;
    const entryDate = new Date(c.entry_date);
    return isSameMonth(entryDate, date);
  }).length;
  
  // 계약완료 상태 목록 (한글 상태명)
  const contractStatuses = ['계약완료(선불)', '계약완료(외주)', '계약완료(후불)'];
  
  // 이번 달에 계약완료 상태로 변경된 로그 중, 현재 DB에 존재하는 고객만 필터링
  const contractLogs = statusLogs.filter(log => {
    const changedAt = log.changed_at instanceof Date ? log.changed_at : new Date(log.changed_at);
    return contractStatuses.includes(log.new_status) && 
           isSameMonth(changedAt, date) &&
           !isBefore(changedAt, monthStart) &&
           existingCustomerIds.has(log.customer_id);
  });
  
  // 이번 달 계약완료 고객의 고유 ID = 성공 건수
  const uniqueContractCustomerIds = new Set(contractLogs.map(l => l.customer_id));
  const contractCount = uniqueContractCustomerIds.size;
  
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
