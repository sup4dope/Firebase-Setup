import type { PublicHolidayItem } from '@shared/types';

const API_KEY = '9e1b6634ab6635f5859fbeef1cffd07ae7f6d12d35d7fb4c4eb3d146e4e8c5ff';
const BASE_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

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

export const fetchYearlyHolidays = async (year: number): Promise<Map<string, string>> => {
  const holidayMap = new Map<string, string>();
  
  const promises = Array.from({ length: 12 }, (_, i) => fetchPublicHolidays(year, i + 1));
  const results = await Promise.all(promises);
  
  results.flat().forEach(holiday => {
    const dateStr = holiday.locdate.toString();
    const formatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    holidayMap.set(formatted, holiday.dateName);
  });
  
  return holidayMap;
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
