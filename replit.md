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
│   │   └── TodoList.tsx        # 할 일 목록
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

### 5. 금융 분석 대시보드 (신규)
- 고객 상세 모달에 3-탭 시스템 적용
  - **서류 보기**: 문서 업로드/뷰어, 드래그 앤 드롭 지원
  - **금융 분석**: 대출/보증 채무 테이블, 7일 연계 감지, 인라인 편집
  - **심사 요약**: Recharts 파이차트, DTI KPI, 적격성 요인 표시
- 금융 채무 데이터 타입: FinancialObligation (shared/types.ts)
- 채무 총액 자동 계산 및 기관별 분포 시각화

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
- `users`: 사용자 정보
- `teams`: 팀 정보
- `customers`: 고객 데이터
- `status_logs`: 상태 변경 로그
- `todos`: 할 일 목록
- `holidays`: 공휴일 목록
- `meta`: 메타데이터 (사용자 수 등)

## 개발 서버 실행
```bash
npm run dev
```
- 프론트엔드: http://localhost:5000

## 최근 변경사항
- 2024-12-31: 정책자금 조달 보고서 PDF 생성 기능 추가
  - **5페이지 정식 보고서**: html2canvas + jspdf 활용
    - 1페이지: 표지 (상호명, 100% 환불 보장 강조)
    - 2페이지: 기업 현황 진단 (OCR 데이터 테이블, 3개년 매출 막대 그래프)
    - 3페이지: 금융 부채 및 DTI 분석 (원형 차트, DTI 안전/주의/위험 진단)
    - 4페이지: 맞춤형 조달 전략 (조건부 로직: 신용 800점 미만 또는 2금융권 보유 시 리스크 전략)
    - 5페이지: 결론 및 제언 (전문가 vs 셀프 비교표, 6개월 재신청 금지 리스크, 7일 유효기간)
  - **미리보기 모달**: PolicyReportModal 컴포넌트, 페이지 네비게이션, PDF 다운로드 버튼
  - **심사 요약 탭 하단**: "제안서 미리보기" 버튼 배치
  - 회사 로고 삽입: attached_assets/white_logo_garo, white_logo_sero

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
