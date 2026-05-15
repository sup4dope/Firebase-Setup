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
  const rawList: any[] = Array.isArray(data?.predictions) ? data.predictions : [];
  // 필드명/스케일 정규화 (업스트림 스키마 변동 대응)
  const predictions: MlPredictionItem[] = rawList.map((r: any) => {
    const org = r.org ?? r.organization ?? r.institution ?? r.fund ?? r.fund_name ?? "(미상)";
    let prob: number | undefined =
      r.approval_probability ?? r.approvalProbability ?? r.probability ??
      r.approval_rate ?? r.approvalRate ?? r.prob;
    if (typeof prob === "number" && prob > 1.5) prob = prob / 100; // 0~100 스케일이면 0~1로 변환
    const expected = r.expected_amount ?? r.expectedAmount ?? r.predicted_amount ?? r.predictedAmount ?? r.amount;
    const range = r.amount_range ?? r.range ?? null;
    const low = range?.low ?? r.amount_low ?? r.amountLow ?? r.low ?? r.lower;
    const high = range?.high ?? r.amount_high ?? r.amountHigh ?? r.high ?? r.upper;
    const cases = r.similar_cases ?? r.similarCases ?? r.neighbors ?? r.cases ?? [];
    return {
      ...r,
      org,
      approval_probability: prob,
      expected_amount: expected,
      amount_range: (low != null || high != null) ? { low, high } : null,
      amount_low: low,
      amount_high: high,
      similar_cases: Array.isArray(cases) ? cases : [],
    };
  });
  return { success: true, predictions, raw: json.data };
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
