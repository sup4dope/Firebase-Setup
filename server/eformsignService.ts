import crypto from 'crypto';

const API_KEY = process.env.EFORMSIGN_API_KEY || '';
const SECRET_KEY = process.env.EFORMSIGN_SECRET_KEY || '';
const COMPANY_ID = process.env.EFORMSIGN_COMPANY_ID || '';
const BASE_URL = 'https://api.eformsign.com/v2.0';

let cachedToken: { token: string; expiresAt: number } | null = null;

function generateSignature(executionTime: string): string {
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(executionTime);
  return hmac.digest('base64');
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const executionTime = String(Date.now());
  const signature = generateSignature(executionTime);

  const response = await fetch(`${BASE_URL}/api_auth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'eformsign_signature': `Bearer ${signature}`,
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      execution_time: executionTime,
      member_id: '',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[eformsign] Access Token 발급 실패:', response.status, errorText);
    throw new Error(`eformsign Access Token 발급 실패: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const token = data.oauth_token?.access_token || data.access_token;
  if (!token) {
    console.error('[eformsign] 토큰 응답 구조:', JSON.stringify(data));
    throw new Error('eformsign Access Token이 응답에 없습니다.');
  }

  const expiresIn = data.oauth_token?.expires_in || data.expires_in || 3600;
  cachedToken = {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  console.log('[eformsign] Access Token 발급 성공, 만료:', new Date(cachedToken.expiresAt).toISOString());
  return token;
}

async function apiRequest(method: string, path: string, body?: any): Promise<any> {
  const token = await getAccessToken();
  const url = `${BASE_URL}/api/${COMPANY_ID}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const options: RequestInit = { method, headers };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[eformsign] API 오류 ${method} ${path}:`, response.status, errorText);
    throw new Error(`eformsign API 오류: ${response.status} ${errorText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function getTemplates(): Promise<any> {
  return apiRequest('GET', '/api_forms');
}

export async function getTemplateDetail(templateId: string): Promise<any> {
  return apiRequest('GET', `/api_forms/${templateId}`);
}

export async function createDocument(templateId: string, documentData: {
  document_name?: string;
  fields?: Array<{ id: string; value: string }>;
  recipients?: {
    step_idx: number;
    recipient: {
      id: string;
      name: string;
      email?: string;
      sms?: { country_code: string; phone_number: string };
      use_sms?: boolean;
      use_email?: boolean;
    };
  }[];
  comment?: string;
}): Promise<any> {
  const body: any = {};

  if (documentData.document_name) {
    body.document_name = documentData.document_name;
  }

  if (documentData.fields && documentData.fields.length > 0) {
    body.fields = documentData.fields;
  }

  if (documentData.recipients && documentData.recipients.length > 0) {
    body.recipients = documentData.recipients;
  }

  if (documentData.comment) {
    body.comment = documentData.comment;
  }

  return apiRequest('POST', `/api_forms/${templateId}/api_documents`, body);
}

export async function getDocument(documentId: string): Promise<any> {
  return apiRequest('GET', `/api_documents/${documentId}`);
}

export async function getDocuments(queryParams?: {
  type?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<any> {
  let path = '/api_documents';
  if (queryParams) {
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    const qs = params.toString();
    if (qs) path += `?${qs}`;
  }
  return apiRequest('GET', path);
}

export async function deleteDocument(documentId: string): Promise<any> {
  return apiRequest('DELETE', `/api_documents/${documentId}`);
}

export function checkEformsignConfig(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!API_KEY) missing.push('EFORMSIGN_API_KEY');
  if (!SECRET_KEY) missing.push('EFORMSIGN_SECRET_KEY');
  if (!COMPANY_ID) missing.push('EFORMSIGN_COMPANY_ID');
  return { configured: missing.length === 0, missing };
}

export function mapEformsignStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'doc_create': '초안',
    'doc_tempsave': '초안',
    'doc_request_approval': '발송완료',
    'doc_accept_approval': '발송완료',
    'doc_request_external': '서명대기',
    'doc_request_participant': '서명대기',
    'doc_accept_participant': '서명대기',
    'doc_complete': '서명완료',
    'doc_decline': '거부',
    'doc_cancel': '무효',
    'doc_void': '무효',
  };
  return statusMap[status] || status;
}
