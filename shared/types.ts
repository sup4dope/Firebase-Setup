// CRM Data Types for Policy Fund Consulting

// User roles
export type UserRole = 'staff' | 'team_leader' | 'super_admin';

// User status
export type UserStatus = '재직' | '퇴사';

// User (Firestore: users collection)
export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  team_id: string | null;
  team_name: string | null;
  phone?: string; // 연락처
  status?: UserStatus; // 재직/퇴사 상태
  created_at?: Date;
  updated_at?: Date;
}

// Team (Firestore: teams collection)
export interface Team {
  id: string;
  team_id: string; // 문서 ID와 동일
  team_name: string; // 팀명
  name: string; // 팀명 (호환용)
  created_at: Date;
  updated_at?: Date;
}

// Customer status - 한글 자연어 상태명 사용
// 이제 '1-1' 같은 숫자 코드 대신 '상담대기', '단기부재' 같은 한글 텍스트를 직접 사용
export type StatusCode = string;

// 기본 상태값
export const DEFAULT_STATUS = "상담대기";

// Customer (Firestore: customers collection)
export interface Customer {
  id: string;
  readable_id: string; // YYMMDD-XXX format
  daily_sequence?: number; // 일별 순번 (deprecated, use daily_no)
  daily_no?: number; // 당일 일련번호 (전체 전산 기준)
  name: string;
  company_name: string;
  business_registration_number?: string; // 사업자등록번호
  phone?: string;
  email?: string;
  status_code: StatusCode;
  manager_id: string;
  manager_name?: string;
  team_id: string;
  team_name?: string;
  entry_date: string; // YYYY-MM-DD
  founding_date?: string; // 설립일/개업일 YYYY-MM-DD
  address?: string; // 기본 주소 (deprecated, use business_address)
  address_detail?: string; // 상세 주소 (deprecated)
  approved_amount: number; // 승인 금액
  commission_rate: number; // 수수료율 (총관리자만 열람)
  contract_completion_date?: string; // 최초 계약 도달일
  notes?: string;
  created_at: Date;
  updated_at?: Date; // 최종 업데이트 시각 (메모/상태 변경 시)
  
  // 고객 정보
  credit_score?: number; // 신용점수
  ssn_front?: string; // 주민등록번호 앞 6자리
  ssn_back?: string; // 주민등록번호 뒤 7자리
  carrier?: string; // 통신사
  home_address?: string; // 자택주소
  home_address_detail?: string; // 자택 상세주소
  is_home_owned?: boolean; // 자택 자가여부
  is_same_as_business?: boolean; // 자택=사업장 동일여부
  
  // 사업자 정보
  entry_source?: string; // 유입경로
  business_type?: string; // 업종
  business_item?: string; // 종목
  retry_type?: string; // 재도전 유형
  innovation_type?: string; // 혁신기술 유형
  business_address?: string; // 사업장 소재지
  business_address_detail?: string; // 사업장 상세주소
  is_business_owned?: boolean; // 사업장 자가여부
  over_7_years?: boolean; // 7년 초과 여부 (자동 계산)
  
  // 매출 정보
  recent_sales?: number; // 최근 매출 (억원)
  sales_y1?: number; // Y-1 매출 (억원)
  sales_y2?: number; // Y-2 매출 (억원)
  sales_y3?: number; // Y-3 매출 (억원)
  avg_revenue_3y?: number; // 3년 평균 매출 (억원)
  
  // 관리 정보
  industry?: string; // 업종 (deprecated, use business_type)
  processing_org?: string; // 진행기관
  recent_memo?: string; // 최근 메모 (대시보드 테이블 표시용)
  latest_memo?: string; // 최근 메모 (대시보드 동기화용, 호환성)
  last_memo_date?: Date; // 최근 메모 작성일 (대시보드 동기화용)
  memo_history?: CustomerMemo[]; // 메모 이력
  documents?: CustomerDocument[]; // 문서 리스트
}

// Customer Memo
export interface CustomerMemo {
  content: string;
  author_id: string;
  author_name: string;
  created_at: Date;
}

// Customer Document (Firebase Storage)
export interface CustomerDocument {
  id: string;
  customer_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_by: string;
  uploaded_by_name?: string;
  uploaded_at: Date;
}

// Customer History Log
export interface CustomerHistoryLog {
  id: string;
  customer_id: string;
  action_type: 'status_change' | 'manager_change' | 'info_update' | 'document_upload' | 'memo_added';
  description: string;
  changed_by: string;
  changed_by_name?: string;
  changed_at: Date;
  old_value?: string;
  new_value?: string;
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
export type InsertUser = Omit<User, 'uid' | 'created_at' | 'updated_at'>;
export type InsertTeam = Omit<Team, 'id' | 'team_id' | 'created_at' | 'updated_at'>;
export type InsertCustomer = Omit<Customer, 'id' | 'readable_id' | 'created_at'>;
export type InsertStatusLog = Omit<StatusLog, 'id' | 'changed_at'>;
export type InsertTodo = Omit<Todo, 'id' | 'created_at'>;
export type InsertHoliday = Omit<Holiday, 'id'>;
