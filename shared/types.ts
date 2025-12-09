// CRM Data Types for Policy Fund Consulting

// User roles
export type UserRole = 'staff' | 'team_leader' | 'super_admin';

// User (Firestore: users collection)
export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  team_id: string | null;
  team_name: string | null;
}

// Team (Firestore: teams collection)
export interface Team {
  id: string;
  name: string;
  created_at: Date;
}

// Customer status codes
// 0-X: 드롭아웃/부재
// 1-X: 상담 진행
// 2-X: 서류 준비
// 3-X: 심사 중
// 4-X: 계약 진행
// 5-X: 집행 완료
export type StatusCode = 
  | '0-1' | '0-2' | '0-3' // 드롭아웃: 단기부재, 장기부재, 거절
  | '1-1' | '1-2' | '1-3' // 상담: 대기, 진행중, 완료
  | '2-1' | '2-2' | '2-3' // 서류: 요청, 수집중, 완료
  | '3-1' | '3-2' | '3-3' // 심사: 접수, 진행중, 완료
  | '4-1' | '4-2' | '4-3' // 계약: 조건협의, 서명대기, 완료
  | '5-1' | '5-2'; // 집행: 대기, 완료

// Status code labels
export const STATUS_LABELS: Record<StatusCode, string> = {
  '0-1': '단기부재',
  '0-2': '장기부재',
  '0-3': '거절',
  '1-1': '상담대기',
  '1-2': '상담진행',
  '1-3': '상담완료',
  '2-1': '서류요청',
  '2-2': '서류수집',
  '2-3': '서류완료',
  '3-1': '심사접수',
  '3-2': '심사진행',
  '3-3': '심사완료',
  '4-1': '조건협의',
  '4-2': '서명대기',
  '4-3': '계약완료',
  '5-1': '집행대기',
  '5-2': '집행완료',
};

// Funnel stages (main categories)
export const FUNNEL_STAGES = [
  { code: '1', label: '상담', icon: 'MessageCircle' },
  { code: '2', label: '서류', icon: 'FileText' },
  { code: '3', label: '심사', icon: 'Search' },
  { code: '4', label: '계약', icon: 'FileSignature' },
  { code: '5', label: '집행', icon: 'CheckCircle' },
] as const;

// Customer (Firestore: customers collection)
export interface Customer {
  id: string;
  readable_id: string; // YYMMDD-XXX format
  name: string;
  company_name: string;
  phone?: string;
  email?: string;
  status_code: StatusCode;
  manager_id: string;
  manager_name?: string;
  team_id: string;
  team_name?: string;
  entry_date: string; // YYYY-MM-DD
  approved_amount: number; // 승인 금액
  commission_rate: number; // 수수료율 (총관리자만 열람)
  contract_completion_date?: string; // 최초 계약 도달일
  notes?: string;
  created_at: Date;
}

// Status change log (Firestore: status_logs collection)
export interface StatusLog {
  id: string;
  customer_id: string;
  customer_name?: string;
  previous_status: StatusCode;
  new_status: StatusCode;
  changed_by_user_id: string;
  changed_by_user_name?: string;
  changed_at: Date;
}

// Todo (Firestore: todos collection)
export interface Todo {
  id: string;
  content: string;
  assigned_to: string; // user uid
  assigned_to_name?: string;
  assigned_by: string; // user uid
  assigned_by_name?: string;
  customer_id?: string; // optional link to customer
  customer_name?: string;
  due_date: string; // YYYY-MM-DD
  is_completed: boolean;
  created_at: Date;
}

// Holiday (Firestore: holidays collection)
export interface Holiday {
  id: string; // YYYY-MM-DD as ID
  date: string;
  description: string;
}

// KPI data for dashboard
export interface KPIData {
  expectedContracts: number;
  currentContracts: number;
  expectedRevenue: number;
  currentRevenue: number;
  businessDaysElapsed: number;
  totalBusinessDays: number;
}

// Insert types (for creating new records)
export type InsertUser = Omit<User, 'uid'>;
export type InsertTeam = Omit<Team, 'id' | 'created_at'>;
export type InsertCustomer = Omit<Customer, 'id' | 'readable_id' | 'created_at'>;
export type InsertStatusLog = Omit<StatusLog, 'id' | 'changed_at'>;
export type InsertTodo = Omit<Todo, 'id' | 'created_at'>;
export type InsertHoliday = Omit<Holiday, 'id'>;
