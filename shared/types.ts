// CRM Data Types for Policy Fund Consulting

// User roles
export type UserRole = 'staff' | 'team_leader' | 'super_admin';

// User status
export type UserStatus = '재직' | '퇴사';

// Login History entry
export interface LoginHistory {
  ip: string;
  logged_at: Date;
  user_agent?: string;
}

// Commission Rates for employee compensation
export interface CommissionRates {
  teamOverride: number; // 팀 오버라이딩율 (팀장만)
  ad: number; // 광고 수당율 (자문료)
  referral: number; // 지인소개 수당율 (자문료)
  reExecution: number; // 재집행 수당율
  outsource: number; // 외주 수당율
  adDeposit?: number; // 광고 계약금 수당율
  referralDeposit?: number; // 지인소개 계약금 수당율
}

// User (Firestore: users collection)
export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  team_id: string | null;
  team_name: string | null;
  phone?: string; // 연락처 (deprecated, use phone_work)
  phone_work?: string; // 연락처(업무용)
  phone_personal?: string; // 연락처(개인)
  ssn_front?: string; // 주민등록번호 앞 6자리
  ssn_back?: string; // 주민등록번호 뒤 7자리
  address?: string; // 거주지 주소
  bank_name?: string; // 급여계좌 은행명
  bank_account?: string; // 급여계좌 계좌번호
  hire_date?: string; // 입사일자 YYYY-MM-DD
  status?: UserStatus; // 재직/퇴사 상태
  current_ip?: string; // 현재 접속 IP
  last_login_at?: Date; // 최근 로그인 일시
  login_history?: LoginHistory[]; // 로그인 이력 (최근 5개)
  commissionRates?: CommissionRates; // 수당 정책 설정
  totalLeave?: number; // 총 연차 (기본 15일)
  usedLeave?: number;  // 사용한 연차
  db_distribution_enabled?: boolean; // DB 분배 활성화 여부 (기본 true)
  daily_db_limit?: number; // 일일 최대 DB 할당 수 (0 = 무제한)
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
  contract_amount?: number; // 계약금 수령액 (만원 단위)
  deposit_amount?: number; // 계약금액/선수금 (만원 단위)
  contract_fee_rate?: number; // 자문료율 (%)
  execution_amount?: number; // 최종 집행 금액 (만원 단위)
  execution_date?: string; // 집행일자 YYYY-MM-DD
  processing_org?: string; // 신청/진행기관 (deprecated, use processing_orgs)
  processing_orgs?: ProcessingOrg[]; // 진행기관 목록 (다중 기관 지원)
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
  
  // 상담불발 정보
  rejection_reason?: string; // 상담불발 사유
  
  // 관리 정보
  industry?: string; // 업종 (deprecated, use business_type)
  recent_memo?: string; // 최근 메모 (대시보드 테이블 표시용)
  latest_memo?: string; // 최근 메모 (대시보드 동기화용, 호환성)
  last_memo_date?: Date; // 최근 메모 작성일 (대시보드 동기화용)
  memo_history?: CustomerMemo[]; // 메모 이력
  documents?: CustomerDocument[]; // 문서 리스트
  
  // 금융 분석 정보
  financial_obligations?: FinancialObligation[]; // 대출/보증 내역
  credit_summary?: CreditSummary; // 신용 요약
  proposal_summary?: ProposalSummary; // 1초 제안서 요약
}

// 진행기관 상태
export type ProcessingOrgStatus = '진행중' | '부결' | '승인';

// 진행기관 정보
export interface ProcessingOrg {
  org: string; // 기관명
  status: ProcessingOrgStatus; // 진행 상태
  applied_at?: string; // 접수일 YYYY-MM-DD
  rejected_at?: string; // 부결일 YYYY-MM-DD
  approved_at?: string; // 승인일 YYYY-MM-DD
  execution_date?: string; // 집행일 YYYY-MM-DD
  execution_amount?: number; // 집행금액 (만원)
  is_re_execution?: boolean; // 재집행 여부 (첫 자금 이후 추가 자금)
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
  action_type: 'status_change' | 'manager_change' | 'info_update' | 'document_upload' | 'memo_added' | 'org_change';
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
  // 계약률 관련
  contractCount: number;         // 당월 성공(계약완료) 건수
  totalCounselingCount: number;  // 당월 전체 상담 건수 (DB 갯수)
  contractRate: number;          // 계약률 (%)
  
  // 매출 관련
  monthlyRevenue: number;        // 당월 매출 (집행금액 총합, 만원 단위)
  expectedRevenue: number;       // 예상 매출 (만원 단위)
  
  // 영업일 관련
  businessDaysElapsed: number;
  totalBusinessDays: number;
}

// TodoItem (Firestore: todo_list collection) - 새로운 할 일 시스템
export type TodoPriority = 'urgent' | 'normal' | 'low';
export type TodoStatus = '진행중' | '완료' | '취소';

export interface TodoItem {
  id: string;
  title: string;
  memo?: string;
  customer_id?: string;
  customer_name?: string;
  due_date: Date; // 날짜 + 시간 포함
  priority: TodoPriority;
  status: TodoStatus;
  created_at: Date;
  created_by: string; // 이메일
  created_by_name?: string;
  assigned_to?: string; // uid
  assigned_to_name?: string;
}

// CounselingLog (Firestore: counseling_logs collection) - 상담 이력 로그
export interface CounselingLog {
  id: string;
  customer_id: string;
  customer_name?: string;
  manager_id: string;
  manager_name?: string;
  type: 'memo' | 'status_change' | 'contact' | 'counseling';
  content?: string;
  old_status?: string;
  new_status?: string;
  rejection_reason?: string; // 거절/실패 사유
  created_at: Date;
}

// Insert types (for creating new records)
export type InsertUser = Omit<User, 'uid' | 'created_at' | 'updated_at'>;
export type InsertTeam = Omit<Team, 'id' | 'team_id' | 'created_at' | 'updated_at'>;
export type InsertCustomer = Omit<Customer, 'id' | 'readable_id' | 'created_at'>;
export type InsertStatusLog = Omit<StatusLog, 'id' | 'changed_at'>;
export type InsertTodo = Omit<Todo, 'id' | 'created_at'>;
export type InsertTodoItem = Omit<TodoItem, 'id' | 'created_at'>;
export type InsertHoliday = Omit<Holiday, 'id'>;

// ========== 금융 분석 관련 타입 ==========

// 금융 의무 유형 (대출/보증)
export type ObligationType = 'loan' | 'guarantee';

// 금융 의무 (대출/보증 내역)
export interface FinancialObligation {
  id: string;
  type: ObligationType; // 대출 또는 보증
  institution: string; // 금융기관명
  product_name: string; // 상품명
  account_type: string; // 계정과목
  balance: number; // 잔액 (원 단위)
  occurred_at: string; // 발생일 (YYYY-MM-DD)
  maturity_date?: string; // 만기일 (YYYY-MM-DD)
  linked_obligation_id?: string; // 연결된 의무 ID (7일 이내 발생시)
  business_registration_number?: string; // 사업자등록번호 (PDF 그룹핑용)
  created_at?: Date;
  updated_at?: Date;
}

// 신용 요약 정보
export interface CreditSummary {
  total_loan_balance: number; // 총 대출 잔액
  total_guarantee_balance: number; // 총 보증 잔액
  institution_breakdown: { institution: string; amount: number }[]; // 기관별 부채
  dti_y1?: number; // DTI (Y-1 매출 기준)
  dti_avg_3y?: number; // DTI (3년 평균 매출 기준)
  last_loan_date?: string; // 최근 대출일
  calculated_at?: Date; // 계산 시점
}

// 심사 적합도 요소
export interface EligibilityFactors {
  credit_score?: number; // 신용점수
  sales_bracket?: string; // 매출구간 (예: "1억~5억")
  business_years?: number; // 업력 (년)
  region?: string; // 지역
  business_type?: string; // 업태
  last_loan_date?: string; // 최근대출일자
}

// 1초 제안서 생성 결과
export interface ProposalSummary {
  debt_summary: string; // 부채 요약 문장
  dti_summary: string; // DTI 요약 문장
  eligibility_summary: string; // 적합도 요약 문장
  generated_at: Date;
}

// Insert 타입
export type InsertFinancialObligation = Omit<FinancialObligation, 'id' | 'created_at' | 'updated_at'>;

// ========== 정산 관리 관련 타입 ==========

// 정산 항목 상태
export type SettlementStatus = '정상' | '취소' | '환수';

// 유입경로 (수당률 결정에 사용)
export type EntrySourceType = '광고' | '고객소개' | '승인복제' | '외주' | '기타';

// 정산 항목 (개별 계약/집행 건)
export interface SettlementItem {
  id: string;
  customer_id: string; // 고객 ID
  customer_name: string; // 업체명
  manager_id: string; // 담당 직원 ID
  manager_name: string; // 담당 직원명
  team_id: string; // 팀 ID
  team_name?: string; // 팀명
  org_name?: string; // 진행기관명 (다중 기관 지원)
  execution_id?: string; // 집행 ID (재집행 구분용)
  
  // 계약 정보
  entry_source: EntrySourceType; // 유입경로
  contract_amount: number; // 계약금 (만원)
  execution_amount: number; // 집행금액 (만원)
  fee_rate: number; // 자문료율 (%)
  
  // 수당 계산 결과
  total_revenue: number; // 총수익 = 계약금 + (집행금액 * 자문료율%)
  commission_rate: number; // 자문료 수당률 (%)
  deposit_commission_rate?: number; // 계약금 수당률 (%) - 미설정시 commission_rate 사용
  gross_commission: number; // 세전수당 (만원)
  tax_amount: number; // 원천세 (3.3%)
  net_commission: number; // 세후실지급액 (만원)
  
  // 정산 정보
  settlement_month: string; // 정산월 (YYYY-MM)
  contract_date: string; // 계약일 (YYYY-MM-DD) - 계약금 수당일자
  execution_date?: string; // 집행일 (YYYY-MM-DD) - 자문료 수당일자
  status: SettlementStatus; // 정상/취소/환수
  is_clawback: boolean; // 환수 항목 여부
  original_item_id?: string; // 환수 시 원본 정산 항목 ID
  clawback_applied_at?: string; // 환수 적용일 (YYYY-MM-DD)
  
  created_at: Date;
  updated_at?: Date;
}

// 월별 정산 요약 (직원별)
export interface MonthlySettlementSummary {
  manager_id: string;
  manager_name: string;
  settlement_month: string; // YYYY-MM
  
  // 집계
  total_contracts: number; // 총 계약 건수
  total_contract_amount: number; // 총 계약금액 (만원)
  execution_count: number; // 집행 건수
  total_execution_amount: number; // 총 집행금액 (만원)
  total_revenue: number; // 총 수익 (만원) - deprecated
  total_execution_fee: number; // 총 자문금액 = 집행금액 × 자문료율% × 수당률% (만원)
  total_gross_commission: number; // 총 세전수당 (만원)
  total_tax: number; // 총 원천세 (만원)
  total_net_commission: number; // 총 세후실지급액 (만원)
  
  // 환수
  clawback_count: number; // 환수 건수
  clawback_amount: number; // 환수 금액 (만원)
  
  // 최종
  final_payment: number; // 최종 지급액 (세후 - 환수)
}

// Insert 타입
export type InsertSettlementItem = Omit<SettlementItem, 'id' | 'created_at' | 'updated_at'>;

// ========== 회사 정산 관련 타입 ==========

// 비용 카테고리
export type ExpenseCategory = '마케팅비' | '운영비' | '고정비' | '기타';

// 비용 항목 (Firestore: expenses collection)
export interface Expense {
  id: string;
  category: ExpenseCategory; // 카테고리
  name: string; // 항목명 (예: "네이버 광고", "임대료")
  amount: number; // 금액 (만원)
  month: string; // 해당 월 (YYYY-MM)
  description?: string; // 설명
  is_recurring: boolean; // 매월 반복 여부
  created_at: Date;
  updated_at?: Date;
  created_by?: string; // 생성자 ID
}

// 승인된 계약 (contracts collection) - 직원 정산 확정 데이터
export interface ApprovedContract {
  id: string;
  customer_id: string;
  customer_name: string;
  manager_id: string;
  manager_name: string;
  team_id?: string;
  team_name?: string;
  entry_source: string; // 유입경로
  contract_amount: number; // 계약금 (만원)
  execution_amount: number; // 집행금액 (만원)
  fee_rate: number; // 자문료율 (%)
  total_revenue: number; // 총수익 (만원)
  employee_commission: number; // 직원 수수료 (만원)
  contract_date: string; // 계약일 (YYYY-MM-DD)
  execution_date?: string; // 집행일 (YYYY-MM-DD)
  settlement_month: string; // 정산월 (YYYY-MM)
  status: '정상' | '취소' | '환수';
  is_clawback: boolean;
  approved_at: Date; // 확정일
  created_at: Date;
}

// 회사 정산 요약
export interface CompanySettlementSummary {
  month: string; // YYYY-MM
  
  // 매출
  gross_revenue: number; // 총매출 (입금액 - 환수)
  total_deposits: number; // 전체 입금액 (계약금 + 자문료)
  clawback_loss: number; // 환수 손실액
  
  // 비용
  employee_commission: number; // 직원 수수료 총액
  marketing_cost: number; // 마케팅비
  fixed_cost: number; // 고정비 (임대료, IT 등)
  other_cost: number; // 기타 운영비
  total_cost: number; // 총 비용
  
  // 이익
  operating_profit: number; // 영업이익 (총매출 - 총비용)
  tax_reserve: number; // 세금 예비비 (총매출 × 15%)
  
  // DB 지표
  ad_db_count: number; // 광고 유입 DB 수
  contract_count: number; // 확정 계약 건수
  cvr: number; // 전환율 (%)
  roi: number; // ROI (%)
}

// Insert 타입
export type InsertExpense = Omit<Expense, 'id' | 'created_at' | 'updated_at'>;

// Consultation (Firestore: consultations collection) - 상담 신청 데이터 (랜딩페이지 유입)
export interface Consultation {
  id: string;
  name: string; // 고객명 (대표자명)
  phone: string; // 연락처
  businessName: string; // 업체명
  businessNumber: string; // 사업자등록번호
  businessAge: string; // 업력 ("1년 이상 ~ 7년 미만" 등)
  revenue: string; // 매출 ("3천만원 미만" 등)
  region: string; // 지역
  creditScore: string; // 신용점수 문자열 ("350~600점" 등)
  taxStatus: string; // 세금 체납 상태 ("체납 및 연체가 없어요" 등)
  services: string[]; // 신청 서비스 배열
  source: string; // 유입 소스 ("landing-page" 등)
  createdAt: Date; // 신청 일시
  email?: string; // 이메일
  linked_customer_id?: string; // 연동된 CRM 고객 ID
  processed?: boolean; // CRM 자동 처리 완료 여부
}

// 레거시 Consultation 타입 (기존 호환용)
export interface LegacyConsultation {
  id: string;
  customername: string; // 대표자명
  creditScore: number; // 신용점수 (숫자)
  businessName: string; // 업체명
  businessNumber: string; // 사업자등록번호
  region: string; // 지역
  businessStartDate: string; // 개업일
  revenue: string; // 매출
  taxDelinquency: string; // 세금체납
  services: string[]; // 신청 서비스 배열
  estimatedLimit?: number; // 예상 한도 (만원)
  createdAt: Date; // 신청 일시
  phone?: string; // 연락처
  email?: string; // 이메일
  linked_customer_id?: string; // 연동된 CRM 고객 ID
}

// ========================================
// 연차 관리 시스템 타입 정의
// ========================================

// 연차 신청 유형
export type LeaveType = 'full' | 'am' | 'pm'; // 전일(1.0), 오전반차(0.5), 오후반차(0.5)

// 연차 신청 상태 (2단계 승인)
export type LeaveStatus = 
  | 'pending_leader'  // 팀장 승인 대기
  | 'pending_admin'   // 총관리자 승인 대기
  | 'approved'        // 최종 승인
  | 'rejected'        // 반려
  | 'cancelled';      // 승인 취소 (총관리자만)

// 연차 신청 (Firestore: leave_requests collection)
export interface LeaveRequest {
  id: string;
  user_id: string;           // 신청자 UID
  user_name: string;         // 신청자 이름
  team_id: string | null;    // 팀 ID
  team_name: string | null;  // 팀 이름
  leave_date: string;        // 연차 사용일 YYYY-MM-DD
  leave_type: LeaveType;     // 전일/오전반차/오후반차
  leave_days: number;        // 차감 일수 (1.0 또는 0.5)
  reason: string;            // 사유
  status: LeaveStatus;       // 현재 상태
  
  // 승인/반려 정보
  leader_approved_by?: string;    // 팀장 승인자 UID
  leader_approved_name?: string;  // 팀장 승인자 이름
  leader_approved_at?: Date;      // 팀장 승인 일시
  admin_approved_by?: string;     // 총관리자 승인자 UID
  admin_approved_name?: string;   // 총관리자 승인자 이름
  admin_approved_at?: Date;       // 총관리자 승인 일시
  rejected_by?: string;           // 반려자 UID
  rejected_name?: string;         // 반려자 이름
  rejected_at?: Date;             // 반려 일시
  rejected_reason?: string;       // 반려 사유
  cancelled_by?: string;          // 취소자 UID (총관리자)
  cancelled_by_name?: string;     // 취소자 이름
  cancelled_at?: Date;            // 취소 일시
  
  created_at: Date;
  updated_at?: Date;
}

// 연차 신청 Insert 타입
export type InsertLeaveRequest = Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at'>;

// 공휴일 API 응답 타입 (공공데이터포털)
export interface PublicHolidayItem {
  dateKind: string;     // 종류: 01=국경일, 02=공휴일, 03=대체공휴일 등
  dateName: string;     // 공휴일 명칭
  isHoliday: string;    // Y/N
  locdate: number;      // 날짜 YYYYMMDD
  seq: number;          // 순번
}

// 연차 요약 정보
export interface LeaveSummary {
  totalLeave: number;   // 총 연차
  usedLeave: number;    // 사용 연차
  remainingLeave: number; // 잔여 연차
  pendingCount: number;   // 승인 대기 건수
}
