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
  const now = new Date();
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  
  // Filter customers and logs for current month
  const monthCustomers = customers.filter(c => {
    const createdAt = c.created_at instanceof Date ? c.created_at : new Date(c.created_at);
    return isSameMonth(createdAt, date) || isBefore(createdAt, monthEnd);
  });
  
  // Current contracts: customers that reached status 4-3 (계약완료) this month
  const contractLogs = statusLogs.filter(log => {
    const changedAt = log.changed_at instanceof Date ? log.changed_at : new Date(log.changed_at);
    return log.new_status === '4-3' && 
           isSameMonth(changedAt, date) &&
           !isBefore(changedAt, monthStart);
  });
  
  // Get unique customer IDs that had contract completion this month
  const uniqueContractCustomerIds = new Set(contractLogs.map(l => l.customer_id));
  const currentContracts = uniqueContractCustomerIds.size;
  
  // Current revenue: sum of approved_amount for contracted customers this month
  const currentRevenue = monthCustomers
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
