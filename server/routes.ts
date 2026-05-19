import type { Express } from "express";
import { createServer, type Server } from "http";
import admin from 'firebase-admin';
import { storage } from "./storage";
import { extractBusinessRegistrationFromBase64, extractVatCertificateFromBase64, extractCreditReportFromBase64 } from "./geminiOCR";
import { setUserCustomClaims, syncAllUserClaims, getUserCustomClaims, requireAuth, requireSuperAdmin, getAdminApp, type AuthenticatedRequest } from "./firebaseAdmin";
import { sendConsultationAlimtalk, sendBulkDelayAlimtalk, sendAssignmentAlimtalk, sendBusinessCardAlimtalk, sendLongAbsenceAlimtalk, getBranchFromRegion, checkSolapiConfig } from "./solapiService";
import { getTemplates, getTemplateDetail, createDocument, getDocument, getDocuments, downloadDocument, checkEformsignConfig, mapEformsignStatus, extractEformsignStatus, cancelDocument, getDocumentReadStatus, resendDocument } from "./eformsignService";
import { sendBill, cancelBill, destroyBill, readBill, resendBill, getBalance, checkPaymintConfig, getPaymintStateLabel, type ApprovalCallbackData } from "./paymintService";
import { streamChat, buildSystemPrompt, summarizeCustomer, checkAiConfig, loadGongmunContext, trimHistory, predictFunding, type ChatMessage } from "./aiService";

const FieldValue = admin.firestore.FieldValue;

type ContractType = 'pre' | 'post' | 'out';

function detectContractType(templateName: string): ContractType {
  const name = templateName.toLowerCase();
  if (name.includes('(out)') || name.includes('(out)')) return 'out';
  if (name.includes('(post)') || name.includes('(post)')) return 'post';
  return 'pre';
}

function getContractStatusByType(contractType: ContractType): string {
  switch (contractType) {
    case 'post': return '계약완료(후불)';
    case 'out': return '계약완료(외주)';
    default: return '수납대기';
  }
}

function getContractSentStatusByType(contractType: ContractType): string {
  switch (contractType) {
    case 'post': return '계약서발송완료(후불)';
    case 'out': return '계약서발송완료(외주)';
    default: return '계약서발송완료(선불)';
  }
}

function getContractTypeLabel(contractType: ContractType): string {
  switch (contractType) {
    case 'post': return '후불계약';
    case 'out': return '외주계약';
    default: return '선불계약';
  }
}

// ─── 재분배 풀 (공동영업 풀) ──────────────────────────────────────────────────
// 계약서 발송 또는 결제선생 청구서 발송 후 14일 경과한 미수납 건을 모든 직원이
// 픽업하여 마무리할 수 있도록 한다. 픽업은 '임시배정' 형태로 3일간 잠금되며,
// 해당 기간 내 수납완료/계약완료 발생 시 manager_id를 임시배정자로 확정 이동.
const REDISTRIBUTION_TRIGGER_DAYS = 14;
const TEMP_ASSIGNMENT_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

async function tryConfirmRedistribution(
  firestore: FirebaseFirestore.Firestore,
  customerId: string,
  now: Date,
  sourceLabel: string
): Promise<{ confirmed: boolean; pickerName?: string; originalManagerName?: string }> {
  try {
    const customerRef = firestore.collection('customers').doc(customerId);

    // 트랜잭션으로 temp_assignment 읽기 → manager_id 교체를 원자적으로 처리
    // (동시 pickup/release/콜백 중복 호출 시 데이터 정합성 보장)
    const result = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(customerRef);
      if (!snap.exists) return { kind: 'no_customer' as const };
      const cd = snap.data() as any;
      const ta = cd.temp_assignment;
      if (!ta || !ta.picker_uid) return { kind: 'no_assignment' as const };

      // 만료된 임시배정 → 확정 불가, 트랜잭션 내에서 cleanup만
      const expiresAt = ta.expires_at ? Date.parse(String(ta.expires_at)) : 0;
      if (!expiresAt || expiresAt < now.getTime()) {
        tx.update(customerRef, { temp_assignment: FieldValue.delete() });
        return { kind: 'expired_cleanup' as const };
      }
      // 이미 본인 담당이면 의미 없음 (cleanup만)
      if (ta.picker_uid === cd.manager_id) {
        tx.update(customerRef, { temp_assignment: FieldValue.delete() });
        return { kind: 'self_cleanup' as const };
      }

      const originalManagerName = cd.manager_name || ta.original_manager_name || '(미지정)';
      const originalManagerId = cd.manager_id || ta.original_manager_id || '';
      const memoContent = `[재분배 확정] 원담당자: ${originalManagerName} → 새 담당자: ${ta.picker_name} (트리거: ${sourceLabel})`;
      const memoEntry = {
        content: memoContent,
        author_id: 'system',
        author_name: '시스템(재분배)',
        created_at: now.toISOString(),
      };

      tx.update(customerRef, {
        manager_id: ta.picker_uid,
        manager_name: ta.picker_name,
        temp_assignment: FieldValue.delete(),
        memo_history: FieldValue.arrayUnion(memoEntry),
        recent_memo: memoContent,
        latest_memo: memoContent,
        last_memo_date: now.toISOString(),
        updated_at: now.toISOString(),
      });

      return {
        kind: 'confirmed' as const,
        pickerUid: ta.picker_uid,
        pickerName: ta.picker_name,
        originalManagerId,
        originalManagerName,
        pickedAt: ta.picked_at || '',
        customerName: cd.name || cd.company_name || '',
      };
    });

    if (result.kind !== 'confirmed') {
      return { confirmed: false };
    }

    // 트랜잭션 밖에서 로그 add (실패해도 본 작업에 영향 X)
    await firestore.collection('redistribution_logs').add({
      customer_id: customerId,
      customer_name: result.customerName,
      action: 'confirm',
      source: sourceLabel,
      original_manager_id: result.originalManagerId,
      original_manager_name: result.originalManagerName,
      new_manager_id: result.pickerUid,
      new_manager_name: result.pickerName,
      picked_at: result.pickedAt,
      confirmed_at: now.toISOString(),
    });

    console.log(`[Redistribution] 확정: customer=${customerId}, ${result.originalManagerName} → ${result.pickerName} (${sourceLabel})`);
    return { confirmed: true, pickerName: result.pickerName, originalManagerName: result.originalManagerName };
  } catch (err: any) {
    console.error(`[Redistribution] tryConfirmRedistribution 실패 (customer=${customerId}):`, err?.message || err);
    return { confirmed: false };
  }
}

function numberToKorean(num: number): string {
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const smallUnits = ['', '십', '백', '천'];
  const bigUnits = ['', '만', '억', '조'];
  if (num === 0) return '영';
  let result = '';
  let unitIndex = 0;
  while (num > 0) {
    const chunk = num % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let temp = chunk;
      for (let i = 0; i < 4 && temp > 0; i++) {
        const digit = temp % 10;
        if (digit > 0) {
          const digitStr = (i > 0 && digit === 1) ? '' : digits[digit];
          chunkStr = digitStr + smallUnits[i] + chunkStr;
        }
        temp = Math.floor(temp / 10);
      }
      result = chunkStr + bigUnits[unitIndex] + result;
    }
    num = Math.floor(num / 10000);
    unitIndex++;
  }
  return result;
}

function formatContractAmountServer(manWon: number): string {
  const won = manWon * 10000;
  const formatted = won.toLocaleString('ko-KR');
  const korean = numberToKorean(won);
  return `${formatted} (금 ${korean} 원)`;
}

// ============================================================
// ML 학습/추론 공유: financial_obligations 파생 피처 계산기
// — train/serve skew 영구 차단을 위해 ml-export · /api/customer/:id 양쪽에서 동일 함수 사용
// — 단위 정책: balance(원), duration(일), ratio(unitless)
// — 결측 표현: 산출 불가 시 null (모델 측에서 missing으로 일관 처리)
// ============================================================
export function computeObligationDerived(c: any): {
  total_loan_balance: number;
  total_guarantee_balance: number;
  financial_obligations_count: number;
  financial_institution_count: number;
  loans_within_7days_count: number;
  nearest_maturity_days: number | null;
  debt_to_sales_ratio: number | null;
} {
  const obligations: any[] = Array.isArray(c?.financial_obligations) ? c.financial_obligations : [];
  const total_loan_balance = obligations
    .filter(o => o?.type === 'loan')
    .reduce((sum, o) => sum + (Number(o?.balance) || 0), 0);
  const total_guarantee_balance = obligations
    .filter(o => o?.type === 'guarantee')
    .reduce((sum, o) => sum + (Number(o?.balance) || 0), 0);
  const institutionSet = new Set(
    obligations.map(o => String(o?.institution ?? '').trim()).filter(Boolean)
  );
  const occurredMs = obligations
    .map(o => o?.occurred_at)
    .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map(d => new Date(d + 'T00:00:00+09:00').getTime());
  // 본인 제외, 7일 이내 다른 채무가 1건 이상 있는 obligation 건수 (다중채무 burst)
  const SEVEN_DAYS_MS = 7 * 86400000;
  let loans_within_7days_count = 0;
  for (let i = 0; i < occurredMs.length; i++) {
    for (let j = 0; j < occurredMs.length; j++) {
      if (i === j) continue;
      if (Math.abs(occurredMs[i] - occurredMs[j]) <= SEVEN_DAYS_MS) {
        loans_within_7days_count++;
        break;
      }
    }
  }
  // KST 오늘 자정 기준 — 가장 가까운 미래 만기까지 잔여일
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600000);
  const ymd = kst.toISOString().slice(0, 10);
  const kstTodayStartMs = new Date(ymd + 'T00:00:00+09:00').getTime();
  const futureMaturities = obligations
    .map(o => o?.maturity_date)
    .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map(d => new Date(d + 'T00:00:00+09:00').getTime())
    .filter(t => t >= kstTodayStartMs);
  const nearest_maturity_days = futureMaturities.length > 0
    ? Math.round((Math.min(...futureMaturities) - kstTodayStartMs) / 86400000)
    : null;
  // 매출 대비 총채무 비율 — sales_y1 누락/0/음수 → null
  const salesY1 = Number(c?.sales_y1);
  const debt_to_sales_ratio: number | null = (Number.isFinite(salesY1) && salesY1 > 0)
    ? (total_loan_balance + total_guarantee_balance) / (salesY1 * 1e8)
    : null;
  return {
    total_loan_balance,
    total_guarantee_balance,
    financial_obligations_count: obligations.length,
    financial_institution_count: institutionSet.size,
    loans_within_7days_count,
    nearest_maturity_days,
    debt_to_sales_ratio,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ============================================================
  // 외부 자격판정 시스템용 고객 단건 조회 API
  // 인증: x-api-key 헤더 (env CUSTOMER_API_KEY) 또는 Firebase ID 토큰(requireAuth)
  // 응답: 자격판정에 필요한 최소 필드만 정규화하여 반환
  // ============================================================
  app.get("/api/customer/:id", async (req: AuthenticatedRequest, res) => {
    try {
      const customerId = req.params.id;
      if (!customerId) {
        return res.status(400).json({ success: false, error: "customer id가 필요합니다." });
      }

      // 인증: API 키 우선, 없으면 Firebase ID 토큰 검증
      const expectedKey = process.env.CUSTOMER_API_KEY;
      const providedKey = req.header('x-api-key') || (req.query.api_key as string | undefined);
      let authorized = false;

      if (expectedKey && providedKey && providedKey === expectedKey) {
        authorized = true;
      } else {
        const authHeader = req.header('authorization') || '';
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match) {
          try {
            const decoded = await getAdminApp().auth().verifyIdToken(match[1]);
            req.user = decoded as any;
            authorized = true;
          } catch {
            // fallthrough
          }
        }
      }

      if (!authorized) {
        return res.status(401).json({ success: false, error: "인증 실패: x-api-key 또는 Bearer 토큰이 필요합니다." });
      }

      const adminApp = getAdminApp();
      const docSnap = await adminApp.firestore().collection('customers').doc(customerId).get();
      if (!docSnap.exists) {
        return res.status(404).json({ success: false, error: "해당 ID의 고객을 찾을 수 없습니다." });
      }
      const c = docSnap.data() as any;

      // ─ 사업자형태 추론: 사업자등록번호 4-5번째 자리(법인구분코드)
      //   81/82/83/84/85/86/87/88 → 법인, 그 외 숫자 → 개인
      const brnDigits = String(c.business_registration_number || '').replace(/\D/g, '');
      let businessForm: '개인' | '법인' | null = null;
      if (brnDigits.length === 10) {
        const code = brnDigits.substring(3, 5);
        const corporateCodes = new Set(['81', '82', '83', '84', '85', '86', '87', '88']);
        businessForm = corporateCodes.has(code) ? '법인' : '개인';
      }

      // ─ 대표자 생년월일 추론: 주민등록번호(앞6+뒤7) 기반
      //   뒤 첫 자리: 1,2,5,6 → 1900년대 / 3,4,7,8 → 2000년대 / 9,0 → 1800년대
      let representativeBirthdate: string | null = null;
      const ssnFront = String(c.ssn_front || '').replace(/\D/g, '');
      const ssnBackFirst = String(c.ssn_back || '').replace(/\D/g, '').charAt(0);
      if (ssnFront.length === 6 && ssnBackFirst) {
        const yy = ssnFront.substring(0, 2);
        const mm = ssnFront.substring(2, 4);
        const dd = ssnFront.substring(4, 6);
        let century: string | null = null;
        if (['1', '2', '5', '6'].includes(ssnBackFirst)) century = '19';
        else if (['3', '4', '7', '8'].includes(ssnBackFirst)) century = '20';
        else if (['9', '0'].includes(ssnBackFirst)) century = '18';
        if (century) representativeBirthdate = `${century}${yy}-${mm}-${dd}`;
      }

      // ─ 매출액(억원 단위로 저장) → 원 단위로 변환
      const okrwToWon = (v: unknown): number | null => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        if (!isFinite(n)) return null;
        return Math.round(n * 100_000_000);
      };

      // ML 추론 파이프라인용 채무 파생 피처 (ml-export와 동일 함수 — train/serve skew 차단)
      const obligationDerived = computeObligationDerived(c);

      const payload = {
        customer_id: docSnap.id,
        readable_id: c.readable_id ?? null,
        company_name: c.company_name ?? null,
        business_registration_number: c.business_registration_number ?? null,
        business_type: c.business_type ?? c.industry ?? null,           // 업종명
        founding_date: c.founding_date ?? null,                          // 개업일 (YYYY-MM-DD)
        business_form: businessForm,                                     // '개인' | '법인' | null
        credit_score: typeof c.credit_score === 'number' ? c.credit_score : null, // NICE NCB
        representative_name: c.name ?? null,
        representative_birthdate: representativeBirthdate,               // YYYY-MM-DD | null
        sales_prev_year_won: okrwToWon(c.sales_y1),                      // 직전년도 매출액 (원)
        sales_two_years_ago_won: okrwToWon(c.sales_y2),                  // 전전년도 매출액 (원)
        // ───── ML 학습 매퍼와 공유되는 파생 피처 (단위: 잔액=원, 비율=unitless, 일수=days) ─────
        ...obligationDerived,
        // 참고용 원본 값(억원 단위) — 매핑 검증 편의를 위해 함께 제공
        _raw: {
          sales_y1_okrw: c.sales_y1 ?? null,
          sales_y2_okrw: c.sales_y2 ?? null,
          ssn_front: c.ssn_front ?? null,
        },
      };

      res.setHeader('X-ML-Schema-Version', 'v2.2-2026-05-18');

      res.json({ success: true, data: payload });
    } catch (error: any) {
      console.error("[/api/customer/:id] 조회 실패:", error?.message);
      res.status(500).json({ success: false, error: error?.message || '서버 오류' });
    }
  });

  // ============================================================
  // 자격판정(Diagnose) 외부 시스템 프록시
  // - 외부 URL/키를 클라이언트에 노출하지 않기 위해 서버에서 중계
  // - 임시 URL은 env DIAGNOSE_API_BASE로 주입(없으면 기본값 사용)
  // ============================================================
  const DIAGNOSE_API_BASE_DEFAULT = "https://trembl-lasting-halo-mortgage.trycloudflare.com";
  const getDiagnoseBase = () => (process.env.DIAGNOSE_API_BASE || DIAGNOSE_API_BASE_DEFAULT).replace(/\/$/, "");
  const getDiagnoseHeaders = (extra?: Record<string, string>) => {
    const h: Record<string, string> = { Accept: "application/json", ...(extra || {}) };
    if (process.env.DIAGNOSE_API_KEY) h["x-api-key"] = process.env.DIAGNOSE_API_KEY;
    return h;
  };

  app.get("/api/diagnose/:customerId", requireAuth, async (req: AuthenticatedRequest, res) => {
    const customerId = req.params.customerId;
    if (!customerId) return res.status(400).json({ success: false, error: "customerId가 필요합니다." });
    try {
      // 역질문 답변 등 클라이언트 쿼리스트링을 그대로 자격판정 API에 전달
      // (배열/객체 파라미터는 제외하고 flat string만 통과)
      const flatQuery: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.query || {})) {
        if (typeof v === "string") flatQuery[k] = v;
      }
      const qs = new URLSearchParams(flatQuery).toString();
      const url = `${getDiagnoseBase()}/diagnose/${encodeURIComponent(customerId)}${qs ? `?${qs}` : ""}`;
      const upstream = await fetch(url, { method: "GET", headers: getDiagnoseHeaders() });
      const text = await upstream.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      if (!upstream.ok) {
        return res.status(upstream.status).json({ success: false, status: upstream.status, error: body?.error || body?.detail || `자격판정 API 오류 (${upstream.status})`, data: body });
      }
      res.json({ success: true, data: body });
    } catch (error: any) {
      console.error("[/api/diagnose] 호출 실패:", error?.message);
      res.status(502).json({ success: false, error: `자격판정 API 호출 실패: ${error?.message || "unknown"}` });
    }
  });

  // ============================================================
  // ML 한도 예측 프록시 — yieumapi.co.kr/predict/{customer_id}
  // - DIAGNOSE_API_KEY를 클라이언트에 노출하지 않기 위해 서버 중계
  // - 응답: { predictions: [{ org, approval_probability, expected_amount, ... }] }
  // ============================================================
  app.get("/api/ml-predict/:customerId", requireAuth, async (req: AuthenticatedRequest, res) => {
    const customerId = req.params.customerId;
    if (!customerId) return res.status(400).json({ success: false, error: "customerId가 필요합니다." });
    try {
      const base = (process.env.PREDICT_API_BASE || "https://api.yieumapi.co.kr").replace(/\/$/, "");
      const url = `${base}/predict/${encodeURIComponent(customerId)}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (process.env.DIAGNOSE_API_KEY) headers["x-api-key"] = process.env.DIAGNOSE_API_KEY;
      const upstream = await fetch(url, { method: "GET", headers });
      const text = await upstream.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      // ─── 헬퍼: 호출 결과를 ml_predict_logs에 기록 (성공/실패 공통, best-effort) ───
      const writeLog = async (logFields: Record<string, any>): Promise<string | null> => {
        try {
          const adminApp = getAdminApp();
          const dbLog = adminApp.firestore();
          const ref = await dbLog.collection('ml_predict_logs').add({
            customer_id: customerId,
            called_at: new Date().toISOString(),
            called_by_uid: req.user?.uid || null,
            called_by_email: req.user?.email || null,
            model_version: null,
            predicted_top_org: null,
            predicted_prob: null,
            predicted_p50_amount_10k: null,
            predicted_full: null,
            taken_action: null,
            final_status: null,
            final_amount_10k: null,
            error_code: null,
            error_message: null,
            http_status: null,
            ...logFields,
          });
          return ref.id;
        } catch (logErr: any) {
          console.error('[/api/ml-predict] 로그 기록 실패(무시):', logErr?.message);
          return null;
        }
      };

      if (!upstream.ok) {
        // 업스트림 오류도 학습/모니터링용으로 기록 (드리프트·재현성 추적)
        const errCode = body?.error_code || body?.code || `upstream_${upstream.status}`;
        const errMsg = body?.error || body?.detail || body?.message || `예측 API 오류 (${upstream.status})`;
        const failLogId = await writeLog({
          http_status: upstream.status,
          error_code: errCode,
          error_message: errMsg,
          predicted_full: body,
        });
        return res.status(upstream.status).json({
          success: false, status: upstream.status,
          error_code: errCode,
          error: errMsg,
          data: body,
          log_id: failLogId,
        });
      }
      // ─── 정상 응답 로깅 (implicit-feedback용) ───
      // v2.3+ : 업스트림이 top_prediction을 직접 제공 (자금/승인확률/p50_한도_만원/model_version/confidence)
      // 그 외 : fundings/자금 배열에서 승인확률 최댓값으로 fallback
      const predictSchema = upstream.headers.get('x-predict-schema-version') || null;
      const tp = body?.top_prediction || body?.topPrediction || null;
      const fundings = (body?.fundings || body?.자금 || []) as any[];
      const fallbackTop = Array.isArray(fundings) && fundings.length > 0
        ? [...fundings].sort((a, b) =>
            (Number(b?.approval_probability ?? b?.승인확률) || 0) -
            (Number(a?.approval_probability ?? a?.승인확률) || 0)
          )[0]
        : null;
      const top = tp || fallbackTop;
      const topP50Raw = tp?.p50_한도_만원 ?? tp?.p50_amount_10k
        ?? top?.expected_limit ?? top?.p50_amount_10k;
      const expectedObj = top?.예상한도 ?? top?.expected_amount;
      const topP50FromObj = (expectedObj && typeof expectedObj === 'object')
        ? (expectedObj.p50 ?? expectedObj.중앙값 ?? expectedObj.median)
        : (typeof expectedObj === 'number' ? expectedObj : null);
      const logId = await writeLog({
        http_status: upstream.status,
        model_version: tp?.model_version || body?.model_version || body?.meta?.model_version || null,
        predict_schema_version: predictSchema,
        predicted_top_org: tp?.자금 || tp?.funding_name || top?.funding_name || top?.자금 || null,
        predicted_prob: Number(tp?.승인확률 ?? tp?.approval_probability ?? top?.approval_probability ?? top?.승인확률) || null,
        predicted_p50_amount_10k: Number(topP50Raw ?? topP50FromObj) || null,
        predicted_full: body, // raw 응답 보존 (재학습용 ground-truth)
      });
      res.json({ success: true, data: body, log_id: logId });
    } catch (error: any) {
      console.error("[/api/ml-predict] 호출 실패:", error?.message);
      // 네트워크/서버 예외도 로깅 (드리프트·장애 추적)
      try {
        const adminApp = getAdminApp();
        await adminApp.firestore().collection('ml_predict_logs').add({
          customer_id: customerId,
          called_at: new Date().toISOString(),
          called_by_uid: req.user?.uid || null,
          called_by_email: req.user?.email || null,
          http_status: 502,
          error_code: error?.code || 'fetch_failed',
          error_message: error?.message || 'unknown',
          predicted_full: null,
          taken_action: null,
          final_status: null,
          final_amount_10k: null,
        });
      } catch { /* swallow */ }
      res.status(502).json({
        success: false,
        error_code: error?.code || 'fetch_failed',
        error: `예측 API 호출 실패: ${error?.message || "unknown"}`,
      });
    }
  });


  // ============================================================
  // ML 학습용 데이터 export (super_admin 전용, 1회성/주기적 호출)
  // - customers + processing_orgs + settlements 조인
  // - 한 신청 건당 1 레코드, 자금 종류별 분리
  // - 거절/미진행 사유 포함, 신청 시점 스냅샷 우선 사용
  // ============================================================
  // 인증: x-admin-key 헤더 (env ML_EXPORT_API_KEY) 또는 Firebase super_admin 토큰
  const requireMlExportAuth = async (req: any, res: any, next: any) => {
    const expectedKey = process.env.ML_EXPORT_API_KEY;
    const providedKey = req.header('x-admin-key');
    if (expectedKey && providedKey && providedKey === expectedKey) return next();
    // fallback: Firebase ID token + super_admin
    return requireAuth(req, res, () => requireSuperAdmin(req, res, next));
  };

  app.get("/api/admin/ml-export", requireMlExportAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const db = adminApp.firestore();

      // ───── 쿼리 파라미터 ─────
      // limit: 1~5000 (기본: 무제한)
      // cursor: 다음 페이지 시작점 — since 모드에서는 customer doc id, updated_since 모드에서는 ISO timestamp
      // since: YYYY-MM-DD — customers.entry_date >= since (신규 유입 고객만)
      // updated_since: ISO 8601 timestamp (예: 2026-04-01T00:00:00Z) 또는 YYYY-MM-DD
      //   — customers.updated_at >= updated_since (기존 고객의 상태/한도/집행일 등 모든 변경 catch)
      //   주: status_code, processing_orgs, financial_obligations 등 어떤 필드가 바뀌든
      //   customer 문서 저장 시 updated_at이 갱신되어야 정상 동작.
      //   ※ Firestore 복합 인덱스 필요: customers (updated_at ASC, __name__ ASC)
      // stats: 'true' → 레코드 없이 분포 통계만 반환
      const limitParam = req.query.limit ? Math.min(Math.max(Number(req.query.limit), 1), 5000) : null;
      const cursor = (req.query.cursor as string | undefined) || null;
      const sinceStr = (req.query.since as string | undefined) || null;
      const updatedSinceStr = (req.query.updated_since as string | undefined) || null;
      const statsOnly = req.query.stats === 'true';

      // updated_since 파싱 (YYYY-MM-DD 또는 ISO timestamp 모두 허용)
      let updatedSinceDate: Date | null = null;
      if (updatedSinceStr) {
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(updatedSinceStr) ? `${updatedSinceStr}T00:00:00+09:00` : updatedSinceStr);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ success: false, error: 'updated_since 형식 오류 (YYYY-MM-DD 또는 ISO 8601)' });
        }
        updatedSinceDate = d;
      }

      const REJECTION_STATUSES = new Set([
        '단박거절', '매출없음', '신용점수 미달', '차입금초과', '세금체납',
        '재상담', '쓰레기통', '미진행', '거절',
      ]);

      // 통계 모드 — 빠른 분포 집계만 반환
      if (statsOnly) {
        const customersSnap = await db.collection('customers').get();
        const stats = {
          total_customers: customersSnap.size,
          customers_with_orgs: 0,
          total_processing_orgs: 0,
          customers_with_snapshot: 0,
          orgs_with_snapshot: 0,
          orgs_with_applied_amount: 0,
          // 신규 5개 파생 필드 보유 통계 (배포/매퍼 검증용)
          customers_with_loan_balance: 0,
          customers_with_guarantee_balance: 0,
          customers_with_institution_count: 0,
          customers_with_loans_within_7days: 0,
          customers_with_nearest_maturity: 0,
          by_status: {} as Record<string, number>,
          by_org: {} as Record<string, number>,
          by_org_status: {} as Record<string, number>,
          export_schema_version: 'v2.2-2026-05-18',  // 매퍼 버전 (배포 식별용)
          derived_fields: [
            'total_loan_balance', 'total_guarantee_balance',
            'financial_institution_count', 'loans_within_7days_count',
            'nearest_maturity_days', 'debt_to_sales_ratio',
          ],
        };
        customersSnap.forEach((doc: any) => {
          const c = doc.data();
          const orgs = Array.isArray(c.processing_orgs) ? c.processing_orgs : [];
          stats.by_status[c.status_code || '(없음)'] = (stats.by_status[c.status_code || '(없음)'] || 0) + 1;
          if (orgs.length > 0) stats.customers_with_orgs++;
          stats.total_processing_orgs += orgs.length;
          let hasAnySnapshot = false;
          for (const org of orgs) {
            stats.by_org[org.org || '(없음)'] = (stats.by_org[org.org || '(없음)'] || 0) + 1;
            stats.by_org_status[org.status || '(없음)'] = (stats.by_org_status[org.status || '(없음)'] || 0) + 1;
            if (org.snapshot) { stats.orgs_with_snapshot++; hasAnySnapshot = true; }
            if (org.applied_amount != null) stats.orgs_with_applied_amount++;
          }
          if (hasAnySnapshot) stats.customers_with_snapshot++;
          // 채무 파생 필드 보유 여부 (>0 인 고객만 카운트)
          const obs = Array.isArray(c.financial_obligations) ? c.financial_obligations : [];
          const lb = obs.filter((o: any) => o?.type === 'loan').reduce((s: number, o: any) => s + (Number(o?.balance) || 0), 0);
          const gb = obs.filter((o: any) => o?.type === 'guarantee').reduce((s: number, o: any) => s + (Number(o?.balance) || 0), 0);
          const inst = new Set(obs.map((o: any) => String(o?.institution ?? '').trim()).filter(Boolean)).size;
          if (lb > 0) stats.customers_with_loan_balance++;
          if (gb > 0) stats.customers_with_guarantee_balance++;
          if (inst > 0) stats.customers_with_institution_count++;
          if (obs.some((o: any) => typeof o?.maturity_date === 'string')) stats.customers_with_nearest_maturity++;
          // 7일 burst 체크 (간이)
          const dates = obs
            .map((o: any) => o?.occurred_at)
            .filter((d: any) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
            .map((d: string) => new Date(d + 'T00:00:00+09:00').getTime());
          let hasBurst = false;
          for (let i = 0; i < dates.length && !hasBurst; i++) {
            for (let j = 0; j < dates.length; j++) {
              if (i !== j && Math.abs(dates[i] - dates[j]) <= 7 * 86400000) { hasBurst = true; break; }
            }
          }
          if (hasBurst) stats.customers_with_loans_within_7days++;
        });
        res.setHeader('X-ML-Schema-Version', 'v2.2-2026-05-18');
        return res.json({ success: true, exported_at: new Date().toISOString(), stats });
      }

      // settlements 인덱스
      const settlementsSnap = await db.collection('settlements').get();
      const settlementIndex = new Map<string, any[]>();
      settlementsSnap.forEach((doc: any) => {
        const s = doc.data();
        const key = `${s.customer_id || ''}::${s.org_name || ''}`;
        if (!settlementIndex.has(key)) settlementIndex.set(key, []);
        settlementIndex.get(key)!.push({ id: doc.id, ...s });
      });

      // customers 페이지네이션
      // - updated_since 모드: orderBy('updated_at') + cursor=ISO timestamp (재학습용 증분)
      // - since 모드: where('entry_date', '>=') + orderBy('entry_date') + orderBy('__name__') (신규 유입 증분)
      //   ※ Firestore 규칙: 부등호 필터 필드를 반드시 첫 orderBy로 둬야 함
      //   ※ 복합 인덱스 필요: customers (entry_date ASC, __name__ ASC)
      // - 그 외(전체 dump): orderBy('__name__') + cursor=doc id
      let q: FirebaseFirestore.Query;
      let lastUpdatedAt: any = null;
      if (updatedSinceDate) {
        const Timestamp = (await import('firebase-admin/firestore')).Timestamp;
        q = db.collection('customers')
          .where('updated_at', '>=', Timestamp.fromDate(updatedSinceDate))
          .orderBy('updated_at', 'asc')
          .orderBy('__name__', 'asc');
        if (cursor) {
          // cursor 형식: "<ISO timestamp>__<doc_id>"
          const [tsStr, docId] = cursor.split('__');
          const cursorTs = Timestamp.fromDate(new Date(tsStr));
          q = q.startAfter(cursorTs, docId || '');
        }
      } else if (sinceStr) {
        // entry_date 부등호 필터 → entry_date를 첫 orderBy로 강제
        q = db.collection('customers')
          .where('entry_date', '>=', sinceStr)
          .orderBy('entry_date', 'asc')
          .orderBy('__name__', 'asc');
        if (cursor) {
          // cursor 형식: "<entry_date>__<doc_id>"
          const [entryDate, docId] = cursor.split('__');
          q = q.startAfter(entryDate || sinceStr, docId || '');
        }
      } else {
        q = db.collection('customers').orderBy('__name__');
        if (cursor) q = q.startAfter(cursor);
      }
      if (limitParam) q = q.limit(limitParam);

      const customersSnap = await q.get();

      const records: any[] = [];
      let lastCustomerId: string | null = null;
      let lastEntryDate: string | null = null;

      customersSnap.forEach((doc: any) => {
        const c: any = { id: doc.id, ...doc.data() };
        lastCustomerId = doc.id;
        if (updatedSinceDate && c.updated_at) lastUpdatedAt = c.updated_at;
        if (sinceStr && !updatedSinceDate && typeof c.entry_date === 'string') lastEntryDate = c.entry_date;
        const orgs: any[] = Array.isArray(c.processing_orgs) ? c.processing_orgs : [];

        // ───── financial_obligations 파생 피처 (ML 모델용 — 공유 함수 사용) ─────
        // 정의는 computeObligationDerived 참조. /api/customer/:id와 동일 매퍼 = train/serve skew 차단.
        const obligationDerived = computeObligationDerived(c);

        // 현재 프로필 (PII 제외) — 스냅샷 없는 레코드의 fallback용
        const currentProfile = {
          credit_score: c.credit_score ?? null,
          founding_date: c.founding_date ?? null,
          over_7_years: c.over_7_years ?? null,
          business_type: c.business_type ?? null,
          business_item: c.business_item ?? null,
          recent_sales: c.recent_sales ?? null,
          sales_y1: c.sales_y1 ?? null,
          sales_y2: c.sales_y2 ?? null,
          sales_y3: c.sales_y3 ?? null,
          avg_revenue_3y: c.avg_revenue_3y ?? null,
          is_home_owned: c.is_home_owned ?? null,
          is_business_owned: c.is_business_owned ?? null,
          entry_source: c.entry_source ?? null,
          // ───── 채무 관련 파생 피처 (공유 함수 결과 그대로 — train/serve skew 차단) ─────
          ...obligationDerived,
        };

        const isCustomerRejected = REJECTION_STATUSES.has(String(c.status_code || ''));

        if (orgs.length === 0) {
          records.push({
            customer_id: c.id,  // PII 제외 — name/phone/email/ssn/사업자번호 모두 미포함
            신청일자: null,
            자금종류: null,
            현재_프로필: currentProfile,
            신청시점_스냅샷: null,
            신청한도: null,
            승인한도: null,
            결정일자: null,
            집행일자: null,
            상태: isCustomerRejected ? '거절' : (c.status_code || '미진행'),
            거절사유: isCustomerRejected ? c.status_code : (c.rejection_reason ?? null),
            // ─── ML 학습용 분리 라벨 (v2.4) ───
            // 한글/영문 키 병기 (외부 학습 코드 호환). 상담거절사유는 기존 단일값 c.rejection_reason도 fallback 마이그레이션.
            // 상세 사유(c.rejection_reason)가 있으면 우선, 없으면 status_code 라벨로 fallback (정보 손실 방지)
            상담거절사유: isCustomerRejected ? (c.rejection_reason ?? c.status_code ?? null) : (c.rejection_reason ?? null),
            consultation_rejection_reason: isCustomerRejected ? (c.rejection_reason ?? c.status_code ?? null) : (c.rejection_reason ?? null),
            심사부결사유: [], // 신청 전 단계라 심사 부결사유 없음
            rejection_reasons: [],
            재집행여부: null,
            정산_건수: 0,
            entry_date: c.entry_date ?? null,
          });
          return;
        }

        for (const org of orgs) {
          const orgName = org.org;
          const settlements = settlementIndex.get(`${c.id}::${orgName}`) || [];
          const totalSettlementAmount = settlements
            .filter(s => s.status === '정상')
            .reduce((sum, s) => sum + (Number(s.execution_amount) || 0), 0);

          let 상태: string;
          if (org.status === '승인' && org.execution_date) 상태 = '집행완료';
          else if (org.status === '승인') 상태 = '승인(미집행)';
          else if (org.status === '부결') 상태 = '거절';
          else 상태 = '진행중';

          records.push({
            customer_id: c.id,
            신청일자: org.applied_at ?? null,
            자금종류: orgName,
            신청시점_스냅샷: org.snapshot ?? null,
            현재_프로필: currentProfile,
            신청한도: org.applied_amount ?? null,
            승인한도: org.execution_amount ?? null,
            결정일자: org.approved_at ?? org.rejected_at ?? null,
            집행일자: org.execution_date ?? null,
            상태,
            거절사유: org.status === '부결' ? (org.rejection_reason ?? c.status_code ?? null) : null,
            // ─── ML 학습용 분리 라벨 (v2.4) ───
            // 상담거절사유: 신청 전 단계 (상담 단계에서 차단된 케이스). 기존 c.rejection_reason 단일값 fallback 마이그레이션.
            // 심사부결사유: 신청 후 기관 부결 — 멀티라벨 string[] (표준 5종 + 자유 텍스트 혼용)
            // 한글/영문 키 병기 (외부 학습 코드 호환)
            // 상세 사유(c.rejection_reason) 우선, 없으면 status_code 라벨 fallback
            상담거절사유: isCustomerRejected ? (c.rejection_reason ?? c.status_code ?? null) : (c.rejection_reason ?? null),
            consultation_rejection_reason: isCustomerRejected ? (c.rejection_reason ?? c.status_code ?? null) : (c.rejection_reason ?? null),
            심사부결사유: org.status === '부결'
              ? (Array.isArray(org.rejection_reasons) && org.rejection_reasons.length > 0
                  ? org.rejection_reasons
                  : (org.rejection_reason ? [org.rejection_reason] : []))
              : [],
            rejection_reasons: org.status === '부결'
              ? (Array.isArray(org.rejection_reasons) && org.rejection_reasons.length > 0
                  ? org.rejection_reasons
                  : (org.rejection_reason ? [org.rejection_reason] : []))
              : [],
            재집행여부: !!org.is_re_execution,
            정산_건수: settlements.length,
            정산_총집행액: totalSettlementAmount || null,
            entry_date: c.entry_date ?? null,
          });
        }
      });

      // 다음 페이지가 있는지 — limit과 동일하면 더 있을 가능성
      const hasMore = !!(limitParam && customersSnap.size === limitParam);
      let nextCursor: string | null = null;
      if (hasMore) {
        if (updatedSinceDate && lastUpdatedAt) {
          // Firestore Timestamp → ISO + doc id
          const tsIso = typeof lastUpdatedAt.toDate === 'function'
            ? lastUpdatedAt.toDate().toISOString()
            : new Date(lastUpdatedAt).toISOString();
          nextCursor = `${tsIso}__${lastCustomerId}`;
        } else if (sinceStr && lastEntryDate && lastCustomerId) {
          // since 모드 cursor: "<entry_date>__<doc_id>"
          nextCursor = `${lastEntryDate}__${lastCustomerId}`;
        } else {
          nextCursor = lastCustomerId;
        }
      }

      res.setHeader('X-ML-Schema-Version', 'v2.2-2026-05-18');
      res.json({
        success: true,
        exported_at: new Date().toISOString(),
        export_schema_version: 'v2.2-2026-05-18',
        unit_policy: {
          balance: 'KRW',           // financial_obligations.balance, total_loan_balance, total_guarantee_balance
          sales: '100M_KRW',        // sales_y1/y2/y3, recent_sales, avg_revenue_3y (억원)
          amount: '10K_KRW',        // applied_amount, approved_amount, executed_amount (만원)
          duration: 'days',         // nearest_maturity_days
          score: 'NCB_raw',         // credit_score (NCB 원점수)
          ratio: 'unitless',        // debt_to_sales_ratio (예: 0.5 = 매출 대비 채무 50%)
        },
        total_records: records.length,
        page_customers: customersSnap.size,
        mode: updatedSinceDate ? 'updated_since' : (sinceStr ? 'since' : 'full'),
        next_cursor: nextCursor,
        has_more: hasMore,
        records,
      });
    } catch (error: any) {
      console.error('[/api/admin/ml-export] 실패:', error);
      res.status(500).json({ success: false, error: error?.message || 'ml-export 실패' });
    }
  });

  // ============================================================
  // ml_predict_logs — implicit feedback 데이터 (AI팀 주간 pull 대상)
  // GET  /api/admin/predict-logs?since=ISO&limit=N&cursor=...
  // PATCH /api/admin/predict-logs/:id  body: { taken_action?, final_status?, final_amount_10k? }
  // ※ Firestore 인덱스 필요: ml_predict_logs (called_at ASC)
  // ============================================================
  app.get("/api/admin/predict-logs", requireMlExportAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const db = adminApp.firestore();
      const sinceStr = (req.query.since as string | undefined) || null;
      const limit = req.query.limit ? Math.min(Math.max(Number(req.query.limit), 1), 5000) : 1000;
      const cursor = (req.query.cursor as string | undefined) || null;

      // 복합 정렬 (called_at, __name__) — 동일 timestamp 다건도 안정 페이지네이션
      // ※ Firestore 인덱스 필요: ml_predict_logs (called_at ASC, __name__ ASC)
      let q: FirebaseFirestore.Query = db.collection('ml_predict_logs')
        .orderBy('called_at', 'asc')
        .orderBy('__name__', 'asc');
      if (sinceStr) {
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(sinceStr) ? `${sinceStr}T00:00:00+09:00` : sinceStr);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ success: false, error: 'since 형식 오류 (YYYY-MM-DD 또는 ISO 8601)' });
        }
        q = q.where('called_at', '>=', d.toISOString());
      }
      // cursor 형식: "<ISO called_at>__<docId>" (구버전 단일값도 fallback 호환)
      if (cursor) {
        const idx = cursor.lastIndexOf('__');
        if (idx > 0) {
          const cTs = cursor.slice(0, idx);
          const cId = cursor.slice(idx + 2);
          q = q.startAfter(cTs, cId);
        } else {
          q = q.startAfter(cursor);
        }
      }
      q = q.limit(limit);

      const snap = await q.get();
      const records: any[] = [];
      let lastCalledAt: string | null = null;
      let lastDocId: string | null = null;
      snap.forEach(doc => {
        const data = doc.data();
        // 외부 학습 코드가 backfill 행을 split 할 수 있도록 두 키를 항상 명시적으로 노출
        // (Firestore 문서에 필드가 없어도 기본값 채워서 키 존재 보장)
        records.push({
          id: doc.id,
          backfilled: data.backfilled === true,
          predict_schema_version: data.predict_schema_version ?? null,
          ...data,
        });
        if (data.called_at) lastCalledAt = data.called_at;
        lastDocId = doc.id;
      });
      const hasMore = snap.size === limit;
      const nextCursor = hasMore && lastCalledAt && lastDocId
        ? `${lastCalledAt}__${lastDocId}`
        : null;
      res.setHeader('X-ML-Schema-Version', 'v2.2-2026-05-18');
      res.json({
        success: true,
        exported_at: new Date().toISOString(),
        total: records.length,
        next_cursor: nextCursor,
        has_more: hasMore,
        records,
      });
    } catch (error: any) {
      console.error('[/api/admin/predict-logs GET] 실패:', error);
      res.status(500).json({ success: false, error: error?.message || 'predict-logs GET 실패' });
    }
  });

  app.patch("/api/admin/predict-logs/:id", requireMlExportAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ success: false, error: 'id 필요' });
      const allowed = ['taken_action', 'final_status', 'final_amount_10k', 'rejection_reason', 'rejection_reasons'];
      const update: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const k of allowed) {
        if (k in (req.body || {})) update[k] = req.body[k];
      }
      if (Object.keys(update).length === 1) {
        return res.status(400).json({ success: false, error: '업데이트할 필드 없음 (taken_action/final_status/final_amount_10k/rejection_reason/rejection_reasons)' });
      }
      const adminApp = getAdminApp();
      await adminApp.firestore().collection('ml_predict_logs').doc(id).update(update);
      res.json({ success: true, id, updated: update });
    } catch (error: any) {
      console.error('[/api/admin/predict-logs PATCH] 실패:', error);
      res.status(500).json({ success: false, error: error?.message || 'predict-logs PATCH 실패' });
    }
  });

  // ─── 고객별 최신 예측 로그 PATCH (상태 변경 자동 동기화용) ───
  // 같은 고객에 대한 가장 최근 ml_predict_logs 1건을 찾아 업데이트.
  // 사용처: 상태 변경(집행완료/거절)시 final_status·final_amount_10k·rejection_reason 자동 기록.
  // 로그가 없으면 404 (no-op으로 무시 가능).
  // 권한: 일반 인증 유저 허용 (staff/team_leader가 상태 변경할 때 학습 라벨 누락 방지).
  // 필드 화이트리스트로 보호하므로 임의 데이터 주입 위험 없음.
  app.patch("/api/admin/predict-logs/by-customer/:customerId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const customerId = req.params.customerId;
      if (!customerId) return res.status(400).json({ success: false, error: 'customerId 필요' });
      const allowed = ['taken_action', 'final_status', 'final_amount_10k', 'rejection_reason', 'rejection_reasons'];
      const update: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const k of allowed) {
        if (k in (req.body || {})) update[k] = req.body[k];
      }
      if (Object.keys(update).length === 1) {
        return res.status(400).json({ success: false, error: '업데이트할 필드 없음' });
      }
      const adminApp = getAdminApp();
      const dbAdmin = adminApp.firestore();
      // ─── 권한 검증: super_admin은 전체 가능, team_leader는 팀원 고객만,
      //     staff는 본인 담당 고객만. 라벨 데이터 무결성 보호.
      const callerUid = req.user?.uid;
      const callerRole = (req.user?.role || '') as string;
      if (callerRole !== 'super_admin') {
        const custDoc = await dbAdmin.collection('customers').doc(customerId).get();
        if (!custDoc.exists) {
          return res.status(404).json({ success: false, error: '고객 없음' });
        }
        const custData = custDoc.data() as any;
        const managerId = String(custData?.manager_id || '');
        let allowedScope = managerId && callerUid && managerId === callerUid;
        if (!allowedScope && callerRole === 'team_leader' && req.user?.team_id) {
          // 같은 팀의 다른 staff가 담당하는 고객도 허용
          const mgrDoc = managerId ? await dbAdmin.collection('users').doc(managerId).get() : null;
          const mgrTeam = String((mgrDoc?.data() as any)?.team_id || '');
          if (mgrTeam && mgrTeam === req.user.team_id) allowedScope = true;
        }
        if (!allowedScope) {
          return res.status(403).json({ success: false, error: '해당 고객의 ML 로그를 수정할 권한이 없습니다.' });
        }
      }
      // 복합 인덱스(customer_id+called_at) 회피: customer_id 단일 필터로 가져와 메모리 정렬
      // (한 고객의 ml_predict_logs는 보통 매우 적어 부담 없음)
      const snap = await dbAdmin.collection('ml_predict_logs')
        .where('customer_id', '==', customerId)
        .get();
      if (snap.empty) {
        return res.status(404).json({ success: false, error: '해당 고객의 예측 로그 없음', skipped: true });
      }
      const docs = snap.docs.slice().sort((a, b) => {
        const ta = String(a.data()?.called_at || '');
        const tb = String(b.data()?.called_at || '');
        return tb.localeCompare(ta);
      });
      const latestRef = docs[0].ref;
      await latestRef.update(update);
      // ─── 같은 고객의 sibling 미처리 로그 정리(backfill) ───
      // taken_action을 새로 기록할 때, 같은 고객의 다른 미처리 로그(중복 자동호출 산물)도
      // 같은 값으로 채워 unresolved 목록에서 일괄 제거. final_status는 사용자가 명시한 라벨만 보존.
      let siblingsUpdated = 0;
      if ('taken_action' in update && update.taken_action) {
        const writeBatch = dbAdmin.batch();
        for (let i = 1; i < docs.length; i++) {
          const d = docs[i];
          const data = d.data() || {};
          if (!data.taken_action && !data.final_status) {
            writeBatch.update(d.ref, {
              taken_action: update.taken_action,
              updated_at: update.updated_at,
              backfilled_from_latest: true,
            });
            siblingsUpdated++;
          }
        }
        if (siblingsUpdated > 0) await writeBatch.commit();
      }
      res.json({ success: true, id: latestRef.id, updated: update, siblings_updated: siblingsUpdated });
    } catch (error: any) {
      console.error('[/api/admin/predict-logs/by-customer PATCH] 실패:', error);
      res.status(500).json({ success: false, error: error?.message || 'by-customer PATCH 실패' });
    }
  });

  // ─── 예측 로그 일괄 소급 적용 (backfill) ───
  // 기존 집행완료/거절 고객의 ml_predict_logs에 final_status가 비어 있는 것을 채워줌.
  // 사용 시점: 신규 로그 라벨링 도입 직후 (과거 데이터 소급).
  // POST /api/admin/predict-logs/backfill  → { success, scanned, updated, by_status }
  app.post("/api/admin/predict-logs/backfill", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const dbAdmin = adminApp.firestore();
      const REJECT_SET = new Set([
        '단박거절','매출없음','신용점수 미달','차입금초과','세금체납',
        '재상담','쓰레기통','미진행','거절',
      ]);
      // 1) 미라벨링된 ml_predict_logs만 가져오기 (final_status가 null/없는 것)
      const logsSnap = await dbAdmin.collection('ml_predict_logs').get();
      const unlabeled = logsSnap.docs.filter(d => {
        const data = d.data() || {};
        return !data.final_status;
      });
      const byCustomer = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
      for (const doc of unlabeled) {
        const cid = String((doc.data() as any)?.customer_id || '');
        if (!cid) continue;
        if (!byCustomer.has(cid)) byCustomer.set(cid, []);
        byCustomer.get(cid)!.push(doc);
      }
      // 2) 각 고객의 현재 상태 조회 후 소급 적용
      let updated = 0;
      const byStatus: Record<string, number> = { executed: 0, rejected: 0, skipped: 0 };
      const customerIds = Array.from(byCustomer.keys());
      // 고객 문서 병렬 조회 (50개씩 청크, 부하 제어)
      const chunkSize = 50;
      for (let i = 0; i < customerIds.length; i += chunkSize) {
        const chunk = customerIds.slice(i, i + chunkSize);
        const customerDocs = await Promise.all(
          chunk.map(id => dbAdmin.collection('customers').doc(id).get())
        );
        for (const cdoc of customerDocs) {
          if (!cdoc.exists) continue;
          const c = cdoc.data() as any;
          const cid = cdoc.id;
          const status = String(c?.status_code || '');
          const logs = byCustomer.get(cid) || [];
          // 가장 최근 로그 1건만 patch (called_at 내림차순)
          const latest = logs.sort((a, b) => {
            const ta = String(a.data()?.called_at || '');
            const tb = String(b.data()?.called_at || '');
            return tb.localeCompare(ta);
          })[0];
          if (!latest) continue;
          let patch: Record<string, any> | null = null;
          if (status.includes('집행완료')) {
            // approved_amount(만원) 또는 processing_orgs의 execution_amount 합산
            const orgs: any[] = Array.isArray(c?.processing_orgs) ? c.processing_orgs : [];
            const execSum = orgs
              .filter(o => o?.status === '승인' && o?.execution_amount)
              .reduce((s, o) => s + (Number(o.execution_amount) || 0), 0);
            patch = {
              final_status: 'executed',
              final_amount_10k: execSum || Number(c?.approved_amount) || null,
              backfilled: true,
              updated_at: new Date().toISOString(),
            };
            byStatus.executed++;
          } else if (REJECT_SET.has(status)) {
            patch = {
              final_status: 'rejected',
              rejection_reason: status,
              backfilled: true,
              updated_at: new Date().toISOString(),
            };
            byStatus.rejected++;
          } else {
            byStatus.skipped++;
          }
          if (patch) {
            // 이 고객의 모든 미라벨링 로그에 동일 패치 적용 (idempotent — final_status 없는 것만)
            const writes = logs.map(l => l.ref.update(patch!));
            await Promise.all(writes);
            updated += logs.length;
          }
        }
      }
      res.json({ success: true, scanned: unlabeled.length, customers_examined: customerIds.length, updated, by_status: byStatus });
    } catch (error: any) {
      console.error('[/api/admin/predict-logs/backfill] 실패:', error);
      res.status(500).json({ success: false, error: error?.message || 'backfill 실패' });
    }
  });

  // ─── 미처리 예측 로그 카운트 (이번 사용자 본인의 호출 중 final_status가 없는 것) ───
  // GET /api/admin/predict-logs/unresolved-count  → { success, count, items: [{log_id, customer_id, customer_name, called_at}] }
  app.get("/api/admin/predict-logs/unresolved", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ success: false, error: 'auth required' });
      const adminApp = getAdminApp();
      const dbAdmin = adminApp.firestore();
      const snap = await dbAdmin.collection('ml_predict_logs')
        .where('called_by_uid', '==', uid)
        .get();
      // 최근 30일 이내만 (오래된 로그는 노이즈)
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recent = snap.docs.filter(d => {
        const t = Date.parse(String(d.data()?.called_at || ''));
        return !isNaN(t) && t >= cutoff;
      });
      // ★ 고객별 "가장 최근 로그 1건"만 추출 (전체 로그에서)
      //   → 가장 최근 호출의 행동기록이 있으면 그 고객은 처리 완료로 간주.
      //   과거에 처리하지 않은 호출이 있어도 최신 호출이 해결됐으면 무시한다
      //   (재호출=새로운 의사결정 시작으로 본다).
      const byCust = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const doc of recent) {
        const cid = String(doc.data()?.customer_id || '');
        if (!cid) continue;
        const existing = byCust.get(cid);
        if (!existing || String(doc.data()?.called_at) > String(existing.data()?.called_at)) {
          byCust.set(cid, doc);
        }
      }
      // 최신 로그가 여전히 미처리인 고객만 남김
      for (const [cid, doc] of Array.from(byCust.entries())) {
        const data = doc.data() || {};
        if (data.taken_action || data.final_status) {
          byCust.delete(cid);
        }
      }
      // 시간상 최신 순으로 정렬
      const sortedEntries = Array.from(byCust.entries()).sort((a, b) => {
        const ta = String(a[1].data()?.called_at || '');
        const tb = String(b[1].data()?.called_at || '');
        return tb.localeCompare(ta); // DESC
      });
      // 종결 상태(쓰레기통 그룹 + 집행완료/최종부결/민원처리): 명시적 enum 집합 — 부분일치보다 정확
      const TERMINAL_STATUSES = new Set<string>([
        '쓰레기통', '단박거절', '본인아님', '사업자아님', '정부기관 오인',
        '기타자금 오인', '인증불가', '불가업종', '매출없음', '신용점수 미달',
        '차입금초과', '세금체납', '이중계약', '거절사유 미파악', '정체성 의심', '잘못 신청',
        '집행완료', '집행완료(선불)', '집행완료(후불)', '집행완료(외주)', '집행완료(채무조정)',
        '최종부결', '민원처리',
      ]);
      // 종결 필터를 50건 컷 이전에 적용 — 배치(100건)로 fetch, 비종결 50건 모이면 중단
      // (만약 상위 50건 중 다수가 종결이면 그 뒤에 있는 실제 미처리 건이 잘리는 버그 방지)
      const BATCH = 100;
      const TARGET = 50;
      const MAX_SCAN = 500; // 안전 상한

      // ML 예측 필수 필드 검증 (클라이언트 getMissingMlPredictFields와 동일 규칙).
      // 데이터 불완전 고객은 더 이상 예측 불가 → 미처리 목록에서도 제외.
      const isBlank = (v: any) => v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));
      const isZeroOrBlank = (v: any) => isBlank(v) || Number(v) === 0;
      const hasMlRequiredFields = (cdata: any): boolean => {
        if (!cdata) return false;
        if (isBlank(cdata.name)) return false;
        if (isZeroOrBlank(cdata.credit_score)) return false;
        if (isBlank(cdata.ssn_front) || String(cdata.ssn_front).length < 6) return false;
        if (isBlank(cdata.ssn_back) || String(cdata.ssn_back).length < 7) return false;
        if (isBlank(cdata.phone)) return false;
        if (isBlank(cdata.carrier)) return false;
        if (isBlank(cdata.company_name)) return false;
        if (isBlank(cdata.founding_date)) return false;
        if (isBlank(cdata.business_type)) return false;
        if (isBlank(cdata.business_item)) return false;
        if (isBlank(cdata.business_registration_number)) return false;
        if (isBlank(cdata.business_address)) return false;
        if (isZeroOrBlank(cdata.recent_sales) && isZeroOrBlank(cdata.sales_y1)) return false;
        return true;
      };

      const nameMap = new Map<string, string>();
      const acceptedCids: string[] = [];
      let excludedCount = 0;
      let excludedIncomplete = 0;
      let scanned = 0;
      for (let i = 0; i < sortedEntries.length && acceptedCids.length < TARGET && scanned < MAX_SCAN; i += BATCH) {
        const batch = sortedEntries.slice(i, i + BATCH);
        scanned += batch.length;
        const batchCids = batch.map(([cid]) => cid);
        const batchDocs = await Promise.all(batchCids.map(id => dbAdmin.collection('customers').doc(id).get()));
        for (let j = 0; j < batchDocs.length; j++) {
          if (acceptedCids.length >= TARGET) break;
          const cd = batchDocs[j];
          const cid = batchCids[j];
          if (!cd.exists) { excludedCount++; continue; }
          const cdata = cd.data() as any;
          const status = String(cdata?.status_code || '');
          if (TERMINAL_STATUSES.has(status)) { excludedCount++; continue; }
          // 데이터 불완전 고객 제외 — 더 이상 예측 호출 불가하므로 미처리 의미 없음
          if (!hasMlRequiredFields(cdata)) { excludedIncomplete++; continue; }
          nameMap.set(cid, String(cdata?.name || cdata?.company_name || ''));
          acceptedCids.push(cid);
        }
      }
      if (excludedCount > 0 || excludedIncomplete > 0) {
        console.log(`[unresolved] 종결상태 제외: ${excludedCount}건, 필수필드 누락 제외: ${excludedIncomplete}건, 스캔 ${scanned}건, 최종 ${acceptedCids.length}건`);
      }
      const items = acceptedCids.map(cid => {
        const doc = byCust.get(cid)!;
        return {
          log_id: doc.id,
          customer_id: cid,
          customer_name: nameMap.get(cid) || '(고객명 없음)',
          called_at: doc.data()?.called_at || null,
        };
      });
      res.json({ success: true, count: items.length, items });
    } catch (error: any) {
      console.error('[/api/admin/predict-logs/unresolved] 실패:', error);
      res.status(500).json({ success: false, error: error?.message || 'unresolved 조회 실패' });
    }
  });

  // ─── 메모 export (PII 마스킹, ML 견적 학습용) ───
  // GET /api/admin/ml-export-memos?sample=10
  // 응답: { success, count, items: [{customer_id, memos: [{author_name, content_masked, created_at}]}] }
  // PII 마스킹: 전화/주민/사업자번호/한국이름(2~4자) → [MASKED_PHONE]/[MASKED_RRN]/[MASKED_BRN]/[MASKED_NAME]
  app.get("/api/admin/ml-export-memos", requireMlExportAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const sample = req.query.sample ? Math.min(Math.max(Number(req.query.sample), 1), 500) : 10;
      const adminApp = getAdminApp();
      const dbAdmin = adminApp.firestore();
      // 메모가 있는 고객 중 랜덤 샘플
      const allSnap = await dbAdmin.collection('customers').get();
      const withMemos = allSnap.docs.filter(d => {
        const data = d.data() as any;
        return Array.isArray(data?.memo_history) && data.memo_history.length > 0;
      });
      // Fisher-Yates shuffle 후 상위 sample 건
      const arr = withMemos.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      const picked = arr.slice(0, sample);

      // PII 마스킹 함수
      // 1) 전화번호: 010-1234-5678 / 010 1234 5678 / 01012345678
      // 2) 주민번호: 6자리-7자리
      // 3) 사업자번호: 10자리 (123-45-67890)
      // 4) 한국이름: 2~4자 한글 (단, 일반 어휘 보호 위해 호칭 패턴만 — 'XX 대표', 'XX 사장', 'XX 사모', 'XX 부장', 'XX 과장', 'XX 차장', 'XX 사원', 'XX 팀장', 'XX 이사', 'XX 회장')
      //    + 동업자/가족 키워드 + 한글 이름 (동업자 김XX, 와이프 박XX 등)
      const maskPII = (text: string): string => {
        if (!text) return text;
        let s = text;
        // RRN
        s = s.replace(/\b\d{6}\s*-?\s*\d{7}\b/g, '[MASKED_RRN]');
        // 사업자번호
        s = s.replace(/\b\d{3}\s*-\s*\d{2}\s*-\s*\d{5}\b/g, '[MASKED_BRN]');
        s = s.replace(/\b\d{10}\b/g, (m) => {
          // 사업자번호 후보(10자리 연속숫자) — 전화번호와 충돌 회피: 앞자리가 01/02/03/04/05/06/07/08/09로 시작하면 전화로 간주
          if (/^0[1-9]/.test(m)) return m; // 전화일 가능성 — 별도 패턴이 처리
          return '[MASKED_BRN]';
        });
        // 전화번호
        s = s.replace(/\b01[016789][\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[MASKED_PHONE]');
        s = s.replace(/\b0\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[MASKED_PHONE]');
        // 한국 이름 (호칭 동반)
        s = s.replace(/[가-힣]{2,4}\s*(대표|사장|사모님|사모|부장|과장|차장|사원|팀장|이사|회장|소장|원장|실장|본부장|상무|전무|선생님|선생|님)/g, '[MASKED_NAME]');
        // 가족/동업자 키워드 + 한글 이름 (앞뒤 한글 이름 2~4자)
        s = s.replace(/(동업자|공동대표|배우자|와이프|남편|부인|아들|딸|아버지|어머니|부친|모친|형|형님|동생|친구)\s*[가-힣]{2,4}/g, '$1 [MASKED_NAME]');
        s = s.replace(/[가-힣]{2,4}\s*(동업자|공동대표|배우자|와이프|남편)/g, '[MASKED_NAME] $1');
        return s;
      };

      // 마스킹 진단용 글로벌 카운터
      let totalMemosScanned = 0;
      let totalMemosMaskedEmpty = 0;

      const items = picked.map(doc => {
        const c = doc.data() as any;
        const memos = Array.isArray(c?.memo_history) ? c.memo_history : [];
        return {
          customer_id: doc.id,
          entry_date: c?.entry_date ?? null,
          status_code: c?.status_code ?? null,
          memo_count: memos.length,
          memos: memos.map((m: any) => {
            const raw = String(m?.content || '');
            const masked = maskPII(raw);
            totalMemosScanned++;
            if (raw.trim().length > 0 && masked.replace(/\[MASKED_[A-Z]+\]/g, '').trim().length === 0) {
              totalMemosMaskedEmpty++;
            }
            return {
              author_name: '[MASKED_NAME]', // 작성자도 마스킹
              content_masked: masked,
              raw_length: raw.length,
              masked_length: masked.length,
              created_at: m?.created_at?._seconds
                ? new Date(m.created_at._seconds * 1000).toISOString()
                : (m?.created_at?.seconds
                  ? new Date(m.created_at.seconds * 1000).toISOString()
                  : (typeof m?.created_at === 'string' ? m.created_at : null)),
            };
          }),
        };
      });

      res.setHeader('X-Memo-Mask-Version', 'v1.0-2026-05-18');
      res.json({
        success: true,
        count: items.length,
        sampled_from: withMemos.length,
        // 진단용 글로벌 통계 (마스킹 공격성 판단)
        total_customers_with_memos: withMemos.length,
        total_customers_scanned: allSnap.size,
        sample_total_memos: totalMemosScanned,
        sample_memos_masked_to_empty: totalMemosMaskedEmpty,
        items,
      });
    } catch (error: any) {
      console.error('[/api/admin/ml-export-memos] 실패:', error);
      res.status(500).json({ success: false, error: error?.message || 'memos export 실패' });
    }
  });

  // ============================================================
  // 외부 챗 API 프록시 — yieumapi.co.kr/chat
  // 요청 body: { question, customer_id?, extra_answers? }
  // 응답: { answer, customer_id, context_used }
  // ============================================================
  const CHAT_API_BASE_DEFAULT = "https://api.yieumapi.co.kr";
  const getChatBase = () => (process.env.CHAT_API_BASE || CHAT_API_BASE_DEFAULT).replace(/\/$/, "");
  const getChatHeaders = (extra?: Record<string, string>) => {
    const h: Record<string, string> = { Accept: "application/json", ...(extra || {}) };
    const apiKey = process.env.CHAT_API_KEY || process.env.DIAGNOSE_API_KEY;
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  };

  app.post("/api/chat", requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const { question, customer_id, extra_answers } = req.body || {};
      if (!question || typeof question !== "string" || !question.trim()) {
        return res.status(400).json({ success: false, error: "question이 필요합니다." });
      }
      const url = `${getChatBase()}/chat`;
      const payload: Record<string, any> = { question: question.trim() };
      if (customer_id && typeof customer_id === "string") payload.customer_id = customer_id;
      if (extra_answers && typeof extra_answers === "object") payload.extra_answers = extra_answers;
      // 평균 10~15초 응답 → 25초 타임아웃 (장기 hang 방지)
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 25000);
      let upstream: Response;
      try {
        upstream = await fetch(url, {
          method: "POST",
          headers: getChatHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
          signal: ac.signal,
        });
      } catch (e: any) {
        clearTimeout(timer);
        if (e?.name === "AbortError") {
          return res.status(504).json({ success: false, error: "챗 API 응답 시간 초과 (25초). 잠시 후 다시 시도해주세요." });
        }
        throw e;
      }
      clearTimeout(timer);
      const text = await upstream.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      if (!upstream.ok) {
        return res.status(upstream.status).json({
          success: false,
          status: upstream.status,
          error: body?.error || body?.detail || `챗 API 오류 (${upstream.status})`,
          data: body,
        });
      }
      res.json({ success: true, data: body });
    } catch (error: any) {
      console.error("[/api/chat] 호출 실패:", error?.message);
      res.status(502).json({ success: false, error: `챗 API 호출 실패: ${error?.message || "unknown"}` });
    }
  });

  app.post("/api/diagnose", requireAuth, async (req, res) => {
    try {
      const url = `${getDiagnoseBase()}/diagnose`;
      const upstream = await fetch(url, {
        method: "POST",
        headers: getDiagnoseHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(req.body || {}),
      });
      const text = await upstream.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      if (!upstream.ok) {
        return res.status(upstream.status).json({ success: false, status: upstream.status, error: body?.error || body?.detail || `자격판정 API 오류 (${upstream.status})`, data: body });
      }
      res.json({ success: true, data: body });
    } catch (error: any) {
      console.error("[/api/diagnose POST] 호출 실패:", error?.message);
      res.status(502).json({ success: false, error: `자격판정 API 호출 실패: ${error?.message || "unknown"}` });
    }
  });

  // 디버그: 사용 가능한 Gemini 모델 목록 조회 (인증 필요)
  app.get("/api/debug/gemini-models", requireAuth, async (req, res) => {
    console.log("🔍 [디버그] Gemini 모델 목록 조회...");
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API 키가 설정되지 않았습니다." });
    }
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
      console.log("Final Request URL:", url.replace(apiKey, "MASKED"));
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log("📥 모델 목록 응답:", JSON.stringify(data, null, 2).substring(0, 3000));
      
      if (data.models) {
        const modelNames = data.models.map((m: any) => m.name);
        console.log("✅ 사용 가능한 모델:", modelNames);
        res.json({ success: true, models: modelNames });
      } else {
        console.error("모델 목록 조회 실패:", data.error);
        res.json({ success: false, error: "모델 목록을 가져올 수 없습니다." });
      }
    } catch (error: any) {
      console.error("❌ 모델 목록 조회 실패:", error.message);
      res.status(500).json({ error: "모델 목록 조회 중 오류가 발생했습니다." });
    }
  });

  // OCR API endpoint for business registration extraction (인증 필요)
  app.post("/api/ocr/business-registration", requireAuth, async (req, res) => {
    console.log("📥 [라우터] OCR API 요청 수신");
    
    try {
      const { base64Data, mimeType } = req.body;
      
      console.log(`   - Base64 존재: ${base64Data ? '✅' : '❌'}, 길이: ${base64Data?.length || 0}`);
      console.log(`   - MIME 타입: ${mimeType || '(없음)'}`);
      
      if (!base64Data || !mimeType) {
        console.log("❌ [라우터] 필수 파라미터 누락");
        return res.status(400).json({ 
          error: "base64Data와 mimeType이 필요합니다." 
        });
      }
      
      console.log("🔄 [라우터] OCR 처리 함수 호출...");
      const result = await extractBusinessRegistrationFromBase64(base64Data, mimeType) as any;
      
      // _error 필드가 있으면 에러가 발생한 것
      if (result?._error) {
        console.log("⚠️ [라우터] OCR 실패 (에러 발생):", result._error);
        res.json({ 
          success: false, 
          error: "OCR 인식에 실패했습니다. 다시 시도해주세요."
        });
      } else if (result) {
        console.log("✅ [라우터] OCR 성공:", Object.keys(result));
        res.json({ success: true, data: result });
      } else {
        console.log("❌ [라우터] OCR 실패 (결과 없음)");
        res.json({ success: false, error: "OCR 결과가 비어 있습니다.", details: "extractBusinessRegistrationFromBase64 returned null" });
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || "";
      console.error("❌ [라우터] OCR API 예외:", errorMessage);
      console.error("   - Stack:", errorStack);
      res.status(500).json({ 
        success: false, 
        error: "OCR 처리 중 오류가 발생했습니다."
      });
    }
  });

  // OCR API endpoint for VAT certificate (인증 필요)
  app.post("/api/ocr/vat-certificate", requireAuth, async (req, res) => {
    console.log("📥 [라우터] 부가세 과세표준증명 OCR 요청 수신");
    
    try {
      const { base64Data, mimeType } = req.body;
      
      console.log(`   - Base64 존재: ${base64Data ? '✅' : '❌'}, 길이: ${base64Data?.length || 0}`);
      console.log(`   - MIME 타입: ${mimeType || '(없음)'}`);
      
      if (!base64Data || !mimeType) {
        console.log("❌ [라우터] 필수 파라미터 누락");
        return res.status(400).json({ 
          error: "base64Data와 mimeType이 필요합니다." 
        });
      }
      
      console.log("🔄 [라우터] 부가세 OCR 처리 함수 호출...");
      const result = await extractVatCertificateFromBase64(base64Data, mimeType);
      
      if (result) {
        console.log("✅ [라우터] 부가세 OCR 성공:", result);
        res.json({ success: true, data: result });
      } else {
        console.log("❌ [라우터] 부가세 OCR 실패 (결과 없음)");
        res.json({ success: false, error: "OCR 결과가 비어 있습니다." });
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error("❌ [라우터] 부가세 OCR API 예외:", errorMessage);
      res.status(500).json({ 
        success: false, 
        error: "OCR 처리 중 오류가 발생했습니다."
      });
    }
  });

  // OCR API endpoint for credit report (인증 필요)
  app.post("/api/ocr/credit-report", requireAuth, async (req, res) => {
    console.log("📥 [라우터] 신용공여내역 OCR 요청 수신");
    
    try {
      const { base64Data, mimeType } = req.body;
      
      console.log(`   - Base64 존재: ${base64Data ? '✅' : '❌'}, 길이: ${base64Data?.length || 0}`);
      console.log(`   - MIME 타입: ${mimeType || '(없음)'}`);
      
      if (!base64Data || !mimeType) {
        console.log("❌ [라우터] 필수 파라미터 누락");
        return res.status(400).json({ 
          error: "base64Data와 mimeType이 필요합니다." 
        });
      }
      
      console.log("🔄 [라우터] 신용공여내역 OCR 처리 함수 호출...");
      const result = await extractCreditReportFromBase64(base64Data, mimeType);
      
      if (result) {
        console.log("✅ [라우터] 신용공여내역 OCR 성공:", result.obligations?.length || 0, "건");
        res.json({ success: true, data: result });
      } else {
        console.log("❌ [라우터] 신용공여내역 OCR 실패 (결과 없음)");
        res.json({ success: false, error: "OCR 결과가 비어 있습니다." });
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error("❌ [라우터] 신용공여내역 OCR API 예외:", errorMessage);
      res.status(500).json({ 
        success: false, 
        error: "OCR 처리 중 오류가 발생했습니다."
      });
    }
  });

  // === Firebase Custom Claims API ===

  // 자기 자신의 Custom Claims 자동 설정 (첫 로그인 시)
  app.post("/api/auth/init-claims", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email;
      if (!uid) {
        return res.status(401).json({ success: false, error: '인증 정보가 없습니다.' });
      }

      const adminApp = getAdminApp();
      const usersRef = adminApp.firestore().collection('users');
      
      // uid로 먼저 검색, 없으면 email로 fallback (Admin SDK는 Security Rules 우회)
      let userDoc = await usersRef.where('uid', '==', uid).get();
      
      if (userDoc.empty && email) {
        userDoc = await usersRef.where('email', '==', email).get();
        
        // email로 찾은 경우 uid 바인딩도 수행
        if (!userDoc.empty) {
          const docRef = userDoc.docs[0].ref;
          await docRef.update({ uid });
          console.log(`🔗 [Auth] uid 바인딩 완료: ${email} -> ${uid}`);
        }
      }
      
      if (userDoc.empty) {
        return res.status(404).json({ success: false, error: '등록된 사용자를 찾을 수 없습니다.' });
      }

      const userData = userDoc.docs[0].data();
      const role = userData.role;
      const team_id = userData.team_id || '';

      if (!role) {
        return res.status(400).json({ success: false, error: '역할이 설정되지 않은 사용자입니다.' });
      }

      await setUserCustomClaims(uid, role, team_id);
      console.log(`✅ [Auth] 자동 Claims 설정: ${uid} -> role: ${role}, team_id: ${team_id}`);

      res.json({ success: true, role, team_id });
    } catch (error: any) {
      console.error("❌ 자동 Claims 설정 실패:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 단일 사용자 Custom Claims 설정 (super_admin 전용)
  app.post("/api/admin/set-custom-claims", requireAuth, requireSuperAdmin, async (req, res) => {
    console.log("📥 [Admin] Custom Claims 설정 요청");
    
    try {
      const { uid, role, team_id } = req.body;
      
      if (!uid || !role) {
        return res.status(400).json({ 
          success: false, 
          error: "uid와 role이 필요합니다." 
        });
      }
      
      await setUserCustomClaims(uid, role, team_id);
      
      res.json({ 
        success: true, 
        message: `Custom claim 설정 완료: ${uid} -> role: ${role}, team_id: ${team_id || 'N/A'}` 
      });
    } catch (error: any) {
      console.error("❌ Custom Claims 설정 실패:", error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // 다중 사용자 Custom Claims 일괄 설정 (super_admin 전용)
  app.post("/api/admin/sync-all-claims", requireAuth, requireSuperAdmin, async (req, res) => {
    console.log("📥 [Admin] 전체 사용자 Custom Claims 동기화 요청");
    
    try {
      const { users } = req.body;
      
      if (!users || !Array.isArray(users)) {
        return res.status(400).json({ 
          success: false, 
          error: "users 배열이 필요합니다. [{uid, role}, ...]" 
        });
      }
      
      const results = await syncAllUserClaims(users);
      
      console.log(`✅ 동기화 완료: 성공 ${results.success}건, 실패 ${results.failed}건`);
      
      res.json({ 
        success: true, 
        results 
      });
    } catch (error: any) {
      console.error("❌ 전체 동기화 실패:", error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // 직원 이름 변경 시 운영 데이터의 표시 이름 일괄 동기화 (super_admin 전용)
  // 대상: customers.manager_name, settlements.manager_name,
  //       todos.assigned_to_name, todo_list.assigned_to_name,
  //       leave_requests.user_name, payments_paymint.{manager_name, sent_by_name}
  // 이력성 로그(status_logs, customer_history_logs, customer_info_logs, counseling_logs, memo_history)는
  // 시점 기록이므로 의도적으로 제외한다.
  app.post("/api/admin/sync-user-name", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { uid, newName } = req.body || {};
      if (!uid || typeof uid !== 'string' || typeof newName !== 'string' || !newName.trim()) {
        return res.status(400).json({ success: false, error: 'uid와 newName(비어있지 않음)이 필요합니다.' });
      }
      const trimmed = newName.trim();
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      // Firestore의 batch는 500 op 제한이 있어 청크 단위로 commit 한다.
      // 청크 commit 성공 시마다 onCommit 콜백으로 누적 카운트를 외부에 즉시 반영해
      // stage 도중 실패해도 실제 반영된 건수를 정확히 보고할 수 있게 한다.
      const COMMIT_CHUNK = 400;
      const commitInChunks = async (
        snap: FirebaseFirestore.QuerySnapshot,
        buildPatch: (data: any) => Record<string, any> | null,
        onCommit?: (delta: number) => void,
      ): Promise<number> => {
        let updated = 0;
        let batch = firestore.batch();
        let opsInBatch = 0;
        for (const docSnap of snap.docs) {
          const patch = buildPatch(docSnap.data() as any);
          if (!patch) continue;
          batch.update(docSnap.ref, patch);
          opsInBatch += 1;
          if (opsInBatch >= COMMIT_CHUNK) {
            await batch.commit();
            updated += opsInBatch;
            onCommit?.(opsInBatch);
            batch = firestore.batch();
            opsInBatch = 0;
          }
        }
        if (opsInBatch > 0) {
          await batch.commit();
          updated += opsInBatch;
          onCommit?.(opsInBatch);
        }
        return updated;
      };

      const [customersSnap, settlementsSnap, todosSnap, todoListSnap, leaveSnap, paymintMgrSnap, paymintSentSnap] =
        await Promise.all([
          firestore.collection('customers').where('manager_id', '==', uid).get(),
          firestore.collection('settlements').where('manager_id', '==', uid).get(),
          firestore.collection('todos').where('assigned_to', '==', uid).get(),
          firestore.collection('todo_list').where('assigned_to', '==', uid).get(),
          firestore.collection('leave_requests').where('user_id', '==', uid).get(),
          firestore.collection('payments_paymint').where('manager_id', '==', uid).get(),
          firestore.collection('payments_paymint').where('sent_by', '==', uid).get(),
        ]);

      const skipIfSame = (cur: any, key: string) => (cur && cur[key] === trimmed ? null : { [key]: trimmed });

      // 단계별 순차 커밋 — 한 단계 실패 시 이전 단계는 이미 반영(non-transactional).
      // 운영자에게 부분 반영 사실을 알릴 수 있도록 stage별 카운트를 누적하며 진행한다.
      const stages: Array<{ key: string; label: string; snap: FirebaseFirestore.QuerySnapshot; field: string }> = [
        { key: 'customers', label: '고객', snap: customersSnap, field: 'manager_name' },
        { key: 'settlements', label: '정산', snap: settlementsSnap, field: 'manager_name' },
        { key: 'todos', label: '할 일(todos)', snap: todosSnap, field: 'assigned_to_name' },
        { key: 'todo_list', label: '할 일(todo_list)', snap: todoListSnap, field: 'assigned_to_name' },
        { key: 'leave_requests', label: '연차', snap: leaveSnap, field: 'user_name' },
        { key: 'payments_manager', label: '결제(담당자)', snap: paymintMgrSnap, field: 'manager_name' },
        { key: 'payments_sent', label: '결제(발송자)', snap: paymintSentSnap, field: 'sent_by_name' },
      ];

      // stage 단위 카운트를 청크 commit 콜백으로 누적 — 실패 stage 내 부분 commit도 정확히 집계.
      const stageCounts: Record<string, number> = {};
      let anyCommitted = 0;
      for (const stage of stages) {
        stageCounts[stage.key] = stageCounts[stage.key] || 0;
        try {
          await commitInChunks(
            stage.snap,
            d => skipIfSame(d, stage.field),
            delta => {
              stageCounts[stage.key] += delta;
              anyCommitted += delta;
            },
          );
        } catch (stageErr: any) {
          const completedStages = stages.slice(0, stages.indexOf(stage)).map(s => s.label);
          console.error(`❌ [SyncUserName] 단계 실패: ${stage.label} (${stage.key}) — uid=${uid}, msg=${stageErr?.message || stageErr}, committedSoFar=${anyCommitted}`);
          return res.status(500).json({
            success: false,
            error: stageErr?.message || String(stageErr),
            // chunk 단위로도 이미 commit된 건이 있으면 partial로 본다.
            partialApplied: anyCommitted > 0,
            failedStage: stage.label,
            completedStages,
            countsSoFar: {
              customers: stageCounts.customers || 0,
              settlements: stageCounts.settlements || 0,
              todos: (stageCounts.todos || 0) + (stageCounts.todo_list || 0),
              leave_requests: stageCounts.leave_requests || 0,
              payments: (stageCounts.payments_manager || 0) + (stageCounts.payments_sent || 0),
            },
          });
        }
      }

      console.log(`✅ [SyncUserName] uid=${uid} → "${trimmed}" | customers=${stageCounts.customers}, settlements=${stageCounts.settlements}, todos=${stageCounts.todos}, todo_list=${stageCounts.todo_list}, leave=${stageCounts.leave_requests}, paymint(mgr)=${stageCounts.payments_manager}, paymint(sent)=${stageCounts.payments_sent}`);

      res.json({
        success: true,
        counts: {
          customers: stageCounts.customers,
          settlements: stageCounts.settlements,
          todos: stageCounts.todos + stageCounts.todo_list,
          leave_requests: stageCounts.leave_requests,
          payments: stageCounts.payments_manager + stageCounts.payments_sent,
        },
      });
    } catch (error: any) {
      console.error('❌ [SyncUserName] 실패:', error?.message || error);
      res.status(500).json({ success: false, error: error?.message || String(error) });
    }
  });

  // 사용자 Custom Claims 조회 (super_admin 전용)
  app.get("/api/admin/get-custom-claims/:uid", requireAuth, requireSuperAdmin, async (req, res) => {
    console.log("📥 [Admin] Custom Claims 조회 요청");
    
    try {
      const { uid } = req.params;
      
      if (!uid) {
        return res.status(400).json({ 
          success: false, 
          error: "uid가 필요합니다." 
        });
      }
      
      const claims = await getUserCustomClaims(uid);
      
      res.json({ 
        success: true, 
        uid,
        claims 
      });
    } catch (error: any) {
      console.error("❌ Custom Claims 조회 실패:", error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Solapi 설정 상태 확인
  app.get("/api/solapi/status", requireAuth, async (req, res) => {
    console.log("🔍 [Solapi] 설정 상태 조회");
    
    const config = checkSolapiConfig();
    res.json({
      success: true,
      configured: config.configured,
      missing: config.missing,
    });
  });

  // 상담 접수 알림톡 발송 (랜딩페이지에서 호출 - 고객에게 접수 확인 알림)
  app.post("/api/solapi/consultation-notify", async (req, res) => {
    console.log("📤 [Solapi] 상담 접수 확인 알림톡 발송 요청");
    
    try {
      const { customerPhone, customerName, services, createdAt, utm_source, utm_medium, utm_campaign } = req.body;
      
      if (utm_source || utm_medium || utm_campaign) {
        console.log(`📊 [UTM] source=${utm_source || 'direct'}, medium=${utm_medium || 'direct'}, campaign=${utm_campaign || 'direct'}`);
      }
      
      if (!customerPhone) {
        return res.status(400).json({
          success: false,
          error: "customerPhone(고객 전화번호)은 필수입니다.",
        });
      }
      
      if (!customerName) {
        return res.status(400).json({
          success: false,
          error: "customerName(고객명)은 필수입니다.",
        });
      }
      
      const result = await sendConsultationAlimtalk({
        customerPhone,
        customerName,
        services: services || [],
        createdAt: createdAt ? new Date(createdAt) : new Date(),
      });
      
      console.log(`📤 [Solapi] 고객(${customerPhone}) 알림톡 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 알림톡 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: "알림톡 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // 지연 알림톡 일괄 발송 (인증 필요)
  app.post("/api/solapi/delay-notify", requireAuth, async (req, res) => {
    console.log("📤 [Solapi] 지연 알림톡 일괄 발송 요청");
    
    try {
      const { customers } = req.body;
      
      if (!customers || !Array.isArray(customers) || customers.length === 0) {
        return res.status(400).json({
          success: false,
          error: "customers 배열은 필수입니다.",
        });
      }
      
      const result = await sendBulkDelayAlimtalk(customers);
      
      console.log(`📤 [Solapi] 지연 알림톡 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 지연 알림톡 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: "지연 알림톡 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // 담당자 배정 알림톡 발송 (인증 필요)
  app.post("/api/solapi/assignment-notify", requireAuth, async (req, res) => {
    console.log("📤 [Solapi] 담당자 배정 알림톡 발송 요청");
    
    try {
      const { customerPhone, customerName, managerName, managerPhone, region } = req.body;
      
      if (!customerPhone || !customerName || !managerName) {
        return res.status(400).json({
          success: false,
          error: "customerPhone, customerName, managerName은 필수입니다.",
        });
      }
      
      // 지역 → 지점 변환
      const branchName = getBranchFromRegion(region || '');
      
      const result = await sendAssignmentAlimtalk({
        customerPhone,
        customerName,
        managerName,
        managerPhone: managerPhone || '',
        branchName,
      });
      
      console.log(`📤 [Solapi] 담당자 배정 알림톡 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 담당자 배정 알림톡 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: "담당자 배정 알림톡 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // 장기부재 알림 발송 API (인증 필요)
  app.post("/api/solapi/send-longabsence", requireAuth, async (req, res) => {
    try {
      const { customerPhone, customerName, services } = req.body;
      
      if (!customerPhone) {
        return res.status(400).json({
          success: false,
          error: "customerPhone은 필수입니다.",
        });
      }
      
      const result = await sendLongAbsenceAlimtalk({
        customerPhone,
        customerName: customerName || '고객',
        services: services || [],
      });
      
      console.log(`📤 [Solapi] 장기부재 알림 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 장기부재 알림 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: "장기부재 알림 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // 명함 발송 API (인증 필요)
  app.post("/api/solapi/send-businesscard", requireAuth, async (req, res) => {
    try {
      const { customerPhone, customerName, managerName, managerPhone, managerEmail, businessAddress } = req.body;
      
      if (!customerPhone || !managerName) {
        return res.status(400).json({
          success: false,
          error: "customerPhone, managerName은 필수입니다.",
        });
      }
      
      // 사업장 주소 → 지점 변환 (없으면 본사)
      const branchName = businessAddress ? getBranchFromRegion(businessAddress) : '본사';
      
      const result = await sendBusinessCardAlimtalk({
        customerPhone,
        customerName: customerName || '고객',
        managerName,
        branchName,
        managerPhone: managerPhone || '',
        managerEmail: managerEmail || '',
      });
      
      console.log(`📤 [Solapi] 명함 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 명함 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: "명함 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // ============================================================
  // eformsign 전자계약 API
  // ============================================================

  app.get("/api/eformsign/status", requireAuth, async (req, res) => {
    const config = checkEformsignConfig();
    res.json(config);
  });

  app.get("/api/eformsign/templates", requireAuth, async (req, res) => {
    try {
      const templates = await getTemplates();
      console.log("[eformsign] 템플릿 목록 조회 성공, 응답:", JSON.stringify(templates).substring(0, 1000));
      res.json({ success: true, data: templates });
    } catch (error: any) {
      console.error("[eformsign] 템플릿 목록 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/eformsign/templates/:templateId", requireAuth, async (req, res) => {
    try {
      const detail = await getTemplateDetail(req.params.templateId);
      console.log(`[eformsign] 템플릿 상세 조회: ${req.params.templateId}`);
      res.json({ success: true, data: detail });
    } catch (error: any) {
      console.error("[eformsign] 템플릿 상세 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/documents", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { template_id, template_name, document_name, fields, recipients, comment,
              customer_id, customer_name, created_by, amount_man_won: clientAmountManWon, commission_rate_raw: clientCommissionRate } = req.body;

      if (!template_id) {
        return res.status(400).json({ success: false, error: "template_id가 필요합니다." });
      }

      const processedFields = (fields && Array.isArray(fields)) ? fields.map((f: any) => {
        if (f.id === '계약금') {
          const strVal = String(f.value).replace(/,/g, '');
          const numVal = parseFloat(strVal);
          if (!isNaN(numVal) && numVal > 0 && !/[가-힣()]/.test(String(f.value))) {
            return { ...f, value: formatContractAmountServer(numVal) };
          }
        }
        return f;
      }) : fields;

      console.log(`[eformsign] 문서 생성 요청: template_id=${template_id}, document_name=${document_name}`);
      console.log(`[eformsign] fields:`, JSON.stringify(processedFields));
      console.log(`[eformsign] recipients:`, JSON.stringify(recipients));

      const result = await createDocument(template_id, {
        document_name,
        fields: processedFields,
        recipients: recipients || [],
        comment,
      });

      console.log(`[eformsign] 문서 생성 성공: template=${template_id}, result:`, JSON.stringify(result).substring(0, 500));

      const documentId = result?.document?.id || '';
      const admin = getAdminApp();
      const firestore = admin.firestore();

      if (customer_id && documentId) {
        const now = new Date();
        const fieldsRecord: Record<string, string> = {};
        if (processedFields && Array.isArray(processedFields)) {
          processedFields.forEach((f: any) => { fieldsRecord[f.id] = f.value; });
        }

        const contractAmountRaw = fieldsRecord['계약금'] || '';
        const commissionRateRaw = fieldsRecord['자문료율'] || '';

        const amountManWon = (typeof clientAmountManWon === 'number' && clientAmountManWon > 0)
          ? clientAmountManWon
          : (() => {
              const wonMatch = contractAmountRaw.replace(/,/g, '').match(/^(\d+)/);
              const amountWon = wonMatch ? parseInt(wonMatch[1], 10) : 0;
              return Math.round(amountWon / 10000);
            })();

        const commissionRate = (typeof clientCommissionRate === 'number' && clientCommissionRate > 0)
          ? clientCommissionRate
          : (parseFloat(commissionRateRaw) || 0);

        const customerDoc = await firestore.collection('customers').doc(customer_id).get();
        const customerData = customerDoc.exists ? customerDoc.data() : null;

        await firestore.collection('contracts_eformsign').add({
          customer_id,
          customer_name: customer_name || '',
          document_id: documentId,
          template_id,
          template_name: template_name || '',
          status: '발송완료',
          sent_at: now.toISOString(),
          fields: fieldsRecord,
          amount_man_won: amountManWon,
          commission_rate: commissionRate,
          created_by: created_by || req.user?.email || '',
          created_by_uid: req.user?.uid || '',
          manager_id: customerData?.manager_id || req.user?.uid || '',
          team_id: customerData?.team_id || '',
          created_at: now.toISOString(),
        });
        console.log(`[eformsign] contracts_eformsign 레코드 생성 완료: ${documentId}, 계약금: ${amountManWon}만원, 자문료율: ${commissionRate}%`);

        const contractType = detectContractType(template_name || '');

        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const amountPart = contractType !== 'out' ? ` | 계약금: ${contractAmountRaw}` : '';
        const memoContent = `[계약서발송완료] 발송일자: ${dateStr}${amountPart} | 자문료율: ${commissionRateRaw}%`;
        const memoEntry = {
          content: memoContent,
          author_id: req.user?.uid || 'system',
          author_name: created_by || '시스템',
          created_at: now.toISOString(),
        };

        try {
          const customerRef = firestore.collection('customers').doc(customer_id);
          const prevDoc = await customerRef.get();
          const prevStatus = prevDoc.data()?.status_code || '';
          const sentStatus = getContractSentStatusByType(contractType);
          const customerUpdate: Record<string, any> = {
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            updated_at: now.toISOString(),
            status_code: sentStatus,
          };
          if (contractType !== 'out' && amountManWon > 0) {
            customerUpdate.approved_amount = amountManWon;
            customerUpdate.contract_amount = amountManWon;
          }
          if (commissionRate > 0) {
            customerUpdate.commission_rate = commissionRate;
            customerUpdate.contract_fee_rate = commissionRate;
          }
          await customerRef.update(customerUpdate);
          try {
            await firestore.collection('status_logs').add({
              customer_id,
              previous_status: prevStatus,
              new_status: sentStatus,
              changed_by_user_id: req.user?.uid || 'system',
              changed_by_user_name: created_by || '시스템',
              changed_at: now.toISOString(),
            });
          } catch (logErr: any) {
            console.error(`[eformsign] 상태 로그 생성 실패: ${logErr.message}`);
          }

          console.log(`[eformsign] 고객 상태 → ${sentStatus} + 메모 업데이트 완료: ${customer_id} (${contractType})`);
        } catch (memoErr: any) {
          console.error(`[eformsign] 고객 업데이트 실패 (계약 발송은 성공): ${memoErr.message}`);
        }
      }

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("[eformsign] 문서 생성 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/eformsign/documents/:documentId", requireAuth, async (req, res) => {
    try {
      const doc = await getDocument(req.params.documentId);
      console.log(`[eformsign] 문서 상태 조회: ${req.params.documentId}`);
      res.json({ success: true, data: doc });
    } catch (error: any) {
      console.error("[eformsign] 문서 상태 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/eformsign/documents/:documentId/download", requireAuth, async (req, res) => {
    try {
      const { buffer, contentType, fileName } = await downloadDocument(req.params.documentId);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (error: any) {
      console.error("[eformsign] 문서 다운로드 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/eformsign/documents", requireAuth, async (req, res) => {
    try {
      const { type, status, from, to, limit: limitParam, offset } = req.query;
      const docs = await getDocuments({
        type: type as string,
        status: status as string,
        from: from as string,
        to: to as string,
        limit: limitParam ? Number(limitParam) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      console.log("[eformsign] 문서 목록 조회 성공");
      res.json({ success: true, data: docs });
    } catch (error: any) {
      console.error("[eformsign] 문서 목록 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/contracts", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const { customer_id } = req.query;

      const userRole = (req.user as any)?.role || '';
      const userTeamId = (req.user as any)?.team_id || '';
      const userUid = req.user?.uid || '';

      let snapshot;
      try {
        if (customer_id) {
          snapshot = await firestore.collection('contracts_eformsign')
            .where('customer_id', '==', customer_id)
            .orderBy('created_at', 'desc')
            .get();
        } else {
          snapshot = await firestore.collection('contracts_eformsign')
            .orderBy('created_at', 'desc')
            .get();
        }
      } catch (indexError: any) {
        if (indexError.code === 9 || indexError.message?.includes('index')) {
          console.warn('[contracts] 복합 인덱스 미생성 - fallback 쿼리 사용');
          if (customer_id) {
            snapshot = await firestore.collection('contracts_eformsign')
              .where('customer_id', '==', customer_id as string)
              .get();
          } else {
            snapshot = await firestore.collection('contracts_eformsign')
              .get();
          }
        } else {
          throw indexError;
        }
      }

      let contracts = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (userRole === 'staff') {
        contracts = contracts.filter((c: any) =>
          !c.manager_id || c.manager_id === userUid || c.created_by_uid === userUid
        );
      } else if (userRole === 'team_leader') {
        contracts = contracts.filter((c: any) =>
          !c.team_id || c.team_id === userTeamId || c.created_by_uid === userUid
        );
      }

      contracts.sort((a: any, b: any) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });

      res.json({ success: true, data: contracts });
    } catch (error: any) {
      console.error("[contracts] 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/contracts/:contractId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userRole = (req.user as any)?.role || '';
      if (userRole !== 'super_admin') {
        return res.status(403).json({ success: false, error: '삭제 권한이 없습니다.' });
      }

      const { contractId } = req.params;
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      await firestore.collection('contracts_eformsign').doc(contractId).delete();
      console.log(`[contracts] 계약 삭제 완료: ${contractId}`);

      res.json({ success: true });
    } catch (error: any) {
      console.error("[contracts] 삭제 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/contracts/:contractId/resend", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { contractId } = req.params;
      console.log(`[eformsign] 계약서 알림 재발송 시작: contractId=${contractId}`);

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      const contractData = contractDoc.data()!;
      const documentId = contractData.document_id;
      if (!documentId) {
        return res.status(400).json({ success: false, error: 'document_id가 없습니다.' });
      }

      // 유효기간: body로 전달받은 valid_day 우선, 없으면 기본값 14일(2주)
      const validDayRaw = (req.body as any)?.valid_day;
      const validDay = (typeof validDayRaw === 'number' && validDayRaw > 0 && validDayRaw <= 365)
        ? Math.floor(validDayRaw)
        : 14;

      // 가이드 준수: re_request_outsider API 호출 (member 생략 → 기존 수신자 정보 그대로 재전송, 유효기간만 갱신)
      const result = await resendDocument(documentId, validDay);
      console.log(`[eformsign] 알림 재발송 성공: documentId=${documentId}, validDay=${validDay}`);

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // 기존 계약 레코드에 재발송 이력 업데이트 (새 레코드 생성하지 않음)
      try {
        await contractDoc.ref.update({
          last_resent_at: now.toISOString(),
          resent_count: (contractData.resent_count || 0) + 1,
          valid_day: validDay,
        });
      } catch (updateErr: any) {
        console.warn(`[eformsign] 재발송 이력 업데이트 실패: ${updateErr.message}`);
      }

      // 고객 메모에 재발송 알림 기록 (상태 변경은 하지 않음 - 알림 재발송이므로)
      try {
        const customer_id = contractData.customer_id;
        const created_by = contractData.created_by || req.user?.email || '시스템';
        const memoContent = `[계약서재발송] ${dateStr} 알림 재발송 (유효기간 ${validDay}일 갱신)`;
        const memoEntry = {
          content: memoContent,
          author_id: req.user?.uid || 'system',
          author_name: created_by,
          created_at: now.toISOString(),
        };
        if (customer_id) {
          await firestore.collection('customers').doc(customer_id).update({
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            updated_at: now.toISOString(),
          });
          console.log(`[eformsign] 재발송 메모 기록 완료: ${customer_id}`);
        }
      } catch (memoErr: any) {
        console.error(`[eformsign] 재발송 메모 추가 실패: ${memoErr.message}`);
      }

      res.json({ success: true, data: result, valid_day: validDay });
    } catch (error: any) {
      console.error("[eformsign] 계약서 재발송 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/contracts/:contractId/cancel", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { contractId } = req.params;
      const { reason } = (req.body || {}) as { reason?: string };
      const cancelComment = (typeof reason === 'string' && reason.trim()) ? reason.trim() : '계약서 취소';
      console.log(`[eformsign] 계약서 발송취소 시작: contractId=${contractId}, reason=${cancelComment}`);

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      const contractData = contractDoc.data()!;
      const { document_id, status } = contractData;

      if (status === '서명완료' || status === '무효') {
        return res.status(400).json({ success: false, error: `이미 ${status} 상태인 계약서는 취소할 수 없습니다.` });
      }

      if (document_id) {
        try {
          await cancelDocument(document_id, cancelComment);
          console.log(`[eformsign] eformsign 문서 취소 성공: ${document_id}`);
        } catch (eformsignError: any) {
          console.error(`[eformsign] eformsign 문서 취소 실패:`, eformsignError.message);
          return res.status(500).json({ success: false, error: `eformsign 취소 실패: ${eformsignError.message}` });
        }
      }

      await firestore.collection('contracts_eformsign').doc(contractId).update({
        status: '무효',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: cancelComment,
        cancelled_by: req.user?.email || req.user?.uid || '',
      });

      console.log(`[eformsign] 계약서 발송취소 완료: contractId=${contractId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[eformsign] 계약서 발송취소 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // [신규] 계약서 열람여부 확인
  app.get("/api/eformsign/contracts/:contractId/read-status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { contractId } = req.params;
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      const contractData = contractDoc.data()!;
      const documentId = contractData.document_id;
      if (!documentId) {
        return res.status(400).json({ success: false, error: 'document_id가 없습니다.' });
      }

      const status = await getDocumentReadStatus(documentId);
      console.log(`[eformsign] 열람여부 조회 완료: contractId=${contractId}, opened=${status.opened}, count=${status.open_count}`);

      // Firestore에 열람 정보 캐싱 (best-effort)
      try {
        const updateData: Record<string, any> = {
          opened: status.opened,
          open_count: status.open_count,
          read_status_checked_at: new Date().toISOString(),
        };
        if (status.first_opened_at) updateData.first_opened_at = status.first_opened_at;
        if (status.last_opened_at) updateData.last_opened_at = status.last_opened_at;
        await contractDoc.ref.update(updateData);
      } catch (cacheErr: any) {
        console.warn(`[eformsign] 열람정보 캐싱 실패: ${cacheErr.message}`);
      }

      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error("[eformsign] 열람여부 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 활성 계약(발송완료/서명대기)들의 열람정보를 일괄 갱신하여 Firestore에 저장.
   * Dashboard에서 30초 주기로 호출 → onSnapshot이 변경 감지 → 토스트 표시.
   * RBAC: super_admin은 전체, 그 외는 본인 manager_id 계약만.
   * Throttle: 마지막 read_status_checked_at으로부터 25초 이상 지난 계약만 갱신.
   */
  app.post("/api/eformsign/contracts/poll-active", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const userRole = req.user?.role || 'staff';
      const userUid = req.user?.uid || '';

      let baseQuery: FirebaseFirestore.Query = firestore.collection('contracts_eformsign')
        .where('status', 'in', ['발송완료', '서명대기']);
      if (userRole !== 'super_admin') {
        baseQuery = baseQuery.where('manager_id', '==', userUid);
      }
      const snap = await baseQuery.limit(50).get();

      if (snap.empty) {
        return res.json({ success: true, polled: 0 });
      }

      const now = Date.now();
      const THROTTLE_MS = 25 * 1000;
      const toCheck = snap.docs.filter(d => {
        const checkedAt = d.data().read_status_checked_at;
        if (!checkedAt) return true;
        const t = new Date(checkedAt).getTime();
        return isNaN(t) || (now - t) >= THROTTLE_MS;
      });

      // 모든 활성 계약 현재 상태 (status + opened) 반환 — 클라이언트가 비교
      const activeContracts: Array<{
        contractId: string;
        documentId: string;
        customerId: string;
        customerName: string;
        status: string;
        opened: boolean;
        open_count: number;
        first_opened_at?: string;
        last_opened_at?: string;
        template_name?: string;
      }> = [];

      let polled = 0;
      // 병렬 처리(3개씩 chunk)로 eformsign API 부담 완화
      const CHUNK = 3;
      for (let i = 0; i < toCheck.length; i += CHUNK) {
        const chunk = toCheck.slice(i, i + CHUNK);
        await Promise.all(chunk.map(async (docSnap) => {
          const data = docSnap.data();
          const documentId = data.document_id;
          if (!documentId) return;
          try {
            const status = await getDocumentReadStatus(documentId);
            polled++;
            const updateData: Record<string, any> = {
              opened: status.opened,
              open_count: status.open_count,
              read_status_checked_at: new Date().toISOString(),
            };
            if (status.first_opened_at) updateData.first_opened_at = status.first_opened_at;
            if (status.last_opened_at) updateData.last_opened_at = status.last_opened_at;
            await docSnap.ref.update(updateData);
            // 갱신된 데이터를 메모리상에서도 반영
            data.opened = status.opened;
            data.open_count = status.open_count;
            data.first_opened_at = status.first_opened_at;
            data.last_opened_at = status.last_opened_at;
          } catch (err: any) {
            console.warn(`[eformsign poll-active] ${documentId} 실패: ${err.message?.substring(0, 100)}`);
          }
        }));
      }

      // 모든 활성 계약(throttle된 것 포함) 현재 상태 반환
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        activeContracts.push({
          contractId: docSnap.id,
          documentId: data.document_id || '',
          customerId: data.customer_id || '',
          customerName: data.customer_name || '',
          status: data.status || '',
          opened: !!data.opened,
          open_count: Number(data.open_count || 0),
          first_opened_at: data.first_opened_at,
          last_opened_at: data.last_opened_at,
          template_name: data.template_name || '',
        });
      });

      res.json({ success: true, polled, total: snap.size, contracts: activeContracts });
    } catch (error: any) {
      console.error("[eformsign poll-active] 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/contracts/sync", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const admin = getAdminApp();
      const firestore = admin.firestore();

      const contractsRef = firestore.collection('contracts_eformsign');
      const pendingSnapshot = await contractsRef
        .where('status', 'in', ['발송완료', '서명대기', '거부'])
        .get();

      if (pendingSnapshot.empty) {
        return res.json({ success: true, message: '동기화할 계약이 없습니다.', synced: 0 });
      }

      let syncedCount = 0;
      const results: Array<{ documentId: string; oldStatus: string; newStatus: string }> = [];

      for (const contractDoc of pendingSnapshot.docs) {
        const contractData = contractDoc.data();
        const documentId = contractData.document_id;

        if (!documentId) continue;

        try {
          const docInfo = await getDocument(documentId);
          const resolvedStatus = docInfo?.current_status || docInfo?.document?.current_status || {};
          const rawStatusType = resolvedStatus?.status_type ?? '';
          console.log(`[eformsign Sync] doc=${documentId}, current_status:`, JSON.stringify(resolvedStatus));
          const mappedStatus = extractEformsignStatus(docInfo);

          console.log(`[eformsign Sync] doc=${documentId}, status_type=${rawStatusType}, mapped=${mappedStatus}, current=${contractData.status}`);

          if (mappedStatus && mappedStatus !== contractData.status) {
            const updateData: Record<string, any> = { status: mappedStatus };

            if (mappedStatus === '서명완료') {
              updateData.completed_at = new Date().toISOString();
            }

            await contractDoc.ref.update(updateData);
            syncedCount++;
            results.push({ documentId, oldStatus: contractData.status, newStatus: mappedStatus });

            if (mappedStatus === '서명완료' && contractData.customer_id) {
              const customerId = contractData.customer_id;
              const customerRef = firestore.collection('customers').doc(customerId);
              const customerSnap = await customerRef.get();

              if (customerSnap.exists) {
                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                const contractType = detectContractType(contractData.template_name || '');
                const targetStatus = getContractStatusByType(contractType);
                const typeLabel = getContractTypeLabel(contractType);

                const contractAmountManWon = contractData.amount_man_won || 0;
                const commissionRateNum = contractData.commission_rate || 0;
                const previousStatus = customerSnap.data()?.status_code || '';

                const amountPart = contractType !== 'out' ? ` | 계약금: ${contractAmountManWon}만원` : '';
                const memoContent = `[계약서작성완료] 완료일: ${dateStr}${amountPart} | 자문료율: ${commissionRateNum}% | 상태: ${targetStatus}`;
                const memoEntry = {
                  content: memoContent,
                  author_id: 'system',
                  author_name: '시스템(eformsign)',
                  created_at: now.toISOString(),
                };

                const customerUpdateData: Record<string, any> = {
                  status_code: targetStatus,
                  contract_completion_date: dateStr,
                  updated_at: now.toISOString(),
                  memo_history: FieldValue.arrayUnion(memoEntry),
                  recent_memo: memoContent,
                  latest_memo: memoContent,
                };

                if (contractType !== 'out' && contractAmountManWon > 0) {
                  customerUpdateData.approved_amount = contractAmountManWon;
                  customerUpdateData.contract_amount = contractAmountManWon;
                }
                if (commissionRateNum > 0) {
                  customerUpdateData.commission_rate = commissionRateNum;
                  customerUpdateData.contract_fee_rate = commissionRateNum;
                }

                await customerRef.update(customerUpdateData);
                console.log(`[eformsign Sync] 고객 상태 변경: ${customerId} → ${targetStatus} (${typeLabel}), 계약금: ${contractAmountManWon}만원, 자문료율: ${commissionRateNum}%`);

                // 재분배 풀: 계약완료(후불)/(외주) 진입 시 임시배정자로 확정 이동
                // 선불(pre)은 '수납대기' 단계라 결제선생 콜백에서 처리
                if (targetStatus.startsWith('계약완료')) {
                  await tryConfirmRedistribution(firestore, customerId, now, `전자계약 서명완료(${typeLabel})`);
                }

                await firestore.collection('status_logs').add({
                  customer_id: customerId,
                  customer_name: contractData.customer_name || '',
                  previous_status: previousStatus,
                  new_status: targetStatus,
                  changed_by_id: 'system',
                  changed_by_name: '시스템(eformsign)',
                  changed_at: now.toISOString(),
                  reason: `전자계약 서명 완료 - ${typeLabel} (수동 동기화)`,
                });
              }
            }
          }
        } catch (docErr: any) {
          console.error(`[eformsign Sync] 문서 ${documentId} 상태 조회 실패:`, docErr.message);
        }
      }

      console.log(`[eformsign Sync] 동기화 완료: ${syncedCount}건 업데이트`);
      res.json({ success: true, synced: syncedCount, results });
    } catch (error: any) {
      console.error("[eformsign Sync] 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/contracts/:contractId/sync", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { contractId } = req.params;
      const admin = getAdminApp();
      const firestore = admin.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      const contractData = contractDoc.data()!;
      const documentId = contractData.document_id;

      if (!documentId) {
        return res.status(400).json({ success: false, error: 'document_id가 없습니다.' });
      }

      const docInfo = await getDocument(documentId);
      const resolvedStatus = docInfo?.current_status || docInfo?.document?.current_status || {};
      const rawStatusType = resolvedStatus?.status_type ?? '';
      console.log(`[eformsign Sync] 개별 동기화 - doc=${documentId}, raw response:`, JSON.stringify(docInfo).substring(0, 2000));
      console.log(`[eformsign Sync] 개별 동기화 - doc=${documentId}, current_status:`, JSON.stringify(resolvedStatus));
      const mappedStatus = extractEformsignStatus(docInfo);

      console.log(`[eformsign Sync] 개별 동기화 - doc=${documentId}, status_type=${rawStatusType}, mapped=${mappedStatus}, current=${contractData.status}`);

      if (!mappedStatus || mappedStatus === contractData.status) {
        return res.json({ success: true, message: '변경 사항 없음', currentStatus: contractData.status, eformsignStatus: rawStatusType, mappedStatus, eformsignRaw: docInfo?.current_status || {} });
      }

      const updateData: Record<string, any> = { status: mappedStatus };
      if (mappedStatus === '서명완료') {
        updateData.completed_at = new Date().toISOString();
      }
      await contractDoc.ref.update(updateData);

      if (mappedStatus === '서명완료' && contractData.customer_id) {
        const customerId = contractData.customer_id;
        const customerRef = firestore.collection('customers').doc(customerId);
        const customerSnap = await customerRef.get();

        if (customerSnap.exists) {
          const now = new Date();
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

          const contractType = detectContractType(contractData.template_name || '');
          const targetStatus = getContractStatusByType(contractType);
          const typeLabel = getContractTypeLabel(contractType);

          const contractAmountManWon = contractData.amount_man_won || 0;
          const commissionRateNum = contractData.commission_rate || 0;
          const previousStatus = customerSnap.data()?.status_code || '';

          const amountPart = contractType !== 'out' ? ` | 계약금: ${contractAmountManWon}만원` : '';
          const memoContent = `[계약서작성완료] 완료일: ${dateStr}${amountPart} | 자문료율: ${commissionRateNum}% | 상태: ${targetStatus}`;
          const memoEntry = {
            content: memoContent,
            author_id: 'system',
            author_name: '시스템(eformsign)',
            created_at: now.toISOString(),
          };

          const customerUpdateData: Record<string, any> = {
            status_code: targetStatus,
            contract_completion_date: dateStr,
            updated_at: now.toISOString(),
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
          };

          if (contractType !== 'out' && contractAmountManWon > 0) {
            customerUpdateData.approved_amount = contractAmountManWon;
            customerUpdateData.contract_amount = contractAmountManWon;
          }
          if (commissionRateNum > 0) {
            customerUpdateData.commission_rate = commissionRateNum;
            customerUpdateData.contract_fee_rate = commissionRateNum;
          }

          await customerRef.update(customerUpdateData);
          console.log(`[eformsign Sync] 고객 상태 변경: ${customerId} → ${targetStatus} (${typeLabel}), 계약금: ${contractAmountManWon}만원, 자문료율: ${commissionRateNum}%`);

          // 재분배 풀: 계약완료(후불)/(외주) 진입 시 임시배정자로 확정 이동
          if (targetStatus.startsWith('계약완료')) {
            await tryConfirmRedistribution(firestore, customerId, now, `전자계약 서명완료(${typeLabel})`);
          }

          await firestore.collection('status_logs').add({
            customer_id: customerId,
            customer_name: contractData.customer_name || '',
            previous_status: previousStatus,
            new_status: targetStatus,
            changed_by_id: 'system',
            changed_by_name: '시스템(eformsign)',
            changed_at: now.toISOString(),
            reason: `전자계약 서명 완료 - ${typeLabel} (수동 동기화)`,
          });
        }
      }

      res.json({ success: true, oldStatus: contractData.status, newStatus: mappedStatus, eformsignStatusType: rawStatusType });
    } catch (error: any) {
      console.error("[eformsign Sync] 개별 동기화 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Webhook - eformsign에서 호출 (인증 없음)
  app.post("/api/eformsign/webhook", async (req, res) => {
    try {
      const { event, document_id, document_name, template_id, status } = req.body;
      console.log(`[eformsign Webhook] event=${event}, doc_id=${document_id}, status=${status}`);

      const mappedStatus = mapEformsignStatus(event || status || '');

      const admin = getAdminApp();
      const firestore = admin.firestore();

      const contractsRef = firestore.collection('contracts_eformsign');
      const snapshot = await contractsRef.where('document_id', '==', document_id).limit(1).get();

      if (!snapshot.empty) {
        const contractDoc = snapshot.docs[0];
        const contractData = contractDoc.data();
        const updateData: Record<string, any> = {
          status: mappedStatus,
        };

        if (mappedStatus === '서명완료') {
          updateData.completed_at = new Date().toISOString();
        }

        await contractDoc.ref.update(updateData);
        console.log(`[eformsign Webhook] 계약 상태 업데이트: ${contractDoc.id} → ${mappedStatus}`);

        if (mappedStatus === '서명완료' && contractData.customer_id) {
          const customerId = contractData.customer_id;
          const customerRef = firestore.collection('customers').doc(customerId);
          const customerSnap = await customerRef.get();

          if (customerSnap.exists) {
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const contractType = detectContractType(contractData.template_name || '');
            const targetStatus = getContractStatusByType(contractType);
            const typeLabel = getContractTypeLabel(contractType);

            const contractAmountManWon = contractData.amount_man_won || 0;
            const commissionRateNum = contractData.commission_rate || 0;

            const previousStatus = customerSnap.data()?.status_code || '';

            const amountPart = contractType !== 'out' ? ` | 계약금: ${contractAmountManWon}만원` : '';
            const memoContent = `[계약서작성완료] 완료일: ${dateStr}${amountPart} | 자문료율: ${commissionRateNum}% | 상태: ${targetStatus}`;
            const memoEntry = {
              content: memoContent,
              author_id: 'system',
              author_name: '시스템(eformsign)',
              created_at: now.toISOString(),
            };

            const customerUpdateData: Record<string, any> = {
              status_code: targetStatus,
              contract_completion_date: dateStr,
              updated_at: now.toISOString(),
              memo_history: FieldValue.arrayUnion(memoEntry),
              recent_memo: memoContent,
              latest_memo: memoContent,
            };

            if (contractType !== 'out' && contractAmountManWon > 0) {
              customerUpdateData.approved_amount = contractAmountManWon;
              customerUpdateData.contract_amount = contractAmountManWon;
            }
            if (commissionRateNum > 0) {
              customerUpdateData.commission_rate = commissionRateNum;
              customerUpdateData.contract_fee_rate = commissionRateNum;
            }

            await customerRef.update(customerUpdateData);
            console.log(`[eformsign Webhook] 고객 상태 변경: ${customerId} → ${targetStatus} (${typeLabel}), 계약금=${contractAmountManWon}만원, 자문료율=${commissionRateNum}%`);

            // 재분배 풀: 계약완료(후불)/(외주) 진입 시 임시배정자로 확정 이동
            if (targetStatus.startsWith('계약완료')) {
              await tryConfirmRedistribution(firestore, customerId, now, `전자계약 서명완료(${typeLabel})`);
            }

            await firestore.collection('status_logs').add({
              customer_id: customerId,
              customer_name: contractData.customer_name || '',
              previous_status: previousStatus,
              new_status: targetStatus,
              changed_by_id: 'system',
              changed_by_name: '시스템(eformsign)',
              changed_at: now.toISOString(),
              reason: `전자계약 서명 완료 - ${typeLabel}`,
            });
            console.log(`[eformsign Webhook] 상태 로그 기록 완료: ${previousStatus} → ${targetStatus}`);
          }
        }
      } else {
        console.log(`[eformsign Webhook] document_id=${document_id}에 해당하는 계약을 찾지 못함`);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[eformsign Webhook] 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // =========================================================================
  // 외부 스프레드시트 → consultations 컬렉션 Webhook
  // =========================================================================
  app.post("/api/webhook/consultation", async (req, res) => {
    console.log("[Webhook] 외부 상담 데이터 수신");

    try {
      const {
        name, phone, businessName, businessNumber,
        revenue, services, source, note,
        utm_source, utm_medium, utm_campaign
      } = req.body;

      if (!name || !phone) {
        return res.status(400).json({
          success: false,
          error: "name(고객명)과 phone(연락처)은 필수입니다.",
        });
      }

      const formatPhone = (p: string): string => {
        const digits = p.replace(/\D/g, '');
        if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
        return p;
      };
      const formattedPhone = formatPhone(String(phone));

      const adminApp = getAdminApp();
      const db = adminApp.firestore();

      const existing = await db.collection("consultations")
        .where("phone", "==", formattedPhone)
        .where("processed", "==", false)
        .limit(1)
        .get();

      if (!existing.empty) {
        console.log(`[Webhook] 중복 미처리 상담 존재 (phone: ${formattedPhone}), 스킵`);
        return res.status(200).json({ result: "duplicate", message: "이미 동일 연락처의 미처리 상담이 존재합니다." });
      }

      const consultationData = {
        name: String(name),
        phone: formattedPhone,
        businessName: String(businessName || ""),
        businessNumber: String(businessNumber || ""),
        businessAge: "",
        revenue: String(revenue || ""),
        region: "",
        creditScore: "",
        taxStatus: "",
        services: Array.isArray(services) ? services : ["정책자금 (융자)"],
        source: String(source || "GoogleAds_Agency_Sheet"),
        email: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false,
        linked_customer_id: null,
        note: String(note || ""),
        utm_source: String(utm_source || ""),
        utm_medium: String(utm_medium || ""),
        utm_campaign: String(utm_campaign || ""),
      };

      const docRef = await db.collection("consultations").add(consultationData);
      console.log(`[Webhook] 상담 저장 완료: ${docRef.id} (${name} / ${phone})`);

      try {
        const serviceList = Array.isArray(services) ? services : ["정책자금 (융자)"];
        const alimtalkResult = await sendConsultationAlimtalk({
          customerPhone: formattedPhone,
          customerName: String(name),
          services: serviceList,
          createdAt: new Date(),
        });
        console.log(`[Webhook] 알림톡 발송: ${alimtalkResult.message}`);
      } catch (alimtalkError: any) {
        console.error(`[Webhook] 알림톡 발송 실패 (상담 저장은 완료): ${alimtalkError.message}`);
      }

      res.status(201).json({ result: "success", id: docRef.id });
    } catch (error: any) {
      console.error("[Webhook] 상담 저장 오류:", error.message);
      res.status(500).json({ result: "error", error: error.message });
    }
  });

  app.post("/api/leave-requests/admin-create", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { user_id, user_name, team_id, team_name, leave_date, leave_type, leave_days, reason } = req.body;
      
      if (!user_id || !user_name || !leave_date || !leave_type) {
        return res.status(400).json({ error: "필수 필드가 누락되었습니다." });
      }

      const firestore = admin.firestore();

      let adminName = '관리자';
      const adminDoc = await firestore.collection('users').doc(req.user!.uid).get();
      if (adminDoc.exists) {
        adminName = adminDoc.data()?.name || req.user!.name || '관리자';
      }

      const docRef = await firestore.collection('leave_requests').add({
        user_id,
        user_name,
        team_id: team_id || '',
        team_name: team_name || '',
        leave_date,
        leave_type,
        leave_days: leave_days || (leave_type === 'full' ? 1.0 : 0.5),
        reason: reason || '관리자 등록',
        status: 'approved',
        admin_approved_by: req.user!.uid,
        admin_approved_name: adminName,
        admin_approved_at: admin.firestore.FieldValue.serverTimestamp(),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      const userRef = firestore.collection('users').doc(user_id);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const currentUsed = userDoc.data()?.usedLeave || 0;
        await userRef.update({
          usedLeave: currentUsed + (leave_days || (leave_type === 'full' ? 1.0 : 0.5)),
        });
      }

      res.json({ result: "success", id: docRef.id });
    } catch (error: any) {
      console.error("[LeaveRequest] 관리자 연차 등록 오류:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // 결제선생(PayMint) API 라우트
  // ============================================================

  app.post("/api/paymint/send", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { customer_id, customer_name, phone, contract_amount_manwon, manager_id, manager_name, expire_dt, contract_eformsign_id } = req.body;

      if (!customer_id || !customer_name || !phone || !contract_amount_manwon) {
        return res.status(400).json({ error: '필수 값이 누락되었습니다.' });
      }

      const priceWon = Math.round(contract_amount_manwon * 10000 * 1.1);
      const baseUrl = req.headers['x-forwarded-proto'] 
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `${req.protocol}://${req.headers.host}`;
      const callbackURL = `${baseUrl}/api/paymint/callback`;

      const result = await sendBill({
        productName: '경영컨설팅 계약금',
        message: `${customer_name}님, 계약금 결제 청구서입니다. (${contract_amount_manwon}만원 + VAT)`,
        memberName: customer_name,
        phone: phone.replace(/-/g, ''),
        price: priceWon,
        expireDt: expire_dt,
        callbackURL,
      });

      if (result.code !== '0000') {
        console.error(`[PayMint Send] 실패: ${result.code} - ${result.msg}`);
        return res.status(400).json({ error: result.msg, code: result.code });
      }

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const now = new Date();

      const paymentData = {
        customer_id,
        customer_name,
        bill_id: result.bill_id,
        short_url: result.shortURL || '',
        amount: priceWon,
        contract_amount_manwon,
        phone: phone.replace(/-/g, ''),
        product_name: '정책자금 컨설팅 계약금',
        message: `${customer_name}님, 계약금 결제 청구서입니다. (${contract_amount_manwon}만원 + VAT)`,
        state: 'W',
        sent_by: req.user!.uid,
        sent_by_name: req.user!.name || '',
        manager_id: manager_id || '',
        manager_name: manager_name || '',
        expire_dt: expire_dt || '',
        contract_eformsign_id: contract_eformsign_id || '',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      const docRef = await firestore.collection('payments_paymint').add(paymentData);
      console.log(`[PayMint Send] 청구서 발송 성공: bill_id=${result.bill_id}, amount=${priceWon}원, customer=${customer_name}`);

      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const memoContent = `[결제청구] 발송일: ${dateStr} | 금액: ${priceWon.toLocaleString()}원 (계약금 ${contract_amount_manwon}만원 + VAT)`;
      const memoEntry = {
        content: memoContent,
        author_id: req.user!.uid,
        author_name: req.user!.name || '시스템',
        created_at: now.toISOString(),
      };

      await firestore.collection('customers').doc(customer_id).update({
        memo_history: FieldValue.arrayUnion(memoEntry),
        recent_memo: memoContent,
        latest_memo: memoContent,
        last_memo_date: dateStr,
        updated_at: now.toISOString(),
      });

      res.json({
        result: 'success',
        payment_id: docRef.id,
        bill_id: result.bill_id,
        short_url: result.shortURL,
        amount: priceWon,
      });
    } catch (error: any) {
      console.error('[PayMint Send] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paymint/callback", async (req, res) => {
    try {
      const data = req.body as ApprovalCallbackData;
      console.log(`[PayMint Callback] bill_id=${data.bill_id}, state=${data.appr_state}`);

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const paymentsRef = firestore.collection('payments_paymint');
      const snapshot = await paymentsRef.where('bill_id', '==', data.bill_id).limit(1).get();

      if (snapshot.empty) {
        console.error(`[PayMint Callback] bill_id=${data.bill_id} 결제 기록 없음`);
        return res.json({ code: "0000", msg: "성공하였습니다." });
      }

      const paymentDoc = snapshot.docs[0];
      const paymentData = paymentDoc.data();
      const now = new Date();

      const updateData: Record<string, any> = {
        state: data.appr_state,
        appr_pay_type: data.appr_pay_type || '',
        appr_dt: data.appr_dt || '',
        appr_price: data.appr_price || '',
        appr_issuer: data.appr_issuer || '',
        appr_issuer_cd: data.appr_issuer_cd || '',
        appr_issuer_num: data.appr_issuer_num || '',
        appr_acquirer_cd: data.appr_acquirer_cd || '',
        appr_acquirer_nm: data.appr_acquirer_nm || '',
        appr_num: data.appr_num || '',
        appr_origin_num: data.appr_origin_num || '',
        appr_monthly: data.appr_monthly || '',
        appr_cash_num: data.appr_cash_num || '',
        appr_cash_trader: data.appr_cash_trader || '',
        appr_cash_issuance_number: data.appr_cash_issuance_number || '',
        updated_at: now.toISOString(),
      };

      await paymentDoc.ref.update(updateData);
      console.log(`[PayMint Callback] 결제 상태 업데이트: ${paymentDoc.id} → ${data.appr_state}`);

      if (data.appr_state === 'F') {
        const customerId = paymentData.customer_id;
        const customerRef = firestore.collection('customers').doc(customerId);
        const customerSnap = await customerRef.get();

        if (customerSnap.exists) {
          const customerData = customerSnap.data();
          const previousStatus = customerData?.status_code || '';
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

          const issuerInfo = data.appr_issuer ? ` (${data.appr_issuer})` : '';
          const memoContent = `[결제완료] 결제일: ${dateStr} | 금액: ${Number(data.appr_price || 0).toLocaleString()}원${issuerInfo} | 승인번호: ${data.appr_num || '-'}`;
          const memoEntry = {
            content: memoContent,
            author_id: 'system',
            author_name: '시스템(결제선생)',
            created_at: now.toISOString(),
          };

          await customerRef.update({
            status_code: '계약완료(선불)',
            deposit_paid_date: dateStr,
            updated_at: now.toISOString(),
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            last_memo_date: dateStr,
          });

          await firestore.collection('status_logs').add({
            customer_id: customerId,
            customer_name: paymentData.customer_name || '',
            previous_status: previousStatus,
            new_status: '계약완료(선불)',
            changed_by: 'system',
            changed_by_name: '시스템(결제선생)',
            changed_at: now.toISOString(),
            memo: `결제완료 - 자동 상태 변경 (결제금액: ${Number(data.appr_price || 0).toLocaleString()}원)`,
          });

          await firestore.collection('payments_paymint').doc(paymentDoc.id).update({
            payment_completed_notified: false,
          });

          // 재분배 풀: 임시배정 중인 고객이면 manager_id를 새 담당자로 확정 이동
          await tryConfirmRedistribution(firestore, customerId, now, '결제선생 수납완료');

          console.log(`[PayMint Callback] 고객 상태 변경: ${customerId} → 계약완료(선불)`);
        }
      }

      res.json({ code: "0000", msg: "성공하였습니다." });
    } catch (error: any) {
      console.error('[PayMint Callback] 오류:', error.message);
      res.json({ code: "0000", msg: "성공하였습니다." });
    }
  });

  app.post("/api/paymint/cancel", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { payment_id, bill_id, price } = req.body;

      if (!bill_id || !price) {
        return res.status(400).json({ error: '필수 값이 누락되었습니다.' });
      }

      const result = await cancelBill({ billId: bill_id, price: Number(price) });

      if (result.code !== '0000') {
        return res.status(400).json({ error: result.msg, code: result.code });
      }

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const now = new Date();

      if (payment_id) {
        await firestore.collection('payments_paymint').doc(payment_id).update({
          state: 'C',
          cancel_dt: result.appr_cancel_dt || now.toISOString(),
          cancel_num: result.appr_num || '',
          updated_at: now.toISOString(),
        });

        const payDoc = await firestore.collection('payments_paymint').doc(payment_id).get();
        const payData = payDoc.data();
        if (payData?.customer_id) {
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const memoContent = `[결제취소] 취소일: ${dateStr} | 금액: ${Number(price).toLocaleString()}원 | 처리자: ${req.user!.name || '관리자'}`;
          const memoEntry = {
            content: memoContent,
            author_id: req.user!.uid,
            author_name: req.user!.name || '관리자',
            created_at: now.toISOString(),
          };
          await firestore.collection('customers').doc(payData.customer_id).update({
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            updated_at: now.toISOString(),
          });
        }
      }

      console.log(`[PayMint Cancel] 결제 취소 성공: bill_id=${bill_id}`);
      res.json({ result: 'success', ...result });
    } catch (error: any) {
      console.error('[PayMint Cancel] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paymint/destroy", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { payment_id, bill_id, price } = req.body;

      if (!bill_id || !price) {
        return res.status(400).json({ error: '필수 값이 누락되었습니다.' });
      }

      const result = await destroyBill({ billId: bill_id, price: Number(price) });

      if (result.code !== '0000') {
        return res.status(400).json({ error: result.msg, code: result.code });
      }

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const now = new Date();

      if (payment_id) {
        await firestore.collection('payments_paymint').doc(payment_id).update({
          state: 'D',
          updated_at: now.toISOString(),
        });
      }

      console.log(`[PayMint Destroy] 청구서 파기 성공: bill_id=${bill_id}`);
      res.json({ result: 'success', ...result });
    } catch (error: any) {
      console.error('[PayMint Destroy] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paymint/status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { bill_id, payment_id } = req.body;

      if (!bill_id) {
        return res.status(400).json({ error: 'bill_id가 필요합니다.' });
      }

      const result = await readBill({ billId: bill_id });

      if (result.appr_state && payment_id) {
        const adminApp = getAdminApp();
        const firestore = adminApp.firestore();
        await firestore.collection('payments_paymint').doc(payment_id).update({
          state: result.appr_state,
          appr_pay_type: result.appr_pay_type || '',
          appr_dt: result.appr_dt || '',
          appr_price: result.appr_price || '',
          appr_issuer: result.appr_issuer || '',
          appr_num: result.appr_num || '',
          appr_monthly: result.appr_monthly || '',
          updated_at: new Date().toISOString(),
        });
      }

      res.json({ result: 'success', ...result });
    } catch (error: any) {
      console.error('[PayMint Status] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paymint/resend", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { bill_id } = req.body;

      if (!bill_id) {
        return res.status(400).json({ error: 'bill_id가 필요합니다.' });
      }

      const result = await resendBill({ billId: bill_id });

      if (result.code !== '0000') {
        return res.status(400).json({ error: result.msg, code: result.code });
      }

      console.log(`[PayMint Resend] 재발송 성공: bill_id=${bill_id}`);
      res.json({ result: 'success', ...result });
    } catch (error: any) {
      console.error('[PayMint Resend] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paymint/balance", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await getBalance();
      res.json(result);
    } catch (error: any) {
      console.error('[PayMint Balance] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paymint/payments", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const role = req.user!.role;
      const uid = req.user!.uid;

      const paymentsQuery = firestore.collection('payments_paymint').orderBy('created_at', 'desc');
      const snapshot = await paymentsQuery.get();

      let payments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      const customerIdFilter = req.query.customer_id as string | undefined;
      if (customerIdFilter) {
        payments = payments.filter((p: any) => p.customer_id === customerIdFilter);
      }

      const stateFilter = req.query.state as string | undefined;
      if (stateFilter) {
        payments = payments.filter((p: any) => p.state === stateFilter);
      }

      // 권한 필터를 limit보다 먼저 적용 (limit 후 권한 필터링하면 staff/team_leader가 자기 결제를 누락할 수 있음)
      if (role === 'staff') {
        payments = payments.filter((p: any) => p.manager_id === uid || p.sent_by === uid);
      } else if (role === 'team_leader') {
        const teamId = req.user!.team_id;
        if (teamId) {
          const teamSnap = await firestore.collection('teams').doc(teamId).get();
          const teamMembers = teamSnap.exists ? (teamSnap.data()?.members || []) : [];
          payments = payments.filter((p: any) => teamMembers.includes(p.manager_id) || p.sent_by === uid);
        } else {
          // team_id 누락된 team_leader는 super_admin과 동일한 노출이 발생하지 않도록 본인 발송 건만 허용 (deny-by-default)
          payments = payments.filter((p: any) => p.sent_by === uid || p.manager_id === uid);
        }
      }

      const queryLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
      if (queryLimit > 0) {
        payments = payments.slice(0, queryLimit);
      }

      res.json(payments);
    } catch (error: any) {
      console.error('[PayMint Payments] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/paymint/payments/:id", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const paymentId = req.params.id;

      const docRef = firestore.collection('payments_paymint').doc(paymentId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: '결제 내역을 찾을 수 없습니다.' });
      }

      await docRef.delete();
      console.log(`[PayMint] 결제 내역 삭제: ${paymentId} by ${req.user!.email}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[PayMint Delete] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // AI 채팅 (로컬 Ollama 연동)
  // ============================================================

  // 대화 시작/재개: 고객 ID로 기존 대화를 찾거나 새로 만든 후 conversationId 반환
  app.post("/api/ai/conversation/start", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { customerId } = req.body || {};
      if (!customerId || typeof customerId !== 'string') {
        return res.status(400).json({ error: 'customerId가 필요합니다.' });
      }

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const customerSnap = await firestore.collection('customers').doc(customerId).get();
      if (!customerSnap.exists) {
        return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
      }
      const customerData = customerSnap.data() as any;
      const customer = { id: customerSnap.id, ...customerData };

      const customerSummary = summarizeCustomer(customer);
      const systemPrompt = buildSystemPrompt(customerSummary);

      // 같은 사용자 + 같은 고객의 가장 최근 대화 재사용
      // 복합 인덱스 필요: ai_conversations (customer_id ASC, user_id ASC, updated_at DESC)
      let existingSnap;
      try {
        existingSnap = await firestore.collection('ai_conversations')
          .where('customer_id', '==', customerId)
          .where('user_id', '==', req.user!.uid)
          .orderBy('updated_at', 'desc')
          .limit(1)
          .get();
      } catch (err: any) {
        console.error('[AI] 기존 대화 조회 실패:', err?.message);
        return res.status(500).json({
          error: 'AI 대화 조회 실패. Firestore 복합 인덱스(ai_conversations: customer_id, user_id, updated_at desc)를 생성해주세요.',
          detail: err?.message,
        });
      }

      if (existingSnap && !existingSnap.empty) {
        const docRef = existingSnap.docs[0].ref;
        const existing = existingSnap.docs[0].data() as any;
        // 고객 정보가 변경됐을 수 있으므로 system prompt만 갱신
        await docRef.update({ system_prompt: systemPrompt, updated_at: new Date() });
        return res.json({
          conversationId: docRef.id,
          messages: existing.messages || [],
        });
      }

      const docRef = await firestore.collection('ai_conversations').add({
        customer_id: customerId,
        user_id: req.user!.uid,
        user_email: req.user!.email || '',
        system_prompt: systemPrompt,
        messages: [],
        created_at: new Date(),
        updated_at: new Date(),
      });

      res.json({ conversationId: docRef.id, messages: [] });
    } catch (err: any) {
      console.error('[AI Start] 오류:', err);
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // 채팅: SSE 스트리밍으로 토큰 전송, 완료 시 Firestore에 저장
  app.post("/api/ai/chat", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { conversationId, message } = req.body || {};
      if (!conversationId || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'conversationId와 message가 필요합니다.' });
      }

      const cfg = checkAiConfig();
      if (!cfg.configured) {
        return res.status(503).json({
          error: `AI 서버 미설정: ${cfg.missing.join(', ')}. Replit Secrets에 등록해주세요.`,
        });
      }

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const convRef = firestore.collection('ai_conversations').doc(conversationId);
      const convSnap = await convRef.get();
      if (!convSnap.exists) {
        return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
      }
      const conv = convSnap.data() as any;
      if (conv.user_id !== req.user!.uid) {
        return res.status(403).json({ error: '본인의 대화만 사용할 수 있습니다.' });
      }

      const userMsg = { role: 'user' as const, content: message.trim(), created_at: new Date() };
      const history = (conv.messages || []) as Array<{ role: string; content: string; created_at: any }>;
      const trimmedHistory = trimHistory(history);

      // SSE 헤더
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      (res as any).flushHeaders?.();

      const messages: ChatMessage[] = [
        { role: 'system', content: conv.system_prompt },
        ...trimmedHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: userMsg.content },
      ];

      const ac = new AbortController();
      let clientGone = false;
      req.on('close', () => { clientGone = true; ac.abort(); });

      await streamChat({
        messages,
        signal: ac.signal,
        onToken: (t) => {
          if (clientGone) return;
          res.write(`data: ${JSON.stringify({ type: 'token', token: t })}\n\n`);
        },
        onDone: async (fullText) => {
          // 트랜잭션으로 동시성 안전하게 메시지 append (last-write-wins 방지)
          try {
            await firestore.runTransaction(async (tx) => {
              const fresh = await tx.get(convRef);
              if (!fresh.exists) throw new Error('대화가 삭제되었습니다.');
              const freshData = fresh.data() as any;
              const freshMessages = (freshData.messages || []) as any[];
              const assistantMsg = { role: 'assistant', content: fullText, created_at: new Date() };
              tx.update(convRef, {
                messages: [...freshMessages, userMsg, assistantMsg],
                updated_at: new Date(),
              });
            });
            if (!clientGone) {
              res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
              res.end();
            }
          } catch (saveErr: any) {
            console.error('[AI Chat] 저장 실패:', saveErr);
            if (!clientGone) {
              res.write(`data: ${JSON.stringify({ type: 'error', error: `저장 실패: ${saveErr?.message || saveErr}` })}\n\n`);
              res.end();
            }
          }
        },
        onError: (err) => {
          console.error('[AI Chat] 스트리밍 오류:', err);
          try {
            res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
          } catch {}
          res.end();
        },
      });
    } catch (err: any) {
      console.error('[AI Chat] 오류:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || String(err) });
      } else {
        try {
          res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || String(err) })}\n\n`);
        } catch {}
        res.end();
      }
    }
  });

  // 대화 초기화 (해당 고객+사용자 대화 삭제 후 새로 시작)
  app.delete("/api/ai/conversation/:conversationId", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { conversationId } = req.params;
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const docRef = firestore.collection('ai_conversations').doc(conversationId);
      const snap = await docRef.get();
      if (!snap.exists) return res.status(404).json({ error: '대화 없음' });
      const data = snap.data() as any;
      if (data.user_id !== req.user!.uid) {
        return res.status(403).json({ error: '본인의 대화만 삭제 가능합니다.' });
      }
      await docRef.delete();
      res.json({ success: true });
    } catch (err: any) {
      console.error('[AI Delete] 오류:', err);
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // 자동 자금 예측 (3종 OCR + 신용점수 완료 시 호출 → AI 메모로 저장)
  // ⚡ AI 호출이 60초+ 걸릴 수 있어 fire-and-forget 패턴으로 처리.
  //    검증 후 즉시 202 응답 → 백그라운드에서 AI 호출 + 트랜잭션 + 메모/로그 저장.
  //    클라이언트는 counseling_logs onSnapshot으로 완료 시 자동 반영됨.
  const aiPredictInFlight = new Set<string>(); // 서버 메모리 lock (customerId)
  app.post("/api/ai/predict-funding", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { customerId, force } = req.body || {};
      if (!customerId) return res.status(400).json({ error: 'customerId 필수' });

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const customerRef = firestore.collection('customers').doc(customerId);
      const snap = await customerRef.get();
      if (!snap.exists) return res.status(404).json({ error: '고객 없음' });
      const customer: any = { id: customerId, ...(snap.data() as any) };

      // ===== RBAC =====
      const userRole = req.user?.role || 'staff';
      const userUid = req.user?.uid || '';
      const userTeamId = (req.user as any)?.team_id || '';
      if (userRole !== 'super_admin') {
        if (userRole === 'team_leader') {
          if (!userTeamId || customer.team_id !== userTeamId) {
            return res.status(403).json({ error: '해당 고객 접근 권한 없음' });
          }
        } else {
          if (customer.manager_id !== userUid) {
            return res.status(403).json({ error: '본인 담당 고객만 분석 가능합니다.' });
          }
        }
      }

      // ===== 4조건 검증 =====
      const hasCredit = Number(customer.credit_score) > 0;
      const hasBiz = !!customer.business_registration_number;
      const hasSales =
        Number(customer.recent_sales) > 0 ||
        Number(customer.sales_y1) > 0 ||
        Number(customer.sales_y2) > 0 ||
        Number(customer.sales_y3) > 0;
      const hasObligations = Array.isArray(customer.financial_obligations) && customer.financial_obligations.length > 0;
      if (!(hasCredit && hasBiz && hasSales && hasObligations)) {
        return res.status(400).json({ error: '필수 정보 부족 (신용점수/사업자등록/매출/신용공여)' });
      }

      // ===== 시그니처 =====
      const obligationsForSig = (customer.financial_obligations || []).map((o: any) => ({
        t: o.type, i: o.institution, p: o.product_name, a: o.account_type,
        b: o.balance, oc: o.occurred_at, m: o.maturity_date,
      }));
      const signature = JSON.stringify({
        cs: customer.credit_score,
        brn: customer.business_registration_number,
        s: [customer.recent_sales, customer.sales_y1, customer.sales_y2, customer.sales_y3],
        ob: obligationsForSig,
      });
      if (customer.ai_funding_prediction_signature === signature && !force) {
        return res.json({ skipped: true, reason: '동일 데이터로 이미 분석됨' });
      }
      if (aiPredictInFlight.has(customerId)) {
        return res.json({ skipped: true, reason: '이미 백그라운드에서 분석 중' });
      }

      aiPredictInFlight.add(customerId);
      // ⚡ 즉시 응답 (백그라운드 처리)
      res.status(202).json({ accepted: true, message: 'AI 분석을 백그라운드에서 진행합니다. 완료되면 AI 채팅 탭에 자동 표시됩니다.' });

      // ===== 백그라운드 처리 =====
      const triggerUid = userUid;
      const triggerEmail = req.user?.email || '';
      (async () => {
        const startedAt = Date.now();
        try {
          console.log(`[AI Predict BG] 시작: customer=${customerId}, user=${triggerUid}`);
          const content = await predictFunding(customer);
          if (!content) throw new Error('AI 응답 비어있음');

          const now = admin.firestore.Timestamp.now();
          const assistantMsg = {
            role: 'assistant' as const,
            content: `[AI 자동 자금 예측]\n\n${content}`,
            created_at: now.toDate(),
          };

          // ===== 트리거한 사용자의 ai_conversations에 메시지 append =====
          //   - 기존 대화가 있으면 가장 최근 것을 사용
          //   - 없으면 새로 생성 (system_prompt는 채팅 시작 시 갱신되므로 최소값)
          const customerSummary = summarizeCustomer(customer);
          const systemPrompt = buildSystemPrompt(customerSummary);

          let convRef: FirebaseFirestore.DocumentReference;
          try {
            const existingSnap = await firestore.collection('ai_conversations')
              .where('customer_id', '==', customerId)
              .where('user_id', '==', triggerUid)
              .orderBy('updated_at', 'desc')
              .limit(1)
              .get();
            if (!existingSnap.empty) {
              convRef = existingSnap.docs[0].ref;
            } else {
              convRef = await firestore.collection('ai_conversations').add({
                customer_id: customerId,
                user_id: triggerUid,
                user_email: triggerEmail,
                system_prompt: systemPrompt,
                messages: [],
                created_at: now.toDate(),
                updated_at: now.toDate(),
              });
            }
          } catch (convErr: any) {
            // 인덱스 누락 등 — 그래도 새 대화로 생성
            console.warn('[AI Predict BG] 기존 대화 조회 실패, 신규 생성:', convErr?.message);
            convRef = await firestore.collection('ai_conversations').add({
              customer_id: customerId,
              user_id: triggerUid,
              user_email: triggerEmail,
              system_prompt: systemPrompt,
              messages: [],
              created_at: now.toDate(),
              updated_at: now.toDate(),
            });
          }

          // ===== 트랜잭션: 대화 메시지 append + 고객 시그니처 compare-and-set =====
          const txResult = await firestore.runTransaction(async (tx) => {
            const freshCust = await tx.get(customerRef);
            if (!freshCust.exists) throw new Error('고객이 삭제됨');
            const custData: any = freshCust.data();
            if (custData.ai_funding_prediction_signature === signature && !force) {
              return { skipped: true as const };
            }
            const freshConv = await tx.get(convRef);
            const convData: any = freshConv.exists ? freshConv.data() : { messages: [] };
            const freshMessages = Array.isArray(convData.messages) ? convData.messages : [];
            tx.set(convRef, {
              messages: [...freshMessages, assistantMsg],
              updated_at: now.toDate(),
            }, { merge: true });
            tx.update(customerRef, {
              ai_funding_prediction_signature: signature,
              ai_funding_prediction_at: now,
              updated_at: now,
            });
            return { skipped: false as const };
          });

          if (txResult.skipped) {
            console.log(`[AI Predict BG] 스킵(트랜잭션 시점에 이미 처리됨): customer=${customerId}`);
          } else {
            console.log(`[AI Predict BG] 완료: customer=${customerId}, conv=${convRef.id}, 소요=${Date.now() - startedAt}ms`);
          }
        } catch (err: any) {
          console.error(`[AI Predict BG] 실패: customer=${customerId}, 소요=${Date.now() - startedAt}ms,`, err?.message || err);
        } finally {
          aiPredictInFlight.delete(customerId);
        }
      })();
    } catch (err: any) {
      console.error('[AI Predict] 라우트 오류:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || String(err) });
      }
    }
  });

  // AI 설정 상태 확인 (디버깅용)
  app.get("/api/ai/status", requireAuth, requireSuperAdmin, async (_req, res) => {
    const cfg = checkAiConfig();
    const gongmun = loadGongmunContext();
    res.json({
      configured: cfg.configured,
      missing: cfg.missing,
      gongmun_loaded_chars: gongmun.length,
      model: process.env.OLLAMA_MODEL || 'qwen2.5:14b-instruct (default)',
    });
  });

  // =========================================================================
  // 재분배 풀 (공동영업 풀) API
  // =========================================================================

  // 계약완료/집행완료/터미널 등 풀에서 제외할 상태
  const REDISTRIBUTION_EXCLUDED_STATUSES = new Set<string>([
    '쓰레기통','단박거절','본인아님','사업자아님','정부기관 오인','기타자금 오인',
    '인증불가','불가업종','매출없음','신용점수 미달','차입금초과','세금체납',
    '이중계약','거절사유 미파악','정체성 의심','잘못 신청',
    '계약완료','계약완료(선불)','계약완료(후불)','계약완료(외주)','계약완료(채무조정)',
    '집행완료','집행완료(선불)','집행완료(후불)','집행완료(외주)','집행완료(채무조정)',
    '최종부결','민원처리',
  ]);

  // GET /api/redistribution-pool — 14일 경과 미수납 건 목록 (모든 로그인 사용자)
  app.get("/api/redistribution-pool", requireAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const nowMs = Date.now();
      const cutoffMs = nowMs - REDISTRIBUTION_TRIGGER_DAYS * 24 * 60 * 60 * 1000;

      const [contractsSnap, paymentsSnap] = await Promise.all([
        firestore.collection('contracts_eformsign')
          .where('status', 'in', ['발송완료', '서명대기', '작성완료', '수납대기'])
          .get(),
        firestore.collection('payments_paymint').where('state', '==', 'W').get(),
      ]);

      type Trig = { sourceType: 'contract' | 'paymint'; sourceId: string; sentAtMs: number; sentAt: string; templateName?: string; amountManWon?: number };
      const triggerByCust = new Map<string, Trig>();

      for (const doc of contractsSnap.docs) {
        const d = doc.data() as any;
        const cid = String(d.customer_id || '');
        if (!cid) continue;
        const sentAtRaw = d.sent_at || d.created_at;
        if (!sentAtRaw) continue;
        const sentMs = Date.parse(String(sentAtRaw));
        if (isNaN(sentMs) || sentMs > cutoffMs) continue;
        const existing = triggerByCust.get(cid);
        if (!existing || sentMs < existing.sentAtMs) {
          triggerByCust.set(cid, {
            sourceType: 'contract',
            sourceId: doc.id,
            sentAtMs: sentMs,
            sentAt: String(sentAtRaw),
            templateName: d.template_name,
            amountManWon: d.amount_man_won,
          });
        }
      }
      for (const doc of paymentsSnap.docs) {
        const d = doc.data() as any;
        const cid = String(d.customer_id || '');
        if (!cid) continue;
        const sentAtRaw = d.created_at;
        if (!sentAtRaw) continue;
        const sentMs = Date.parse(String(sentAtRaw));
        if (isNaN(sentMs) || sentMs > cutoffMs) continue;
        const existing = triggerByCust.get(cid);
        if (!existing || sentMs < existing.sentAtMs) {
          triggerByCust.set(cid, {
            sourceType: 'paymint',
            sourceId: doc.id,
            sentAtMs: sentMs,
            sentAt: String(sentAtRaw),
            amountManWon: d.contract_amount_manwon || d.amount_manwon,
          });
        }
      }

      const cids = Array.from(triggerByCust.keys());
      if (cids.length === 0) return res.json({ success: true, count: 0, items: [] });

      // Firestore documentId IN 쿼리는 10개 제한 → batch
      const customerDocs: FirebaseFirestore.DocumentSnapshot[] = [];
      const BATCH = 30;
      for (let i = 0; i < cids.length; i += BATCH) {
        const slice = cids.slice(i, i + BATCH);
        const docs = await firestore.getAll(...slice.map(id => firestore.collection('customers').doc(id)));
        customerDocs.push(...docs);
      }

      const items: any[] = [];
      for (let i = 0; i < customerDocs.length; i++) {
        const cd = customerDocs[i];
        if (!cd.exists) continue;
        const c = cd.data() as any;
        const status = String(c.status_code || '');
        if (REDISTRIBUTION_EXCLUDED_STATUSES.has(status)) continue;
        const trig = triggerByCust.get(cids[i])!;

        let tempAssignment = c.temp_assignment;
        if (tempAssignment && tempAssignment.expires_at) {
          const exp = Date.parse(String(tempAssignment.expires_at));
          if (isNaN(exp) || exp < nowMs) tempAssignment = null;
        }

        items.push({
          customer_id: cids[i],
          customer_name: c.name || '',
          company_name: c.company_name || '',
          readable_id: c.readable_id || '',
          phone: c.phone || '',
          current_status: status,
          original_manager_id: c.manager_id || '',
          original_manager_name: c.manager_name || '',
          team_id: c.team_id || '',
          team_name: c.team_name || '',
          trigger: {
            type: trig.sourceType,
            sent_at: trig.sentAt,
            days_since: Math.floor((nowMs - trig.sentAtMs) / 86400000),
            template_name: trig.templateName || null,
            amount_man_won: trig.amountManWon || null,
          },
          temp_assignment: tempAssignment || null,
        });
      }

      // 임시배정 없는 건 우선 → 가장 오래된 트리거 순
      items.sort((a, b) => {
        const aLocked = a.temp_assignment ? 1 : 0;
        const bLocked = b.temp_assignment ? 1 : 0;
        if (aLocked !== bLocked) return aLocked - bLocked;
        return b.trigger.days_since - a.trigger.days_since;
      });

      res.json({ success: true, count: items.length, items });
    } catch (error: any) {
      console.error('[/api/redistribution-pool] 실패:', error?.message || error);
      res.status(500).json({ success: false, error: error?.message || '풀 조회 실패' });
    }
  });

  // POST /api/redistribution-pool/pickup/:customerId — 임시배정 (트랜잭션 잠금)
  app.post("/api/redistribution-pool/pickup/:customerId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ success: false, error: '인증 필요' });
      const { customerId } = req.params;
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const now = new Date();
      const nowMs = now.getTime();

      const customerRef = firestore.collection('customers').doc(customerId);

      const result = await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(customerRef);
        if (!snap.exists) throw new Error('고객을 찾을 수 없습니다.');
        const c = snap.data() as any;

        if (REDISTRIBUTION_EXCLUDED_STATUSES.has(String(c.status_code || ''))) {
          throw new Error('해당 고객은 이미 종결된 상태입니다.');
        }

        const ta = c.temp_assignment;
        if (ta && ta.picker_uid) {
          const exp = ta.expires_at ? Date.parse(String(ta.expires_at)) : 0;
          if (exp && exp >= nowMs && ta.picker_uid !== uid) {
            throw new Error(`이미 ${ta.picker_name || '다른 직원'}님이 임시배정 중입니다.`);
          }
        }

        const newAssignment = {
          picker_uid: uid,
          picker_name: req.user?.name || '',
          picked_at: now.toISOString(),
          expires_at: new Date(nowMs + TEMP_ASSIGNMENT_DURATION_MS).toISOString(),
          original_manager_id: c.manager_id || '',
          original_manager_name: c.manager_name || '',
        };

        const memoContent = `[재분배 임시배정] ${req.user?.name || ''}님이 픽업 (D-3, 만료: ${newAssignment.expires_at.slice(0, 10)})`;
        const memoEntry = {
          content: memoContent,
          author_id: 'system',
          author_name: '시스템(재분배)',
          created_at: now.toISOString(),
        };

        tx.update(customerRef, {
          temp_assignment: newAssignment,
          memo_history: FieldValue.arrayUnion(memoEntry),
          recent_memo: memoContent,
          latest_memo: memoContent,
          last_memo_date: now.toISOString(),
          updated_at: now.toISOString(),
        });

        return { newAssignment };
      });

      await firestore.collection('redistribution_logs').add({
        customer_id: customerId,
        action: 'pickup',
        picker_uid: uid,
        picker_name: req.user?.name || '',
        original_manager_id: result.newAssignment.original_manager_id,
        original_manager_name: result.newAssignment.original_manager_name,
        picked_at: result.newAssignment.picked_at,
        expires_at: result.newAssignment.expires_at,
      });

      res.json({ success: true, temp_assignment: result.newAssignment });
    } catch (error: any) {
      console.error('[/api/redistribution-pool/pickup] 실패:', error?.message || error);
      res.status(400).json({ success: false, error: error?.message || '픽업 실패' });
    }
  });

  // POST /api/redistribution-pool/release/:customerId — 임시배정 해제 (본인 또는 super_admin)
  app.post("/api/redistribution-pool/release/:customerId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ success: false, error: '인증 필요' });
      const role = (req.user as any)?.role || '';
      const { customerId } = req.params;
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const now = new Date();

      const customerRef = firestore.collection('customers').doc(customerId);
      const snap = await customerRef.get();
      if (!snap.exists) return res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' });
      const c = snap.data() as any;
      const ta = c.temp_assignment;
      if (!ta || !ta.picker_uid) {
        return res.json({ success: true, message: '이미 임시배정이 없습니다.' });
      }
      if (ta.picker_uid !== uid && role !== 'super_admin') {
        return res.status(403).json({ success: false, error: '본인 임시배정만 해제할 수 있습니다.' });
      }

      const memoContent = `[재분배 임시배정 해제] ${ta.picker_name || ''}님의 임시배정 해제 (해제자: ${req.user?.name || ''})`;
      const memoEntry = {
        content: memoContent,
        author_id: 'system',
        author_name: '시스템(재분배)',
        created_at: now.toISOString(),
      };

      await customerRef.update({
        temp_assignment: FieldValue.delete(),
        memo_history: FieldValue.arrayUnion(memoEntry),
        recent_memo: memoContent,
        latest_memo: memoContent,
        last_memo_date: now.toISOString(),
        updated_at: now.toISOString(),
      });

      await firestore.collection('redistribution_logs').add({
        customer_id: customerId,
        action: 'release',
        released_by_uid: uid,
        released_by_name: req.user?.name || '',
        picker_uid: ta.picker_uid,
        picker_name: ta.picker_name,
        released_at: now.toISOString(),
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('[/api/redistribution-pool/release] 실패:', error?.message || error);
      res.status(500).json({ success: false, error: error?.message || '해제 실패' });
    }
  });

  return httpServer;
}
