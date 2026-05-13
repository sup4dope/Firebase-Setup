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
    opts.onError(new Error(err?.message || '스트리밍 오류'));
  }
}
