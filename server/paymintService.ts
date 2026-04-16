import crypto from 'crypto';

const PAYMINT_API_URL = process.env.PAYMINT_API_URL || 'https://stg.paymint.co.kr/partner';
const PAYMINT_API_KEY = process.env.PAYMINT_API_KEY || '';
const PAYMINT_MEMBER = process.env.PAYMINT_MEMBER || '';
const PAYMINT_MERCHANT = process.env.PAYMINT_MERCHANT || '';

function generateHash(...parts: string[]): string {
  const data = parts.join(',');
  return crypto.createHash('sha256').update(data).digest('hex');
}

function generateBillId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `PF${timestamp}${random}`.substring(0, 20);
}

export interface SendBillParams {
  billId?: string;
  productName: string;
  message: string;
  memberName: string;
  phone: string;
  price: number;
  expireDt?: string;
  callbackURL: string;
  billIssuer?: string;
}

export interface SendBillResponse {
  apikey: string;
  member: string;
  merchant: string;
  bill_issuer?: string;
  bill_id: string;
  hash: string;
  shortURL?: string;
  code: string;
  msg: string;
}

export interface CancelBillParams {
  billId: string;
  price: number;
}

export interface CancelBillResponse {
  apikey: string;
  member: string;
  merchant: string;
  bill_id: string;
  hash: string;
  appr_num?: string;
  appr_origin_num?: string;
  appr_cancel_dt?: string;
  code: string;
  msg: string;
}

export interface DestroyBillParams {
  billId: string;
  price: number;
}

export interface DestroyBillResponse {
  apikey: string;
  member: string;
  merchant: string;
  bill_id: string;
  hash: string;
  code: string;
  msg: string;
}

export interface ReadBillParams {
  billId: string;
}

export interface ReadBillResponse {
  apikey: string;
  bill_id: string;
  appr_cat_id?: string;
  appr_pay_type?: string;
  appr_card_type?: string;
  appr_dt?: string;
  appr_origin_dt?: string;
  appr_price?: string;
  appr_issuer?: string;
  appr_issuer_cd?: string;
  appr_issuer_num?: string;
  appr_acquirer_cd?: string;
  appr_acquirer_nm?: string;
  appr_num?: string;
  appr_origin_num?: string;
  appr_res_cd?: string;
  appr_monthly?: string;
  appr_state?: string;
  appr_cash_num?: string;
  appr_cash_trader?: string;
  appr_cash_issuance_number?: string;
  code?: string;
  msg?: string;
}

export interface ResendBillParams {
  billId: string;
}

export interface BalanceResponse {
  code: string;
  msg: string;
  info?: {
    remain_count: number;
  };
}

export interface ApprovalCallbackData {
  apikey: string;
  member?: string;
  bill_id: string;
  appr_pay_type?: string;
  appr_card_type?: string;
  appr_dt?: string;
  appr_origin_dt?: string;
  appr_price?: string;
  appr_issuer?: string;
  appr_issuer_cd?: string;
  appr_issuer_num?: string;
  appr_acquirer_cd?: string;
  appr_acquirer_nm?: string;
  appr_num?: string;
  appr_origin_num?: string;
  appr_res_cd?: string;
  appr_monthly?: string;
  appr_state: string;
  appr_cash_num?: string;
  appr_cash_trader?: string;
  appr_cash_issuance_number?: string;
}

async function apiCall<T>(uri: string, body: Record<string, any>): Promise<T> {
  const url = `${PAYMINT_API_URL}${uri}`;
  console.log(`[PayMint] API Call: ${uri}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'charset': 'UTF-8',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayMint API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function sendBill(params: SendBillParams): Promise<SendBillResponse> {
  const billId = params.billId || generateBillId();
  const priceStr = String(params.price);
  const hash = generateHash(billId, params.phone, priceStr);

  const body: Record<string, any> = {
    apikey: PAYMINT_API_KEY,
    member: PAYMINT_MEMBER,
    merchant: PAYMINT_MERCHANT,
    bill: {
      bill_id: billId,
      product_nm: params.productName,
      message: params.message,
      member_nm: params.memberName,
      phone: params.phone,
      price: priceStr,
      hash,
      expire_dt: params.expireDt,
      callbackURL: params.callbackURL,
    },
  };

  if (params.billIssuer) {
    body.bill.bill_issuer = params.billIssuer;
  }

  return apiCall<SendBillResponse>('/if/bill/send', body);
}

export async function cancelBill(params: CancelBillParams): Promise<CancelBillResponse> {
  const priceStr = String(params.price);
  const hash = generateHash(params.billId, priceStr);

  return apiCall<CancelBillResponse>('/if/bill/cancel', {
    apikey: PAYMINT_API_KEY,
    member: PAYMINT_MEMBER,
    merchant: PAYMINT_MERCHANT,
    bill_id: params.billId,
    price: priceStr,
    hash,
  });
}

export async function destroyBill(params: DestroyBillParams): Promise<DestroyBillResponse> {
  const priceStr = String(params.price);
  const hash = generateHash(params.billId, priceStr);

  return apiCall<DestroyBillResponse>('/if/bill/destroy', {
    apikey: PAYMINT_API_KEY,
    member: PAYMINT_MEMBER,
    merchant: PAYMINT_MERCHANT,
    bill_id: params.billId,
    price: priceStr,
    hash,
  });
}

export async function readBill(params: ReadBillParams): Promise<ReadBillResponse> {
  return apiCall<ReadBillResponse>('/if/bill/read', {
    apikey: PAYMINT_API_KEY,
    member: PAYMINT_MEMBER,
    merchant: PAYMINT_MERCHANT,
    bill_id: params.billId,
  });
}

export async function resendBill(params: ResendBillParams): Promise<{ code: string; msg: string }> {
  return apiCall<{ code: string; msg: string }>('/if/bill/resend', {
    apikey: PAYMINT_API_KEY,
    member: PAYMINT_MEMBER,
    merchant: PAYMINT_MERCHANT,
    bill_id: params.billId,
  });
}

export async function getBalance(): Promise<BalanceResponse> {
  return apiCall<BalanceResponse>('/if/read/remain_count', {
    apikey: PAYMINT_API_KEY,
  });
}

export async function getMerchantInfo(): Promise<any> {
  return apiCall<any>('/if/read/merchant', {
    apikey: PAYMINT_API_KEY,
  });
}

export function checkPaymintConfig(): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!PAYMINT_API_KEY) missing.push('PAYMINT_API_KEY');
  if (!PAYMINT_MEMBER) missing.push('PAYMINT_MEMBER');
  if (!PAYMINT_MERCHANT) missing.push('PAYMINT_MERCHANT');
  return { configured: missing.length === 0, missing };
}

export function getPaymintStateLabel(state: string): string {
  switch (state) {
    case 'F': return '결제완료';
    case 'W': return '미결제';
    case 'C': return '취소';
    case 'D': return '파기';
    default: return state;
  }
}
