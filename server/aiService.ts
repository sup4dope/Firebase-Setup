import fs from 'fs';
import path from 'path';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || '';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:14b-instruct';
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 32768);

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const GONGMUN_DIR = path.join(process.cwd(), 'server', 'data', 'gongmun');
const CACHE_TTL_MS = 60_000;

let cachedGongmun: string | null = null;
let cachedAt = 0;

export function loadGongmunContext(force = false): string {
  const now = Date.now();
  if (!force && cachedGongmun !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedGongmun;
  }
  try {
    if (!fs.existsSync(GONGMUN_DIR)) {
      cachedGongmun = '';
      cachedAt = now;
      return '';
    }
    const files = fs
      .readdirSync(GONGMUN_DIR)
      .filter((f) => /\.(txt|md)$/i.test(f) && !/^README/i.test(f))
      .sort();
    const parts: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(path.join(GONGMUN_DIR, f), 'utf-8');
      parts.push(`### 공문: ${f}\n\n${content.trim()}`);
    }
    cachedGongmun = parts.join('\n\n---\n\n');
    cachedAt = now;
    return cachedGongmun;
  } catch (err) {
    console.error('[AI] 공문 로딩 실패:', err);
    cachedGongmun = '';
    cachedAt = now;
    return '';
  }
}

// 사용자 요구사항: 등록된 모든 고객 정보를 그대로 전달.
// (값이 null/빈 문자열/빈 배열인 필드는 토큰만 낭비하므로 제외하되, 그 외 모든 키는 유지)
export function summarizeCustomer(customer: any): string {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(customer || {})) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    cleaned[k] = v;
  }
  return '```json\n' + JSON.stringify(cleaned, null, 2) + '\n```';
}

// 컨텍스트 한도를 넘지 않도록 최근 N턴(N*2 메시지)만 전송
const MAX_HISTORY_TURNS = 20;
export function trimHistory<T>(history: T[]): T[] {
  const max = MAX_HISTORY_TURNS * 2;
  if (history.length <= max) return history;
  return history.slice(history.length - max);
}

export function buildSystemPrompt(customerSummary: string): string {
  const gongmun = loadGongmunContext();
  return `당신은 한국 정책자금 컨설팅 전문가 AI입니다. 아래 "고객 정보"와 "정책자금 공문"만을 근거로 다음 두 가지 역할을 수행합니다.

[역할]
1. 이 고객이 신청 가능한 정책자금을 공문에서 찾아 예측합니다 (공문에 없는 자금은 절대 추측하지 마세요).
2. 공문 내용에 대한 질의응답에 정확하게 답변합니다 (모르는 내용은 "공문에 명시되지 않음"이라고 답하세요).

[답변 규칙]
- 한국어로 답변합니다.
- 추천/판단의 근거가 되는 공문명·항목을 함께 표기합니다 (예: "○○자금 공고 제3조 가목").
- 자격요건이 모호하거나 정보 부족 시 "추가 확인 필요"로 명시합니다.
- 표·금액은 숫자를 정확히 표기합니다.

==================== 고객 정보 ====================
${customerSummary}

==================== 정책자금 공문 ====================
${gongmun || '※ 등록된 공문이 없습니다. 일반적인 정책자금 지식 범위에서만 답변하세요.'}
==================================================`;
}

export interface OllamaChatOptions {
  messages: ChatMessage[];
  onToken: (token: string) => void;
  onDone: (fullText: string) => Promise<void> | void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}

export async function streamChat(opts: OllamaChatOptions): Promise<void> {
  if (!OLLAMA_BASE_URL) {
    opts.onError(new Error('OLLAMA_BASE_URL이 설정되지 않았습니다.'));
    return;
  }
  const url = `${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OLLAMA_API_KEY) headers.Authorization = `Bearer ${OLLAMA_API_KEY}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: opts.messages,
        stream: true,
        // thinking 모델(qwen3, deepseek-r1 등)의 reasoning은 숨기고 최종 답변만 스트리밍
        think: false,
        options: { num_ctx: OLLAMA_NUM_CTX },
      }),
      signal: opts.signal,
    });
  } catch (err: any) {
    opts.onError(new Error(`AI 서버 연결 실패: ${err?.message || err}`));
    return;
  }

  if (!response.ok || !response.body) {
    const txt = await response.text().catch(() => '');
    opts.onError(new Error(`AI 서버 오류 (${response.status}): ${txt.slice(0, 300)}`));
    return;
  }

  const reader = (response.body as any).getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const token: string | undefined = parsed?.message?.content;
          if (token) {
            full += token;
            opts.onToken(token);
          }
          if (parsed?.error) {
            opts.onError(new Error(`AI 모델 오류: ${parsed.error}`));
            return;
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    }
    await opts.onDone(full);
  } catch (err: any) {
    opts.onError(new Error(`AI 응답 스트리밍 오류: ${err?.message || err}`));
  }
}

// 자금 예측 전용 — 핵심 필드만 한국어 텍스트로 정리 (JSON 덤프 방지)
function summarizeCustomerForPredict(c: any): string {
  const lines: string[] = [];
  const push = (label: string, val: any) => {
    if (val === null || val === undefined) return;
    if (typeof val === 'string' && !val.trim()) return;
    if (typeof val === 'number' && val === 0) return;
    lines.push(`- ${label}: ${val}`);
  };
  push('업종', c.business_type);
  push('업태/품목', c.business_item);
  push('설립일', c.founding_date);
  push('업력 7년 이상', c.over_7_years ? '예' : '아니오');
  push('재도전 유형', c.retry_type && c.retry_type !== '해당없음' ? c.retry_type : null);
  push('혁신 유형', c.innovation_type && c.innovation_type !== '해당없음' ? c.innovation_type : null);
  push('신용점수', c.credit_score);
  push('최근 매출(억)', c.recent_sales);
  push('1년전 매출(억)', c.sales_y1);
  push('2년전 매출(억)', c.sales_y2);
  push('3년전 매출(억)', c.sales_y3);
  push('사업장 소재지', c.business_address);
  push('사업장 자가소유', c.is_business_owned ? '자가' : '임차');

  const obs = Array.isArray(c.financial_obligations) ? c.financial_obligations : [];
  if (obs.length > 0) {
    lines.push('- 신용공여(채무) 내역:');
    for (const o of obs) {
      const t = o.type === 'guarantee' ? '보증' : '대출';
      const bal = o.balance ? `${(o.balance / 10000).toLocaleString()}만원` : '잔액미상';
      lines.push(
        `  · [${t}] ${o.institution || ''} / ${o.product_name || ''} / ${o.account_type || ''} / 잔액 ${bal} / 발생 ${o.occurred_at || '?'} ~ 만기 ${o.maturity_date || '?'}`
      );
    }
    const total = obs.reduce((s: number, o: any) => s + (Number(o.balance) || 0), 0);
    lines.push(`- 채무 총액: ${(total / 10000).toLocaleString()}만원 (${obs.length}건)`);
  }
  return lines.join('\n');
}

// ===== 자동 자금 예측 (비스트리밍, 1회 호출) =====
export async function predictFunding(customer: any, signal?: AbortSignal): Promise<string> {
  if (!OLLAMA_BASE_URL) throw new Error('OLLAMA_BASE_URL이 설정되지 않았습니다.');
  const url = `${OLLAMA_BASE_URL.replace(/\/$/, '')}/api/chat`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OLLAMA_API_KEY) headers.Authorization = `Bearer ${OLLAMA_API_KEY}`;

  const summary = summarizeCustomerForPredict(customer);
  const gongmun = loadGongmunContext();

  const system = `당신은 한국 정책자금 컨설팅 전문가 AI입니다. 아래 "정책자금 공문"만을 근거로 이 고객이 신청 가능한 정책자금을 가려냅니다.

[출력 규칙 — 매우 중요]
- 공문에 명시된 자금만 추천하세요. 공문에 없는 자금은 절대 언급하지 마세요.
- 설명, 근거, 표, 서론·결론은 모두 생략하세요.
- 오직 아래 형식의 키워드 리스트만 출력하세요:

[가능]
- 자금명1
- 자금명2
...

[조건부]
- 자금명 (한 줄 사유, 20자 이내)
...

[불가]
- 자금명 (한 줄 사유, 20자 이내)
...

- 자금명은 공문상의 정식 명칭을 그대로 쓰세요.
- 각 섹션이 비어 있으면 "- 없음" 한 줄만 적으세요.
- 그 외의 어떤 추가 텍스트도 출력하지 마세요.

==================== 정책자금 공문 ====================
${gongmun || '※ 공문 없음'}
==================================================`;

  const user = `[고객 정보]
${summary}

위 고객 정보를 바탕으로 신청 가능한 자금을 [가능]/[조건부]/[불가] 키워드 리스트 형식으로만 출력하세요.
절대 고객 정보를 그대로 다시 출력하지 말고, 설명·표·서론도 쓰지 마세요. 자금명만 나열하세요.`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: false,
      think: false,
      options: { num_ctx: OLLAMA_NUM_CTX },
    }),
    signal,
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => '');
    throw new Error(`AI 서버 오류 (${response.status}): ${txt.slice(0, 300)}`);
  }
  const data: any = await response.json();
  const content: string = data?.message?.content || '';
  if (!content.trim()) throw new Error('AI 응답이 비어있습니다.');
  return content.trim();
}

export function checkAiConfig(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!OLLAMA_BASE_URL) missing.push('OLLAMA_BASE_URL');
  return { configured: missing.length === 0, missing };
}
