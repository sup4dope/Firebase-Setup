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
let cachedGongmunFunds: string[] = [];
let cachedAt = 0;

// 공문 파일명 + 마스터 공고 본문에서 등장하는 정식 자금명 화이트리스트
const MASTER_DOC_FUNDS = [
  '일반경영안정자금',
  '특별경영안정자금',
  '긴급경영안정자금',
  '신용취약소상공인자금',
  '대환대출',
  '혁신성장촉진자금',
  '상생성장지원자금',
  '민간투자연계형매칭융자',
  '재도전특별자금',
  '일시적경영애로자금',
];

export function getGongmunFundList(): string[] {
  if (cachedGongmunFunds.length === 0) loadGongmunContext();
  return cachedGongmunFunds;
}

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
    const fundSet = new Set<string>(MASTER_DOC_FUNDS);
    for (const f of files) {
      const content = fs.readFileSync(path.join(GONGMUN_DIR, f), 'utf-8');
      parts.push(`### 공문: ${f}\n\n${content.trim()}`);
      // 파일명에서 자금명 추출 (확장자/언더바/날짜 제거)
      const base = f.replace(/\.(txt|md)$/i, '');
      if (/자금|융자|대출/.test(base) && !/공고|운용|계획|README/.test(base)) {
        fundSet.add(base.replace(/_/g, ' ').trim());
      }
    }
    cachedGongmun = parts.join('\n\n---\n\n');
    cachedGongmunFunds = Array.from(fundSet);
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
  const fundList = getGongmunFundList();
  const fundListText = fundList.map((f) => `- ${f}`).join('\n');

  const system = `당신은 한국 정책자금 컨설팅 전문가 AI입니다. 아래 "정책자금 공문"만을 근거로 이 고객이 신청 가능한 정책자금을 가려냅니다.

[허용된 자금명 화이트리스트 — 이 목록 외의 자금명은 절대 출력 금지]
${fundListText}

[출력 규칙 — 매우 중요]
- 위 화이트리스트에 있는 자금명만 출력하세요. 다른 자금명을 만들거나 추측하지 마세요.
- 같은 자금을 두 번 이상 출력하지 마세요.
- 설명, 근거, 표, 서론·결론, 마크다운은 모두 금지.
- 오직 아래 정확한 형식만 출력하세요:

[가능]
- 자금명
- 자금명

[조건부]
- 자금명 (사유 20자 이내)

[불가]
- 자금명 (사유 20자 이내)

- 각 섹션이 비어 있으면 "- 없음" 한 줄만 적으세요.
- 모든 자금을 한 섹션에 한 번씩만 분류하세요. 같은 자금을 여러 섹션에 중복 배치 금지.
- 출력 끝에는 어떤 추가 텍스트도 붙이지 마세요.

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
      options: {
        num_ctx: OLLAMA_NUM_CTX,
        temperature: 0,
        top_p: 0.1,
        repeat_penalty: 1.4,
        num_predict: 600,
      },
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
  return sanitizePrediction(content.trim(), fundList);
}

// 화이트리스트 외 자금명 라인 제거 + 중복 제거 + 섹션 정리
function sanitizePrediction(raw: string, whitelist: string[]): string {
  const wl = whitelist.map((w) => w.replace(/\s+/g, ''));
  const sections: Record<string, string[]> = { '[가능]': [], '[조건부]': [], '[불가]': [] };
  let cur: string | null = null;
  const seen = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^\[가능\]/.test(t)) { cur = '[가능]'; continue; }
    if (/^\[조건부\]/.test(t)) { cur = '[조건부]'; continue; }
    if (/^\[불가\]/.test(t)) { cur = '[불가]'; continue; }
    if (!cur) continue;
    if (!/^[-•*]/.test(t)) continue;

    const body = t.replace(/^[-•*]\s*/, '');
    if (/^없음/.test(body)) continue;

    // "자금명 (사유)" 분리
    const m = body.match(/^([^()（）]+?)(?:\s*[(（](.+)[)）])?\s*$/);
    if (!m) continue;
    const fundRaw = m[1].trim();
    const reason = (m[2] || '').trim();
    const fundKey = fundRaw.replace(/\s+/g, '');

    // 화이트리스트 부분일치 (양방향 substring)
    const matched = wl.find((w) => fundKey.includes(w) || w.includes(fundKey));
    if (!matched) continue;

    const dedupeKey = matched;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // 원본 화이트리스트 표기로 정규화
    const original = whitelist.find((w) => w.replace(/\s+/g, '') === matched) || fundRaw;
    sections[cur].push(reason ? `- ${original} (${reason.slice(0, 30)})` : `- ${original}`);
  }

  const out: string[] = [];
  for (const sec of ['[가능]', '[조건부]', '[불가]']) {
    out.push(sec);
    out.push(sections[sec].length > 0 ? sections[sec].join('\n') : '- 없음');
    out.push('');
  }
  return out.join('\n').trim();
}

export function checkAiConfig(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!OLLAMA_BASE_URL) missing.push('OLLAMA_BASE_URL');
  return { configured: missing.length === 0, missing };
}
