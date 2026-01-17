# 정책자금 컨설팅 CRM 시스템

## Overview
이 프로젝트는 Firebase를 기반으로 하는 정책자금 컨설팅 CRM 시스템입니다. 고객 관리, 영업 퍼널 추적, KPI 분석, 팀 관리 및 정산/연차 관리 기능을 통합하여 컨설팅 비즈니스의 효율성을 극대화합니다. 핵심 목표는 복잡한 고객 및 영업 데이터를 효율적으로 관리하고, 직관적인 UI를 통해 비즈니스 의사 결정을 지원하며, 컨설턴트와 관리자 모두에게 최적화된 업무 환경을 제공하는 것입니다. 이를 통해 고객 서비스 품질을 향상시키고, 영업 성과를 증대하며, 전반적인 운영 비용을 절감하는 것을 목표로 합니다.

## User Preferences
없음

## System Architecture
**UI/UX 디자인 및 기술 스택:**
- **Frontend**: React, TypeScript, Vite를 사용한 현대적인 SPA.
- **Styling**: Tailwind CSS와 shadcn/ui를 활용하여 일관되고 반응형인 디자인을 구현합니다.
- **Fonts**: UI에는 Inter, 코드에는 JetBrains Mono를 사용하여 가독성을 높였습니다.
- **주요 UI 컴포넌트**: 재사용 가능한 UI 컴포넌트(AppSidebar, CustomerDetailModal, CustomerTable 등)를 모듈화하여 개발 효율성을 높였습니다.
- **다크 모드**: ThemeToggle 컴포넌트를 통해 다크 모드를 지원합니다.
- **제안서 시스템**: 8페이지 전문 제안서 생성 기능을 제공하며, PDF 출력에 최적화된 레이아웃을 구현했습니다.

**기술 구현 및 기능 사양:**
- **인증 및 권한 관리 (RBAC)**: Firebase Auth를 통한 Google Sign-in을 사용하며, `staff`, `team_leader`, `super_admin` 세 가지 역할을 기반으로 한 접근 제어를 구현합니다. 각 역할에 따라 데이터 조회, 수정 및 기능 접근 권한이 세분화됩니다.
- **고객 관리**: 고유 ID 체계를 사용하며, 상담부터 집행까지 6단계의 영업 퍼널을 통해 고객 상태를 추적하고 이력 관리를 수행합니다.
- **KPI 시스템**: 영업일을 기준으로 예상 계약 건수 및 예상 매출액을 계산하여 성과 분석을 지원합니다.
- **TO-DO 관리**: 팀원에게 할 일을 할당하고 고객과 연결하며, 마감일을 기준으로 우선순위를 표시합니다.
- **금융 분석 대시보드**: 고객 상세 모달 내 3-탭 시스템(서류 보기, 금융 분석, 심사 요약)을 통해 고객의 금융 상태를 종합적으로 분석합니다. 대출/보증 채무 관리, 7일 연계 감지, DTI(Debt-to-Income) 계산 및 적격성 요인 분석 기능을 포함합니다. OCR 기술을 활용하여 신용공여내역 자동 추출 및 분석을 지원합니다.
- **정산 관리 시스템**: `super_admin` 전용 기능으로, 총수익, 직원 수당, 세후 실지급액 등을 자동 계산하고, 취소 및 환수 로직을 포함한 상세 정산 내역을 관리합니다.
- **연차 관리 시스템**: 2단계 승인 워크플로우(팀장 승인 → 총관리자 최종 승인)를 따르며, 전일/반차 유형을 지원합니다. 한국천문연구원 공휴일 API와 연동하여 정확한 잔여 연차를 계산하고, 달력 인터페이스를 통해 연차 신청 및 관리를 용이하게 합니다. `super_admin`은 승인된 연차를 취소할 수 있습니다.
- **랜딩페이지 연동**: 랜딩페이지를 통한 상담 신청 데이터를 자동으로 CRM에 연동하여 고객 생성을 자동화하고 중복을 방지합니다. 현재는 수동 유입 방식으로 전환되어, `super_admin`이 미처리 상담을 일괄 처리할 수 있습니다.

**데이터 모델 및 저장소:**
- **데이터베이스**: Firebase Firestore를 메인 데이터베이스로 사용합니다.
- **컬렉션**: `users`, `teams`, `customers`, `status_logs`, `todos`, `holidays`, `meta`, `settlements`, `consultations`, `leave_requests` 등 명확하게 분리된 컬렉션을 통해 데이터를 저장하고 관리합니다.
- **공유 타입**: `shared/types.ts`에서 시스템 전반에 걸쳐 사용되는 데이터 타입을 정의하여 일관성을 유지합니다.
- **보안 규칙**: Firebase Security Rules를 통해 데이터 접근 권한을 세밀하게 제어하여 데이터 보안을 강화합니다.

## External Dependencies
- **Firebase**:
    - **Firestore**: 메인 데이터베이스 및 실시간 데이터 동기화
    - **Authentication**: 사용자 인증 (Google Sign-in)
- **Vite**: 프론트엔드 개발 서버 및 번들러
- **Express.js**: (개발 서버용) 백엔드 로직 처리
- **Tailwind CSS**: 유틸리티 우선 CSS 프레임워크
- **shadcn/ui**: React UI 컴포넌트 라이브러리
- **Recharts**: 금융 분석 대시보드 내 차트 시각화 (파이차트, 스캐터 차트 등)
- **한국천문연구원 공휴일 API**: 연차 관리 시스템에서 한국 공휴일 정보 연동

## Firebase Security Rules (필수)
Firebase Console에서 settlements 컬렉션에 대해 다음 보안 규칙을 설정해야 합니다:

```javascript
match /settlements/{settlementId} {
  // 읽기: 역할별 접근 제어
  // - super_admin: 모든 정산 데이터 조회 가능
  // - team_leader: 본인 팀(team_id)의 정산 데이터만 조회 가능
  // - staff: 본인(manager_id)의 정산 데이터만 조회 가능
  allow read: if request.auth != null && (
    request.auth.token.role == 'super_admin' ||
    (request.auth.token.role == 'team_leader' && resource.data.team_id == request.auth.token.team_id) ||
    (request.auth.token.role == 'staff' && resource.data.manager_id == request.auth.uid)
  );
  // 쓰기: super_admin만 가능
  allow write: if request.auth != null && request.auth.token.role == 'super_admin';
}
```

**중요 (Staff 정산 조회 문제)**:
1. Staff 사용자가 정산 데이터를 조회하려면 위 규칙이 반드시 적용되어야 합니다.
2. Staff 쿼리는 반드시 `manager_id == user.uid` 필터를 포함해야 합니다 (코드에서 이미 적용됨).
3. Firestore 복합 인덱스 (settlement_month + manager_id)가 생성되어 있어야 합니다.
4. 규칙/인덱스 적용 후에도 오류 발생 시, super_admin이 해당 월 정산 페이지에서 "새로고침" 버튼을 클릭하여 정산 데이터를 동기화해야 합니다.

## Firestore 인덱스 (필수)
Firebase Console에서 다음 복합 인덱스를 생성해야 합니다:
- **settlements**: `settlement_month` (ASC) + `manager_id` (ASC) - staff 사용자 정산 조회용
- **settlements**: `settlement_month` (ASC) + `team_id` (ASC) - team_leader 사용자 정산 조회용
- **customer_history_logs**: `customer_id` (ASC) + `changed_at` (DESC)