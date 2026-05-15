import { authFetch } from '@/lib/firebase';

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
}

function parseFirestoreDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  if (v._seconds !== undefined) return new Date(v._seconds * 1000);
  if (v.seconds !== undefined) return new Date(v.seconds * 1000);
  return new Date();
}

export async function startAIConversation(customerId: string): Promise<{
  conversationId: string;
  messages: AIChatMessage[];
}> {
  const res = await authFetch('/api/ai/conversation/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `대화 시작 실패 (${res.status})`);
  }
  const json = await res.json();
  const messages: AIChatMessage[] = (json.messages || []).map(
    (m: any, i: number) => ({
      id: `hist_${i}_${Date.now()}`,
      role: m.role,
      content: m.content,
      created_at: parseFirestoreDate(m.created_at),
    }),
  );
  return { conversationId: json.conversationId, messages };
}

export interface StreamAIChatOptions {
  conversationId: string;
  message: string;
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}

export async function predictFunding(
  customerId: string,
  opts?: { force?: boolean; signal?: AbortSignal },
): Promise<{
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  logSaved?: boolean;
  memo?: { id: string; content: string; author_name: string; created_at: string };
}> {
  const res = await authFetch('/api/ai/predict-funding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, force: !!opts?.force }),
    signal: opts?.signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `자금 예측 실패 (${res.status})`);
  }
  return res.json();
}

// ML 한도 예측 (yieumapi.co.kr/predict 프록시)
export interface MlPredictionItem {
  org: string;
  approval_probability?: number;        // 0~1
  expected_amount?: number;             // 만원
  amount_range?: { low?: number; high?: number } | null;
  amount_low?: number;                  // 변형 대응
  amount_high?: number;
  basis?: string;                       // 예상한도 산출 근거
  avg_approval_rate?: number;           // 자금별 평균 승인률 (베이스라인)
  meta?: { ml_AUC?: number; ml_사용?: boolean; ml_학습건수?: number; 고객_NCB구간?: string; 고객_업력구간?: string; [k: string]: any } | null;
  similar_cases?: Array<{
    customer_id?: string;
    applied_amount?: number;
    approved_amount?: number;
    execution_amount?: number;
    status?: string;
    org?: string;
    similarity?: number;
    [k: string]: any;
  }>;
  [k: string]: any;
}

export async function mlPredictFunding(customerId: string): Promise<{
  success: boolean;
  predictions: MlPredictionItem[];
  raw?: any;
  logId?: string | null;
}> {
  const res = await authFetch(`/api/ml-predict/${encodeURIComponent(customerId)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `예측 호출 실패 (${res.status})`);
  }
  // 응답 언랩: {data:{predictions:[...]}} / {data:[...]} 변형 대응
  let data = json.data;
  for (let i = 0; i < 3 && data && typeof data === "object"; i++) {
    if (Array.isArray(data?.predictions)) break;
    if (Array.isArray(data)) { data = { predictions: data }; break; }
    if (data.data && typeof data.data === "object") { data = data.data; continue; }
    if (data.result && typeof data.result === "object") { data = data.result; continue; }
    break;
  }
  const rawList: any[] = Array.isArray(data?.predictions) ? data.predictions : Array.isArray(data?.예측) ? data.예측 : [];
  // 필드명/스케일 정규화 (업스트림 스키마 변동 대응 — 영/한글 키 모두 지원)
  const predictions: MlPredictionItem[] = rawList.map((r: any) => {
    const org = r.org ?? r.organization ?? r.institution ?? r.fund ?? r.fund_name ?? r.자금 ?? r.자금종류 ?? "(미상)";
    let prob: number | undefined =
      r.approval_probability ?? r.approvalProbability ?? r.probability ??
      r.approval_rate ?? r.approvalRate ?? r.prob ?? r.승인확률;
    if (typeof prob === "number" && prob > 1.5) prob = prob / 100;
    // 예상한도: 객체({중앙값, 범위:[low,high], 근거}) 또는 단순 숫자 모두 지원
    const expectedRaw = r.expected_amount ?? r.expectedAmount ?? r.predicted_amount ?? r.predictedAmount ?? r.amount ?? r.예상한도;
    let expected: number | undefined;
    let low: number | undefined;
    let high: number | undefined;
    let basis: string | undefined;
    if (expectedRaw && typeof expectedRaw === "object") {
      expected = expectedRaw.중앙값 ?? expectedRaw.median ?? expectedRaw.value ?? expectedRaw.amount;
      const rng = expectedRaw.범위 ?? expectedRaw.range;
      if (Array.isArray(rng) && rng.length >= 2) { low = rng[0]; high = rng[1]; }
      else if (rng && typeof rng === "object") { low = rng.low ?? rng[0]; high = rng.high ?? rng[1]; }
      basis = expectedRaw.근거 ?? expectedRaw.basis;
    } else if (typeof expectedRaw === "number") {
      expected = expectedRaw;
    }
    if (low == null) low = r.amount_low ?? r.amountLow ?? r.low ?? r.lower ?? r.amount_range?.low;
    if (high == null) high = r.amount_high ?? r.amountHigh ?? r.high ?? r.upper ?? r.amount_range?.high;
    const casesRaw = r.similar_cases ?? r.similarCases ?? r.neighbors ?? r.cases ?? r.유사_케이스 ?? r["유사_케이스"] ?? [];
    const similar_cases = (Array.isArray(casesRaw) ? casesRaw : []).map((c: any) => ({
      ...c,
      customer_id: c.customer_id ?? c.id,
      approved_amount: c.approved_amount ?? c.execution_amount ?? c.승인한도,
      applied_amount: c.applied_amount ?? c.신청한도,
      similarity: c.similarity ?? c.similarityScore ?? c.유사도점수,
      org: c.org ?? c.자금종류,
      status: c.status ?? c.상태,
    }));
    return {
      ...r,
      org,
      approval_probability: prob,
      expected_amount: expected,
      amount_range: (low != null || high != null) ? { low, high } : null,
      amount_low: low,
      amount_high: high,
      basis,
      avg_approval_rate: r.자금_평균_승인률 ?? r.avg_approval_rate ?? r.fund_avg_approval_rate,
      meta: r._meta ?? r.meta ?? null,
      similar_cases,
    };
  });
  return { success: true, predictions, raw: json.data, logId: json.log_id ?? null };
}

// 예측 로그 PATCH (행동 추적/최종 결과 기록) — 컨설턴트 행동 기반 implicit feedback
export async function patchPredictLog(
  logId: string,
  body: { taken_action?: string; final_status?: string; final_amount_10k?: number | null; rejection_reason?: string | null },
): Promise<{ success: boolean }> {
  const res = await authFetch(`/api/admin/predict-logs/${encodeURIComponent(logId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) throw new Error(json?.error || `predict-log PATCH 실패 (${res.status})`);
  return { success: true };
}

// 고객별 최신 예측 로그 PATCH — 상태 변경 자동 동기화용 (404는 정상 케이스로 무시)
export async function patchPredictLogByCustomer(
  customerId: string,
  body: { taken_action?: string; final_status?: string; final_amount_10k?: number | null; rejection_reason?: string | null },
): Promise<{ success: boolean; skipped?: boolean }> {
  const res = await authFetch(`/api/admin/predict-logs/by-customer/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 404) return { success: true, skipped: true };
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) throw new Error(json?.error || `predict-log by-customer PATCH 실패 (${res.status})`);
  return { success: true };
}

export async function streamAIChat(opts: StreamAIChatOptions): Promise<void> {
  let res: Response;
  try {
    res = await authFetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: opts.conversationId,
        message: opts.message,
      }),
      signal: opts.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError' || opts.signal?.aborted) return; // 의도적 취소는 무시
    opts.onError(new Error(err?.message || '네트워크 오류'));
    return;
  }
  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({ error: `${res.status}` }));
    opts.onError(new Error(errBody.error || `AI 호출 실패 (${res.status})`));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const evt of events) {
        const line = evt.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        try {
          const parsed = JSON.parse(line.slice(5).trim());
          if (parsed.type === 'token') opts.onToken(parsed.token);
          else if (parsed.type === 'done') opts.onDone();
          else if (parsed.type === 'error')
            opts.onError(new Error(parsed.error));
        } catch {
          // ignore malformed event
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || opts.signal?.aborted) return; // 의도적 취소는 무시 (BodyStreamBuffer was aborted 등)
    opts.onError(new Error(err?.message || '스트리밍 오류'));
  }
}
