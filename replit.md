# 정책자금 컨설팅 CRM 시스템

## Overview
이 프로젝트는 정책자금 컨설팅 비즈니스의 효율성을 극대화하기 위한 Firebase 기반의 CRM 시스템입니다. 고객 관리, 영업 퍼널 추적, KPI 분석, 팀 및 정산/연차 관리를 통합하여 복잡한 고객 및 영업 데이터를 효율적으로 관리합니다. 직관적인 UI를 통해 비즈니스 의사 결정을 지원하며, 컨설턴트와 관리자 모두에게 최적화된 업무 환경을 제공하여 고객 서비스 품질 향상, 영업 성과 증대, 운영 비용 절감을 목표로 합니다.

## User Preferences
없음

## System Architecture
**UI/UX 디자인 및 기술 스택:**
- **Frontend**: React, TypeScript, Vite를 사용한 SPA.
- **Styling**: Tailwind CSS와 shadcn/ui를 활용하여 일관되고 반응형 디자인 구현.
- **Fonts**: UI는 Inter, 코드는 JetBrains Mono 사용.
- **주요 UI 컴포넌트**: 재사용 가능한 모듈화된 컴포넌트 (AppSidebar, CustomerDetailModal, CustomerTable 등).
- **다크 모드**: ThemeToggle 컴포넌트를 통해 다크 모드 지원.
- **제안서 시스템**: 8페이지 전문 제안서 생성 및 PDF 출력에 최적화된 레이아웃 제공.

**기술 구현 및 기능 사양:**
- **인증 및 권한 관리 (RBAC)**: Firebase Auth를 통한 Google Sign-in을 사용하며, `staff`, `team_leader`, `super_admin` 세 가지 역할을 기반으로 한 접근 제어 구현.
- **고객 관리**: 고유 ID 체계를 사용하며, 7단계 영업 퍼널(상담→쓰레기통/희망타겟→계약서발송완료→계약완료→서류취합→신청완료→집행완료)을 통해 고객 상태 추적 및 이력 관리. 전자계약 발송 시 유형에 따라 자동 상태 변경. 특정 상태(예약, 이중계약) 처리 로직 포함.
- **KPI 시스템**: 영업일을 기준으로 예상 계약 건수 및 예상 매출액 계산.
- **TO-DO 관리**: 팀원에게 할 일 할당, 고객 연결, 마감일 기준 우선순위 표시.
- **금융 분석 대시보드**: 고객 상세 모달 내 3-탭 시스템(서류 보기, 금융 분석, 심사 요약)을 통한 종합 금융 분석. 대출/보증 채무 관리, 7일 연계 감지, DTI 계산 및 적격성 요인 분석 기능 포함. OCR을 활용한 신용공여내역 자동 추출 및 분석 지원.
- **정산 관리 시스템**: `super_admin` 전용으로, 총수익, 직원 수당, 세후 실지급액 자동 계산 및 취소/환수 로직 관리.
- **연차 관리 시스템**: 2단계 승인 워크플로우(팀장 → 총관리자) 및 전일/반차 유형 지원. 한국천문연구원 공휴일 API 연동하여 잔여 연차 계산 및 달력 인터페이스 제공.
- **랜딩페이지 연동**: 랜딩페이지 상담 데이터를 CRM으로 자동 연동하여 고객 생성 및 중복 방지. 현재는 수동 유입 처리 및 `super_admin`의 미처리 상담 일괄 처리 기능 제공.
- **UTM 추적 시스템**: 랜딩페이지 유입 시 `utm_source`, `utm_medium`, `utm_campaign` 파라미터 저장 및 유입 경로 자동 매핑. UTM 기반 유입경로도 정산 시 '광고'와 동일 수당률 적용.
- **외부 스프레드시트 Webhook**: `POST /api/webhook/consultation` 엔드포인트를 통해 구글 스프레드시트 상담 데이터를 실시간 수신하여 Firestore 저장 및 Solapi 알림톡 발송 (중복 방지 로직 포함).
- **광고통계 페이지**: `super_admin` 전용 유입경로별 광고 분석 대시보드 (`/ad-stats`). 유입→상담→계약→집행 전환 퍼널, 쓰레기통·희망타겟 하위 카테고리별 비율, DB 등급 분류 기능 제공.
- **eformsign 전자계약 시스템**: eformsign API v2.0 연동을 통해 전자계약 발송 및 상태 추적. 서버 측 프록시(`server/eformsignService.ts`)를 통한 인증, 템플릿/문서 관리, 상태 조회. 고객 데이터 기반 필드 자동 기입, Webhook을 통한 실시간 상태 업데이트, 고객 상세 모달 내 계약 이력 조회 기능 제공. 계약 유형별 처리 (선불/후불/외주) 및 자동 메모, 금액 동기화, 수동 상태 동기화, 재발송 기능 포함.

**데이터 모델 및 저장소:**
- **데이터베이스**: Firebase Firestore를 메인 데이터베이스로 사용.
- **컬렉션**: `users`, `teams`, `customers`, `status_logs`, `todos`, `holidays`, `meta`, `settlements`, `consultations`, `leave_requests`, `contracts_eformsign` 등.
- **공유 타입**: `shared/types.ts`에서 시스템 전반의 데이터 타입 정의.
- **보안 규칙**: Firebase Security Rules를 통해 데이터 접근 권한 제어.
- **Firestore 인덱스**: `settlements`, `customers`, `customer_history_logs`, `contracts_eformsign` 컬렉션에 대한 복합 인덱스 필수 설정.

## External Dependencies
- **Firebase**: Firestore (메인 DB), Authentication (Google Sign-in).
- **Vite**: 프론트엔드 개발 서버 및 번들러.
- **Express.js**: 백엔드 로직 처리 (개발 서버용).
- **Tailwind CSS**: 유틸리티 우선 CSS 프레임워크.
- **shadcn/ui**: React UI 컴포넌트 라이브러리.
- **Recharts**: 금융 분석 대시보드 내 차트 시각화.
- **한국천문연구원 공휴일 API**: 연차 관리 시스템에서 한국 공휴일 정보 연동.
- **eformsign API v2.0**: 전자계약 발송 및 상태 추적 (SHA256withECDSA 인증, API Key, Secret Key, Company ID 필요).