import type { PublicHolidayItem } from '@shared/types';

const API_KEY = '9e1b6634ab6635f5859fbeef1cffd07ae7f6d12d35d7fb4c4eb3d146e4e8c5ff';
const BASE_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

const FALLBACK_HOLIDAYS_2025: Map<string, string> = new Map([
  ['2025-01-01', '신정'],
  ['2025-01-28', '설날연휴'],
  ['2025-01-29', '설날'],
  ['2025-01-30', '설날연휴'],
  ['2025-03-01', '삼일절'],
  ['2025-05-05', '어린이날'],
  ['2025-05-06', '부처님오신날'],
  ['2025-06-06', '현충일'],
  ['2025-08-15', '광복절'],
  ['2025-10-03', '개천절'],
  ['2025-10-05', '추석연휴'],
  ['2025-10-06', '추석'],
  ['2025-10-07', '추석연휴'],
  ['2025-10-08', '대체공휴일'],
  ['2025-10-09', '한글날'],
  ['2025-12-25', '크리스마스'],
]);

const FALLBACK_HOLIDAYS_2026: Map<string, string> = new Map([
  ['2026-01-01', '신정'],
  ['2026-02-16', '설날연휴'],
  ['2026-02-17', '설날'],
  ['2026-02-18', '설날연휴'],
  ['2026-03-01', '삼일절'],
  ['2026-03-02', '대체공휴일'],
  ['2026-05-05', '어린이날'],
  ['2026-05-24', '부처님오신날'],
  ['2026-06-06', '현충일'],
  ['2026-08-15', '광복절'],
  ['2026-08-17', '대체공휴일'],
  ['2026-09-24', '추석연휴'],
  ['2026-09-25', '추석'],
  ['2026-09-26', '추석연휴'],
  ['2026-10-03', '개천절'],
  ['2026-10-05', '대체공휴일'],
  ['2026-10-09', '한글날'],
  ['2026-12-25', '크리스마스'],
]);

interface HolidayApiResponse {
  response: {
    header: {
      resultCode: string;
      resultMsg: string;
    };
    body: {
      items: {
        item: PublicHolidayItem | PublicHolidayItem[];
      };
      numOfRows: number;
      pageNo: number;
      totalCount: number;
    };
  };
}

export const fetchPublicHolidays = async (year: number, month: number): Promise<PublicHolidayItem[]> => {
  try {
    const solMonth = month.toString().padStart(2, '0');
    const url = `${BASE_URL}/getRestDeInfo?serviceKey=${API_KEY}&solYear=${year}&solMonth=${solMonth}&_type=json&numOfRows=50`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Public holiday API error:', response.status);
      return [];
    }
    
    const data: HolidayApiResponse = await response.json();
    
    if (data.response.header.resultCode !== '00') {
      console.error('API returned error:', data.response.header.resultMsg);
      return [];
    }
    
    const items = data.response.body?.items?.item;
    
    if (!items) {
      return [];
    }
    
    if (Array.isArray(items)) {
      return items.filter(item => item.isHoliday === 'Y');
    }
    
    return items.isHoliday === 'Y' ? [items] : [];
  } catch (error) {
    console.error('Failed to fetch public holidays:', error);
    return [];
  }
};

const getFallbackHolidays = (year: number): Map<string, string> => {
  if (year === 2025) return FALLBACK_HOLIDAYS_2025;
  if (year === 2026) return FALLBACK_HOLIDAYS_2026;
  return new Map();
};

const HOLIDAY_CACHE_KEY = 'crm_holidays_cache';
const HOLIDAY_CACHE_DURATION = 24 * 60 * 60 * 1000;

interface HolidayCache {
  year: number;
  data: [string, string][];
  timestamp: number;
}

const getCachedHolidays = (year: number): Map<string, string> | null => {
  try {
    const cached = sessionStorage.getItem(`${HOLIDAY_CACHE_KEY}_${year}`);
    if (!cached) return null;
    
    const parsed: HolidayCache = JSON.parse(cached);
    if (parsed.year !== year) return null;
    if (Date.now() - parsed.timestamp > HOLIDAY_CACHE_DURATION) return null;
    
    return new Map(parsed.data);
  } catch {
    return null;
  }
};

const setCachedHolidays = (year: number, holidayMap: Map<string, string>): void => {
  try {
    const cache: HolidayCache = {
      year,
      data: Array.from(holidayMap.entries()),
      timestamp: Date.now(),
    };
    sessionStorage.setItem(`${HOLIDAY_CACHE_KEY}_${year}`, JSON.stringify(cache));
  } catch {
    // sessionStorage full or unavailable
  }
};

export const fetchYearlyHolidays = async (year: number): Promise<Map<string, string>> => {
  const cached = getCachedHolidays(year);
  if (cached && cached.size > 0) {
    return cached;
  }

  const fallbackHolidays = getFallbackHolidays(year);
  
  try {
    const promises = Array.from({ length: 12 }, (_, i) => fetchPublicHolidays(year, i + 1));
    const results = await Promise.all(promises);
    
    const allHolidays = results.flat();
    
    if (allHolidays.length > 0) {
      const holidayMap = new Map<string, string>();
      allHolidays.forEach(holiday => {
        const dateStr = holiday.locdate.toString();
        const formatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        holidayMap.set(formatted, holiday.dateName);
      });
      setCachedHolidays(year, holidayMap);
      return holidayMap;
    }
  } catch (error) {
    console.warn('API fetch failed, using fallback holidays');
  }
  
  setCachedHolidays(year, fallbackHolidays);
  return fallbackHolidays;
};

export const isHoliday = (date: string, holidayMap: Map<string, string>): boolean => {
  return holidayMap.has(date);
};

export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const formatLocdateToString = (locdate: number): string => {
  const str = locdate.toString();
  return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
};
