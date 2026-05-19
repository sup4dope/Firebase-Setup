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
- **정산 관리 시스템**: `super_admin` 전용으로, 총수익, 직원 수당, 세후 실지급액 자동 계산 및 취소/환수 로직 관리. 2026년 4월부터 사대보험 가입자는 131만원 기준 고정 공제(국민연금/건강보험/요양보험/고용보험/소득세/지방세) + 나머지 3.3% 소득공제 이원 적용. 차량소유 여부에 따른 비과세 운전지원금(20만원) 반영. 급여명세서에 사대보험 공제 항목 상세 표시.
- **연차 관리 시스템**: 2단계 승인 워크플로우(팀장 → 총관리자) 및 전일/반차 유형 지원. 한국천문연구원 공휴일 API 연동하여 잔여 연차 계산 및 달력 인터페이스 제공.
- **랜딩페이지 연동**: 랜딩페이지 상담 데이터를 CRM으로 자동 연동하여 고객 생성 및 중복 방지. 현재는 수동 유입 처리 및 `super_admin`의 미처리 상담 일괄 처리 기능 제공.
- **DB 분배 시스템**: 직원별 `db_distribution_enabled`(ON/OFF) 및 `daily_db_limit`(0=무제한)로 제어. 라운드로빈은 **UID 기반**(`meta/assignment_rotation.lastAssignedUid`)으로 동작하여 활성 직원 목록(연차/OFF/퇴사)이 변해도 분배 편향 없음. 모든 날짜 비교는 `getTodayKst()`(KST 기준 YYYY-MM-DD)로 통일. 활성 직원 0명 또는 모든 직원 한도 초과 시 `NoManagerAvailableError`를 throw하여 미배정 고객이 silent하게 생성되는 것을 방지(일괄 처리에서는 보류 카운트로 집계). 일일 한도 카운트는 `customers` 컬렉션의 `manager_id + entry_date` 복합 인덱스 필요.
- **UTM 추적 시스템**: 랜딩페이지 유입 시 `utm_source`, `utm_medium`, `utm_campaign` 파라미터 저장 및 유입 경로 자동 매핑. UTM 기반 유입경로도 정산 시 '광고'와 동일 수당률 적용.
- **외부 스프레드시트 Webhook**: `POST /api/webhook/consultation` 엔드포인트를 통해 구글 스프레드시트 상담 데이터를 실시간 수신하여 Firestore 저장 및 Solapi 알림톡 발송 (중복 방지 로직 포함).
- **광고통계 페이지**: `super_admin` 전용 유입경로별 광고 분석 대시보드 (`/ad-stats`). 유입→상담→계약→집행 전환 퍼널, 쓰레기통·희망타겟 하위 카테고리별 비율, DB 등급 분류 기능 제공.
- **eformsign 전자계약 시스템**: eformsign API v2.0 연동을 통해 전자계약 발송 및 상태 추적. 서버 측 프록시(`server/eformsignService.ts`)를 통한 인증, 템플릿/문서 관리, 상태 조회. 고객 데이터 기반 필드 자동 기입, Webhook을 통한 실시간 상태 업데이트, 고객 상세 모달 내 계약 이력 조회 기능 제공. 계약 유형별 처리 (선불/후불/외주) 및 자동 메모, 금액 동기화, 수동 상태 동기화, 재발송 기능 포함.
- **재분배 풀(공동영업 풀)**: 계약서 발송 또는 결제선생 청구서 발송 후 **14일 경과한 미수납 건**을 전 직원이 픽업하여 마무리하면 자기 DB로 재분배하는 협업 기능. 별도 페이지 없이 Dashboard 상단 "재분배 풀" 버튼(badge=건수, 60초 폴링)으로 모달 진입. **3가지 트리거 소스**: (1) `contracts_eformsign`에서 status가 `발송완료/서명대기/작성완료/수납대기`인 계약, (2) `payments_paymint`에서 state=`W`인 청구서, (3) **소급(legacy)** — `customer.status_code`가 **활성 단계**(희망타겟 미동의류[업력미달/최근대출/인증미동의(국세청·공여내역)/진행기간 미동의/자문료 미동의/계약금미동의(선불·후불)] + 계약서발송완료(*) + 수납대기)인 고객 중 **계약서/청구서 발송 이력이 있는 경우**(`contracts_eformsign` 또는 `payments_paymint`에 customer_id 기록 존재)만 포함. 단, status가 발송 자체를 함의하는 계약서발송완료(*)/수납대기인 경우는 이력 검증 면제(옛 데이터 호환). legacy 트리거 시각은 `status_logs`의 해당 상태 진입 가장 최근 시각을 사용하며, 인덱스 미설정 시 `customer.updated_at→created_at` 폴백. 픽업 시 `customer.temp_assignment`에 `picker_uid/picker_name/picked_at/expires_at(+3일)/original_manager_id/original_manager_name` 저장(트랜잭션 1픽업/고객, 선착순). 임시배정 기간(D-3) 내 수납완료(paymint state=F) 또는 계약완료(후불/외주) 진입 시 `tryConfirmRedistribution`(트랜잭션)이 자동 실행되어 `manager_id`를 picker로 확정 이동하고 `temp_assignment` 클리어, 메모 자동 기록. 글로벌 paymint 폴러의 `syncSingleCustomerSettlement`는 변경된 `manager_id`를 그대로 사용하므로 정산은 새 담당자 100% 적용. 본인 또는 super_admin이 임시배정 해제 가능. 만료된 임시배정은 lazy 정리. 풀 제외 상태: 계약완료/집행완료/터미널(쓰레기통 등). 엔드포인트: `GET /api/redistribution-pool`, `POST /api/redistribution-pool/pickup/:customerId`, `POST /api/redistribution-pool/release/:customerId`. 로그 컬렉션: `redistribution_logs` (pickup/release/confirm). **권장 Firestore 인덱스**: `status_logs` (customer_id ASC, new_status ASC, changed_at DESC) — 없어도 폴백 동작.
- **결제선생(PayMint) 결제 시스템**: PayMint Partner API v2 연동을 통한 카드 결제 청구서 발송 및 자동 수금. `server/paymintService.ts`에서 SHA-256 해시 인증, 청구서 발송/취소/파기/재발송/상태조회/잔액조회 API 구현. 결제 완료 시 콜백(`/api/paymint/callback`)을 통해 자동으로 '계약완료(선불)' 상태 전환 및 메모 기록. 금액 계산: 계약금(만원) × 10,000 × 1.1(VAT 포함). RBAC: 발송은 모든 역할, 취소/파기는 `super_admin`만 가능. `payments_paymint` Firestore 컬렉션에 결제 이력 저장. 전자계약 관리 페이지(`Contracts.tsx`)에 결제 내역 탭 통합. **글로벌 결제 폴러 (App.tsx)**: 모든 페이지에서 30초 간격으로 신규 완료 결제(`state=F`) 감지 → `syncSingleCustomerSettlement` 즉시 호출 → 단일 `paymintPaymentCompleted` CustomEvent 디스패치(payments 배열). Dashboard는 토스트 알림, Settlements는 정산 항목 quiet 새로고침으로 응답. 동기화 실패 시 다음 사이클 자동 재시도(in-flight guard로 중복 폴링 방지). `syncSingleCustomerSettlement` 반환 계약: 정상/비대상 → `true`, 예외 발생 → `false`(폴러 재시도 트리거). 서버 `/api/paymint/payments`는 권한 필터를 limit보다 먼저 적용하여 staff/team_leader가 자기 결제를 누락하지 않도록 함 (team_leader without team_id는 deny-by-default).

**데이터 모델 및 저장소:**
- **데이터베이스**: Firebase Firestore를 메인 데이터베이스로 사용.
- **컬렉션**: `users`, `teams`, `customers`, `status_logs`, `todos`, `holidays`, `meta`, `settlements`, `consultations`, `leave_requests`, `contracts_eformsign`, `payments_paymint`, `redistribution_logs` 등.
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
- **결제선생(PayMint) Partner API v2**: 카드 결제 청구서 발송 및 자동 수금 (SHA-256 해시 인증, PAYMINT_API_KEY, PAYMINT_MEMBER, PAYMINT_MERCHANT 필요).