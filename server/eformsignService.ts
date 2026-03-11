import jsrsasign from 'jsrsasign';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.EFORMSIGN_API_KEY || '';
const SECRET_KEY = process.env.EFORMSIGN_SECRET_KEY || '';
const COMPANY_ID = process.env.EFORMSIGN_COMPANY_ID || '';
const MEMBER_ID = 'yieumgroup@gmail.com';
const AUTH_URL = 'https://service.eformsign.com/v2.0';

let cachedStampDataUri: string | null = null;

function getCompanyStampDataUri(): string {
  if (cachedStampDataUri) return cachedStampDataUri;
  try {
    const stampPath = path.join(process.cwd(), 'server', 'assets', 'company_stamp.png');
    const stampBuffer = fs.readFileSync(stampPath);
    cachedStampDataUri = `data:image/png;base64,${stampBuffer.toString('base64')}`;
    console.log('[eformsign] 회사 도장 이미지 로드 성공');
    return cachedStampDataUri;
  } catch (error: any) {
    console.error('[eformsign] 회사 도장 이미지 로드 실패:', error.message);
    return '';
  }
}

let cachedToken: { token: string; apiUrl: string; expiresAt: number } | null = null;

function generateEcdsaSignature(executionTime: string): string {
  const privateKey = jsrsasign.KEYUTIL.getKeyFromPlainPrivatePKCS8Hex(SECRET_KEY);
  const s_sig = new jsrsasign.KJUR.crypto.Signature({ alg: 'SHA256withECDSA' });
  s_sig.init(privateKey);
  s_sig.updateString(executionTime);
  return s_sig.sign();
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const executionTime = String(Date.now());
  const signature = generateEcdsaSignature(executionTime);
  const apiKeyBase64 = Buffer.from(API_KEY).toString('base64');

  console.log('[eformsign] Access Token 요청 시작...');

  const tokenUrl = `${AUTH_URL}/api_auth/access_token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'eformsign_signature': signature,
      'Authorization': `Bearer ${apiKeyBase64}`,
    },
    body: JSON.stringify({
      execution_time: executionTime,
      member_id: MEMBER_ID,
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error('[eformsign] Access Token 발급 실패:', response.status, responseText);
    throw new Error(`eformsign Access Token 발급 실패: ${response.status} ${responseText}`);
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`eformsign 토큰 응답 파싱 실패: ${responseText.substring(0, 200)}`);
  }

  const token = data.oauth_token?.access_token || data.access_token;
  if (!token) {
    console.error('[eformsign] 토큰 응답 구조:', JSON.stringify(data));
    throw new Error('eformsign Access Token이 응답에 없습니다.');
  }

  const apiUrl = data.api_key?.company?.api_url || 'https://kr-api.eformsign.com';
  const expiresIn = data.oauth_token?.expires_in || data.expires_in || 3600;
  cachedToken = {
    token,
    apiUrl,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  console.log('[eformsign] Access Token 발급 성공, API URL:', apiUrl, ', 만료:', new Date(cachedToken.expiresAt).toISOString());
  return token;
}

function getApiBaseUrl(): string {
  return cachedToken?.apiUrl || 'https://kr-api.eformsign.com';
}

async function apiRequest(method: string, path: string, body?: any): Promise<any> {
  const token = await getAccessToken();
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/v2.0/api${path}`;

  console.log(`[eformsign] API 요청: ${method} ${url}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const options: RequestInit = { method, headers };
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseText = await response.text();
  console.log(`[eformsign] API 응답: ${method} ${path} → status=${response.status}, body=${responseText.substring(0, 500)}`);

  if (!response.ok) {
    console.error(`[eformsign] API 오류 ${method} ${path}:`, response.status, responseText);
    throw new Error(`eformsign API 오류: ${response.status} ${responseText}`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

export async function getTemplates(): Promise<any> {
  return apiRequest('GET', '/forms');
}

export async function getTemplateDetail(templateId: string): Promise<any> {
  return apiRequest('GET', `/forms/${templateId}`);
}

export async function createDocument(templateId: string, documentData: {
  document_name?: string;
  fields?: Array<{ id: string; value: string }>;
  recipients?: {
    step_type?: string;
    use_mail?: boolean;
    use_sms?: boolean;
    member?: {
      name: string;
      id: string;
      sms?: { country_code: string; phone_number: string };
    };
    auth?: {
      password?: string;
      password_hint?: string;
      valid?: { day: number; hour: number };
    };
  }[];
  comment?: string;
}): Promise<any> {
  const document: any = {};

  if (documentData.document_name) {
    document.document_name = documentData.document_name;
  }

  if (documentData.comment) {
    document.comment = documentData.comment;
  }

  if (documentData.recipients && documentData.recipients.length > 0) {
    document.recipients = documentData.recipients;
  }

  const allFields = [...(documentData.fields || [])];

  const stampDataUri = getCompanyStampDataUri();
  if (stampDataUri) {
    allFields.push({ id: '회사 도장 1', value: stampDataUri });
    console.log('[eformsign] 회사 도장 필드 자동 추가됨');
  }

  if (allFields.length > 0) {
    document.fields = allFields;
  }

  return apiRequest('POST', `/documents?template_id=${encodeURIComponent(templateId)}`, { document });
}

export async function getDocument(documentId: string): Promise<any> {
  return apiRequest('GET', `/documents/${documentId}`);
}

export async function downloadDocument(documentId: string): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  const { token, apiUrl } = await getTokenAndUrl();
  const url = `${apiUrl}/v2.0/api/documents/${documentId}/download_files?file_type=document`;
  console.log(`[eformsign] 문서 다운로드 요청: GET ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'access_token': token,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`eformsign 문서 다운로드 실패 (${response.status}): ${errorText}`);
  }

  const contentType = response.headers.get('content-type') || 'application/pdf';
  const contentDisposition = response.headers.get('content-disposition') || '';
  let fileName = `contract_${documentId}.pdf`;
  const fileNameMatch = contentDisposition.match(/filename[*]?=(?:UTF-8''|"?)([^";]+)/i);
  if (fileNameMatch) {
    fileName = decodeURIComponent(fileNameMatch[1].replace(/"/g, ''));
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`[eformsign] 문서 다운로드 성공: ${fileName}, 크기: ${buffer.length} bytes`);

  return { buffer, contentType, fileName };
}

async function getTokenAndUrl(): Promise<{ token: string; apiUrl: string }> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return { token: cachedToken.token, apiUrl: cachedToken.apiUrl };
  }
  await getAccessToken();
  if (!cachedToken) throw new Error('토큰 발급 실패');
  return { token: cachedToken.token, apiUrl: cachedToken.apiUrl };
}

export async function getDocuments(queryParams?: {
  type?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<any> {
  let path = '/documents';
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

export async function resendDocument(documentId: string): Promise<any> {
  const docInfo = await apiRequest('GET', `/documents/${documentId}?include_detail=true`);
  console.log('[eformsign] 문서 상세 조회 결과:', JSON.stringify(docInfo).substring(0, 3000));

  const currentStatus = docInfo?.current_status;
  console.log('[eformsign] current_status:', JSON.stringify(currentStatus));

  const stepType = currentStatus?.step_type || '05';
  const stepGroup = currentStatus?.step_group;
  const stepIndex = currentStatus?.step_index;
  console.log('[eformsign] stepType:', stepType, 'stepGroup:', stepGroup, 'stepIndex:', stepIndex);

  const stepRecipients = currentStatus?.step_recipients || [];
  const recipientInfo = stepRecipients[0];

  const tryBodies = [];

  if (recipientInfo) {
    const recipientBlock = {
      member: {
        name: recipientInfo.name,
        id: recipientInfo.email,
        ...(recipientInfo.sms ? { sms: recipientInfo.sms } : {})
      },
      use_mail: false,
      use_sms: true
    };

    tryBodies.push({
      input: {
        next_steps: [{
          step_type: stepType,
          step_seq: String(stepGroup),
          recipients: [recipientBlock],
          comment: '계약서 재요청입니다.'
        }]
      }
    });

    tryBodies.push({
      input: {
        next_steps: [{
          step_type: stepType,
          step_seq: String(stepIndex),
          recipients: [recipientBlock],
          comment: '계약서 재요청입니다.'
        }]
      }
    });

    tryBodies.push({
      input: {
        next_steps: [{
          step_type: stepType,
          recipients: [recipientBlock],
          comment: '계약서 재요청입니다.'
        }]
      }
    });
  }

  tryBodies.push({
    input: {
      next_steps: [{
        step_type: stepType,
        comment: '계약서 재요청입니다.'
      }]
    }
  });

  for (let i = 0; i < tryBodies.length; i++) {
    try {
      console.log(`[eformsign] 재요청 시도 ${i + 1}/${tryBodies.length}, body:`, JSON.stringify(tryBodies[i]));
      const result = await apiRequest('POST', `/documents/${documentId}/re_request_outsider`, tryBodies[i]);
      console.log(`[eformsign] 재요청 시도 ${i + 1} 성공!`);
      return result;
    } catch (error: any) {
      console.log(`[eformsign] 재요청 시도 ${i + 1} 실패:`, error.message?.substring(0, 200));
      if (i === tryBodies.length - 1) {
        throw error;
      }
    }
  }
}

export async function deleteDocument(documentId: string): Promise<any> {
  return apiRequest('DELETE', `/documents/${documentId}`);
}

export async function cancelDocument(documentId: string): Promise<any> {
  return apiRequest('DELETE', `/documents/${documentId}`);
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
    'doc_create': '발송완료',
    'doc_tempsave': '발송완료',
    'doc_request_approval': '발송완료',
    'doc_accept_approval': '발송완료',
    'doc_request_external': '발송완료',
    'doc_request_participant': '발송완료',
    'doc_accept_participant': '발송완료',
    'doc_complete': '서명완료',
    'doc_decline': '발송완료',
    'doc_cancel': '무효',
    'doc_void': '무효',
  };
  return statusMap[status] || '발송완료';
}

export function extractEformsignStatus(docInfo: any): string {
  const currentStatus = docInfo?.current_status || docInfo?.document?.current_status || {};
  const rawStatusType = currentStatus?.status_type;

  const statusTypeMap: Record<string, string> = {
    '003': '서명완료',
    '004': '발송완료',
    '005': '무효',
    '042': '무효',
    '060': '발송완료',
  };

  if (rawStatusType !== undefined && rawStatusType !== null && rawStatusType !== '') {
    const strType = String(rawStatusType);
    if (statusTypeMap[strType]) {
      return statusTypeMap[strType];
    }
    const paddedType = strType.padStart(3, '0');
    if (statusTypeMap[paddedType]) {
      return statusTypeMap[paddedType];
    }
  }

  const stepType = currentStatus?.step_type;
  if (stepType !== undefined && stepType !== null) {
    const strStep = String(stepType);
    if (strStep === '06' || strStep === '6') return '서명완료';
  }

  const eventStatus = docInfo?.document?.document_status || docInfo?.document_status || docInfo?.status || '';
  if (eventStatus) {
    return mapEformsignStatus(eventStatus);
  }

  return '발송완료';
}
