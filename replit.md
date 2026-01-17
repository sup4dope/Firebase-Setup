# 정책자금 컨설팅 CRM 시스템

## 프로젝트 개요
Firebase 기반의 정책자금 컨설팅 CRM 시스템입니다. 고객 관리, 영업 퍼널 추적, KPI 분석, 팀 관리 기능을 제공합니다.

## 기술 스택
- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js (개발 서버)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth (Google Sign-in)
- **Styling**: Tailwind CSS + shadcn/ui
- **Fonts**: Inter (UI), JetBrains Mono (코드)

## 프로젝트 구조
```
client/
├── src/
│   ├── components/       # 재사용 가능한 UI 컴포넌트
│   │   ├── AppSidebar.tsx      # 메인 사이드바
│   │   ├── CustomerDetailModal.tsx  # 고객 상세 모달 (3-탭 시스템)
│   │   ├── CustomerForm.tsx    # 고객 등록/수정 폼
│   │   ├── CustomerTable.tsx   # 고객 목록 테이블
│   │   ├── FinancialAnalysisTab.tsx  # 금융 분석 탭 (대출/보증)
│   │   ├── FunnelChart.tsx     # 영업 퍼널 차트
│   │   ├── HolidayManagement.tsx  # 공휴일 관리
│   │   ├── KPIWidgets.tsx      # KPI 위젯들
│   │   ├── ReviewSummaryTab.tsx   # 심사 요약 탭 (파이차트/DTI)
│   │   ├── StatusHistoryDialog.tsx  # 상태 변경 이력
│   │   ├── TeamManagement.tsx  # 팀/사용자 관리
│   │   ├── ThemeToggle.tsx     # 다크모드 토글
│   │   ├── TodoForm.tsx        # 할 일 추가 폼
│   │   ├── TodoList.tsx        # 할 일 목록
│   │   └── report/             # 제안서 컴포넌트
│   │       ├── index.ts        # 모듈 export
│   │       ├── ProposalModal.tsx    # 제안서 입력 모달
│   │       ├── ProposalPreview.tsx  # 제안서 미리보기/인쇄
│   │       ├── CoverPage.tsx        # 표지
│   │       ├── ExecutiveSummaryPage.tsx  # 요약
│   │       ├── DiagnosticsPage.tsx  # 기업 진단
│   │       ├── RiskAnalysisPage.tsx # 위험 분석
│   │       ├── ExecutionAgencyPage.tsx  # 집행 기관
│   │       ├── TimelinePage.tsx     # 진행 일정
│   │       ├── ConclusionPage.tsx   # 결론
│   │       └── ThankYouPage.tsx     # 감사 페이지
│   ├── contexts/
│   │   └── AuthContext.tsx     # Firebase 인증 상태
│   ├── lib/
│   │   ├── firebase.ts         # Firebase 설정
│   │   ├── firestore.ts        # Firestore CRUD 함수
│   │   └── kpi.ts              # KPI 계산 유틸리티
│   ├── pages/
│   │   ├── Dashboard.tsx       # 메인 대시보드
│   │   ├── Holidays.tsx        # 공휴일 관리 페이지
│   │   ├── Login.tsx           # 로그인 페이지
│   │   ├── Settings.tsx        # 설정 페이지
│   │   └── Teams.tsx           # 팀 관리 페이지
│   └── App.tsx                 # 앱 진입점
shared/
└── types.ts                    # 공유 타입 정의
server/
└── ...                         # Express 서버
```

## 주요 기능

### 1. 권한 기반 접근 제어 (RBAC)
- **staff**: 본인 담당 고객만 조회/수정, 개인 TO-DO 관리
- **team_leader**: 팀 전체 데이터 조회, 팀원 TO-DO 할당
- **super_admin**: 모든 데이터 관리, 팀/공휴일 설정, 수수료율 열람

### 2. 고객 관리
- 고유 ID: YYMMDD-XXX 형식 (예: 241209-001)
- 6단계 영업 퍼널: 상담 → 서류 → 심사 → 계약 → 집행 (+ 드롭아웃)
- 상태 변경 이력 추적

### 3. KPI 시스템
- 영업일 기준 계산 (주말/공휴일 제외)
- 예상 계약 건수: (현재 계약 / 경과 영업일) × 월 전체 영업일
- 예상 매출액: (현재 매출 / 경과 영업일) × 월 전체 영업일

### 4. TO-DO 관리
- 팀장/관리자가 팀원에게 할 일 할당
- 고객 연결 기능
- 마감일 기반 우선순위 표시

### 5. 금융 분석 대시보드
- 고객 상세 모달에 3-탭 시스템 적용
  - **서류 보기**: 문서 업로드/뷰어, 드래그 앤 드롭 지원
  - **금융 분석**: 대출/보증 채무 테이블, 7일 연계 감지, 인라인 편집
  - **심사 요약**: Recharts 파이차트, DTI KPI, 적격성 요인 표시
- 금융 채무 데이터 타입: FinancialObligation (shared/types.ts)
- 채무 총액 자동 계산 및 기관별 분포 시각화

### 6. 정산 관리 시스템 (super_admin 전용)
- **접근 권한**: super_admin 사용자만 사이드바에서 '정산관리' 메뉴 접근 가능
- **수당 계산 로직**:
  - 총수익 = 계약금 + (집행금액 × 자문료율%)
  - 직원수당 = 총수익 × 직원별 수당률% (유입경로별 차등)
  - 세후실지급액 = 세전수당 × 0.967 (3.3% 원천세 공제)
- **유입경로별 수당률**: 광고, 고객소개, 승인복제, 외주 (staff.commissionRates 참조)
- **취소 및 환수 로직**:
  - 당월 취소: 정산 합계에서 제외
  - 과거월 취소: 현재 월에 마이너스(-) 환수 항목 자동 생성
- **UI 구성**:
  - Dashboard: 이번 달 정산 요약 (계약 건수, 세전수당, 환수, 최종지급액)
  - Table: 직원별/상세 정산 내역 (업체, 직원, 유입경로, 수당률, 세전/세후, 상태)
  - Modal: 카드 또는 행 더블클릭 시 상세 리스트 열람
- **데이터 타입**: SettlementItem, MonthlySettlementSummary (shared/types.ts)
- **Firestore 컬렉션**: settlements

### 7. 연차 관리 시스템 (2단계 승인)
- **2단계 승인 워크플로우**:
  - 1단계: 팀장(team_leader) 승인
  - 2단계: 총관리자(super_admin) 최종 승인
- **연차 유형**: 전일(1.0일), 오전 반차(0.5일), 오후 반차(0.5일)
- **공휴일 연동**: 한국천문연구원 공휴일 API 연동 (fallback 데이터 포함)
- **달력 인터페이스**: 월별 달력에서 직접 날짜 클릭하여 신청
- **자동 잔여일 계산**: 총연차, 사용연차, 잔여연차 자동 계산
- **승인 취소 기능**: super_admin만 승인완료된 연차 취소 가능, 잔여일 자동 복원
- **데이터 타입**: LeaveRequest, InsertLeaveRequest, LeaveSummary (shared/types.ts)
- **Firestore 컬렉션**: leave_requests
- **UI 탭**:
  - 내 신청 내역: 본인 연차 신청 목록
  - 승인 대기: 팀장/관리자용 승인 대기 목록
  - 전체 내역: super_admin용 전체 연차 내역 (승인 취소 버튼 포함)

## 환경 변수 (Secrets)
- `VITE_FIREBASE_API_KEY`: Firebase API 키
- `VITE_FIREBASE_PROJECT_ID`: Firebase 프로젝트 ID
- `VITE_FIREBASE_APP_ID`: Firebase 앱 ID

## Firebase 설정 (필수)
1. Firebase Console에서 프로젝트 생성
2. Authentication > Google 로그인 활성화
3. Firestore Database 생성
4. 보안 규칙 설정 필요

## Firestore 컬렉션
- `users`: 사용자 정보 (commissionRates 필드에 유입경로별 수당률 포함)
- `teams`: 팀 정보
- `customers`: 고객 데이터
- `status_logs`: 상태 변경 로그
- `todos`: 할 일 목록
- `holidays`: 공휴일 목록
- `meta`: 메타데이터 (사용자 수 등)
- `settlements`: 정산 데이터 (SettlementItem)
- `consultations`: 랜딩페이지 상담 신청 데이터
- `leave_requests`: 연차 신청 데이터 (LeaveRequest)

## 개발 서버 실행
```bash
npm run dev
```
- 프론트엔드: http://localhost:5000

## 최근 변경사항
- 2026-01-17: 연차 관리 시스템 추가 및 영업일 로직 통일
  - **2단계 승인 워크플로우**: 팀장 1차 승인 → 총관리자 최종 승인
  - **달력 UI**: 월별 달력에서 날짜 클릭 → 신청, 공휴일/주말 비활성화
  - **한국 공휴일 API**: 한국천문연구원 API 연동 + fallback 데이터 (2025-2026)
  - **자동 잔여일 계산**: 최종 승인 시 usedLeave 필드 자동 증가
  - **역할별 탭**: 내 신청/승인 대기/전체 내역 (super_admin 전용)
  - **사이드바 메뉴**: "연차관리" 메뉴 모든 사용자에게 표시
  - **승인 취소 기능**: super_admin 전용, 승인된 연차 취소 시 잔여일 자동 복원
  - **Firebase Rules**: leave_requests 컬렉션 규칙 추가 (취소 상태 전환 포함)
  - **영업일 로직 통일**: KPI 계산에 공공 API 공휴일 데이터 사용 (kpi.ts 업데이트)

- 2026-01-06: 랜딩페이지 상담 신청 자동 연동
  - **LandingPageListener**: consultations 컬렉션 실시간 감지
  - **자동 고객 생성**: 신규 상담 신청 시 customers 컬렉션에 자동 등록
  - **중복 방지 (Upsert)**: 전화번호 기준 기존 고객 존재 시 메모만 추가
  - **데이터 매핑**: 랜딩페이지 필드 → CRM 필드 자동 변환
  - **메모 자동 생성**: 상담 신청 요약 메모 counseling_logs에 저장
  - **Consultation 타입 업데이트**: 신규/레거시 데이터 형식 모두 지원

- 2026-01-04: 정산 관리 시스템 추가
  - **정산관리 페이지**: super_admin 전용 사이드바 메뉴 추가
  - **수당 계산**: 총수익, 세전수당, 원천세(3.3%), 세후실지급액 자동 계산
  - **환수 로직**: 과거 정산월 취소 시 현재 월에 마이너스 환수 항목 생성
  - **직원별 요약**: 월별 정산 현황 테이블 (계약 건수, 수익, 수당, 환수, 최종지급)
  - **상세 내역**: 개별 정산 항목 테이블 (취소 버튼 포함)
  - **모달 상세 보기**: 카드/행 더블클릭 시 해당 항목 리스트 표시

- 2024-12-31: 정책자금 제안서 시스템 추가
  - **8페이지 전문 제안서 생성**: 고객 데이터 기반 맞춤형 제안서 자동 생성
    - CoverPage: 표지
    - ExecutiveSummaryPage: 요약 (신용점수, 위험 수준, 핵심 발견사항)
    - DiagnosticsPage: 기업 진단 (기본 정보, 매출 추이, 성장률)
    - RiskAnalysisPage: 위험 분석 (부채 구조, 신용등급, DTI)
    - ExecutionAgencyPage: 추천 집행 기관 (금융기관 목록, 한도, 금리)
    - TimelinePage: 진행 일정
    - ConclusionPage: 결론 및 연락처
    - ThankYouPage: 감사 페이지
  - **ProposalModal**: 희망 조달 금액, 추천 기관(기관명/금액/금리/기간) 입력
  - **ProposalPreview**: A4 최적화 미리보기, window.print() PDF 출력
  - 심사 요약 탭 하단에 "제안서 만들기" 버튼 배치
  - 인쇄 CSS: @media print, A4 사이즈, page-break 처리

- 2024-12-30: 신용공여내역 OCR 및 금융 분석 기능 강화
  - **신용공여내역 OCR 추가**: 사업자신용정보공여내역 PDF/이미지에서 대출/보증 데이터 자동 추출
    - 단위 변환 지원 (천원 → 원)
    - 금융기관명 가나다순 정렬
    - 중복 데이터 자동 병합
  - **보증 연계 표시**: 대출과 보증이 7일 이내 + 동일 기관(또는 유사 금액)일 때 '보증' 배지 표시
  - **12개월 발생 추이 차트**: ReviewSummaryTab에 scatter chart로 월별 대출/보증 발생 추이 시각화
  - CustomerDetailModal에 3-탭 UI 적용 (서류 보기/금융 분석/심사 요약)
  - FinancialAnalysisTab: 대출/보증 채무 관리, 인라인 편집, 7일 연계 감지
  - ReviewSummaryTab: Recharts 파이차트, DTI 계산, 적격성 요인 그리드
  - 상시 접근 가능한 업로드 버튼 (탭 헤더에 배치)
  - 금융 채무 데이터 자동 저장 (debounced)

- 2024-12-11: 역할 기반 접근 제어 및 변경 이력 로그 기능 추가
  - Staff 사용자 읽기 전용 모드 (모든 입력 필드 비활성화)
  - "읽기 전용" 배지 헤더에 표시 (staff 사용자)
  - 삭제 버튼 및 저장 상태 표시 숨김 (staff 사용자)
  - 상태 변경 시 자동 이력 로그 생성 (customer_history_logs)
  - 담당자 변경 시 자동 이력 로그 생성
  - "변경 이력" 탭 추가 (타임라인 UI)
  - initialTab prop으로 변경 이력 탭 직접 열기 지원

- 2024-12-09: 초기 프로젝트 설정 및 모든 컴포넌트 구현
  - Firebase 인증 (Google Sign-in)
  - 고객 관리 (CRUD + 상태 변경)
  - 퍼널 차트 및 KPI 위젯
  - TO-DO 관리
  - 팀/사용자 관리
  - 공휴일 관리
  - 다크모드 지원

## Firestore 인덱스 (필수)
Firebase Console에서 다음 복합 인덱스를 생성해야 합니다:
- customer_history_logs: customer_id (ASC) + changed_at (DESC)
- consultations: processed (ASC) - 단일 필드 인덱스 (랜딩페이지 리스너용)

## 랜딩페이지 연동 (수동 유입 방식)
- **자동 유입 비활성화**: LandingPageListener는 비활성화되어 있음 (수동 유입으로 전환)
- **수동 유입 버튼**: super_admin 사용자는 대시보드에서 "N건 DB유입" 버튼으로 일괄 처리 가능
- **미처리 판정 기준**: `processed === false` 또는 (`processed` 없고 `linked_customer_id` 없음)
- **처리 로직**: 전화번호로 기존 고객 확인 → 기존 고객이면 메모만 추가, 신규면 고객 생성
- **처리 완료 시**: `processed: true` 설정 및 `linked_customer_id`로 고객 연결
