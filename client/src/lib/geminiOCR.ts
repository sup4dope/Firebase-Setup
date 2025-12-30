/**
 * 사업자등록증 OCR 클라이언트 서비스
 * 서버 측 Gemini API를 호출하여 사업자등록증 정보 추출
 */

export interface BusinessRegistrationData {
  company_name?: string;
  ceo_name?: string;
  founding_date?: string;
  business_registration_number?: string;
  resident_id_front?: string;
  resident_id_back?: string;
  business_type?: string;
  business_type_list?: string[];
  business_item?: string;
  business_address?: string;
  business_address_detail?: string;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function extractBusinessRegistration(
  imageSource: File | string,
  mimeType?: string
): Promise<BusinessRegistrationData | null> {
  try {
    console.log("🚀 OCR 처리 시작...");
    
    let base64Data: string;
    let imageMimeType: string;
    
    if (imageSource instanceof File) {
      console.log(`📁 파일 정보: ${imageSource.name}, 크기: ${imageSource.size}bytes, 타입: ${imageSource.type}`);
      base64Data = await fileToBase64(imageSource);
      imageMimeType = imageSource.type || 'image/jpeg';
      console.log(`📦 Base64 변환 완료, 길이: ${base64Data.length}, MIME: ${imageMimeType}`);
    } else {
      console.log(`🔗 URL에서 이미지 로드: ${imageSource.substring(0, 100)}...`);
      const result = await urlToBase64(imageSource);
      base64Data = result.base64;
      imageMimeType = mimeType || result.mimeType;
      console.log(`📦 Base64 변환 완료, 길이: ${base64Data.length}, MIME: ${imageMimeType}`);
    }
    
    console.log("📡 서버 OCR API 호출 중...");
    const response = await fetch('/api/ocr/business-registration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Data,
        mimeType: imageMimeType
      })
    });

    console.log(`📡 API 응답 상태: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ OCR API 요청 실패:", response.status, errorText);
      return null;
    }

    const result = await response.json();
    console.log("📥 API 응답 데이터:", JSON.stringify(result, null, 2));
    
    if (result.success && result.data) {
      console.log("✅ 사업자등록증 OCR 성공:", result.data);
      return result.data as BusinessRegistrationData;
    } else {
      console.error("❌ OCR 처리 실패:", result.error);
      return null;
    }
    
  } catch (error) {
    console.error("❌ 사업자등록증 OCR 예외:", error);
    return null;
  }
}

export function isBusinessRegistrationFile(fileName: string): boolean {
  const normalizedName = fileName.replace(/\s+/g, '');
  
  // '폐업' 문구가 포함된 파일은 OCR 대상에서 제외
  if (normalizedName.includes('폐업')) {
    console.log(`⚠️ 폐업 문서 제외: "${fileName}" -> OCR 건너뜀`);
    return false;
  }
  
  const matched = normalizedName.includes('사업자등록증');
  
  console.log(`🔍 파일명 체크: "${fileName}" -> 정규화: "${normalizedName}" -> '사업자등록증' 포함: ${matched}`);
  return matched;
}

export function isImageFile(fileType: string): boolean {
  const isImage = fileType.startsWith('image/');
  console.log(`🔍 파일 타입 체크: "${fileType}" -> 이미지 여부: ${isImage}`);
  return isImage;
}

export function isOCRSupportedFile(fileType: string): boolean {
  const isImage = fileType.startsWith('image/');
  const isPdf = fileType === 'application/pdf' || fileType.includes('pdf');
  const supported = isImage || isPdf;
  
  console.log(`🔍 OCR 지원 파일 체크: "${fileType}" -> 이미지: ${isImage}, PDF: ${isPdf}, 지원: ${supported}`);
  return supported;
}

// ========== 부가가치세 과세표준증명 OCR ==========

export interface VatCertificateData {
  recent_sales?: number;
  sales_y1?: number;
  sales_y2?: number;
  sales_y3?: number;
  raw_data?: { year: number; amount: number }[];
}

export function isVatCertificateFile(fileName: string): boolean {
  const normalizedName = fileName.replace(/\s+/g, '');
  
  // '폐업' 문구가 포함된 파일은 OCR 대상에서 제외
  if (normalizedName.includes('폐업')) {
    console.log(`⚠️ 폐업 문서 제외: "${fileName}" -> OCR 건너뜀`);
    return false;
  }
  
  const matched = normalizedName.includes('부가가치세과세표준증명') || 
                  normalizedName.includes('과세표준증명') ||
                  normalizedName.includes('부가세과세표준');
  
  console.log(`🔍 부가세 과세표준증명 파일 체크: "${fileName}" -> 매칭: ${matched}`);
  return matched;
}

export async function extractVatCertificate(
  imageSource: File | string,
  mimeType?: string
): Promise<VatCertificateData | null> {
  try {
    console.log("🚀 부가세 과세표준증명 OCR 처리 시작...");
    
    let base64Data: string;
    let imageMimeType: string;
    
    if (imageSource instanceof File) {
      console.log(`📁 파일 정보: ${imageSource.name}, 크기: ${imageSource.size}bytes`);
      base64Data = await fileToBase64(imageSource);
      imageMimeType = imageSource.type || 'application/pdf';
    } else {
      const result = await urlToBase64(imageSource);
      base64Data = result.base64;
      imageMimeType = mimeType || result.mimeType;
    }
    
    console.log("📡 서버 부가세 OCR API 호출 중...");
    const response = await fetch('/api/ocr/vat-certificate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data, mimeType: imageMimeType })
    });

    if (!response.ok) {
      console.error("❌ 부가세 OCR API 요청 실패:", response.status);
      return null;
    }

    const result = await response.json();
    console.log("📥 부가세 OCR 응답:", result);
    
    if (result.success && result.data) {
      console.log("✅ 부가세 과세표준증명 OCR 성공:", result.data);
      return result.data as VatCertificateData;
    } else {
      console.error("❌ 부가세 OCR 처리 실패:", result.error);
      return null;
    }
    
  } catch (error) {
    console.error("❌ 부가세 과세표준증명 OCR 예외:", error);
    return null;
  }
}

// ========== 사업자신용정보공여내역 OCR ==========

export interface CreditReportData {
  obligations: Array<{
    institution: string;
    product_name: string;
    account_type: string;
    balance: number;
    occurred_at: string;
    maturity_date?: string;
    type: 'loan' | 'guarantee';
  }>;
  unit_multiplier: number;
}

export function isCreditReportFile(fileName: string): boolean {
  const normalizedName = fileName.replace(/\s+/g, '');
  
  // '폐업' 문구가 포함된 파일은 OCR 대상에서 제외
  if (normalizedName.includes('폐업')) {
    console.log(`⚠️ 폐업 문서 제외: "${fileName}" -> OCR 건너뜀`);
    return false;
  }
  
  const matched = normalizedName.includes('신용공여내역') || 
                  normalizedName.includes('사업자신용정보공여') ||
                  normalizedName.includes('신용정보공여');
  
  console.log(`🔍 신용공여내역 파일 체크: "${fileName}" -> 매칭: ${matched}`);
  return matched;
}

export async function extractCreditReport(
  imageSource: File | string,
  mimeType?: string
): Promise<CreditReportData | null> {
  try {
    console.log("🚀 신용공여내역 OCR 처리 시작...");
    
    let base64Data: string;
    let imageMimeType: string;
    
    if (imageSource instanceof File) {
      console.log(`📁 파일 정보: ${imageSource.name}, 크기: ${imageSource.size}bytes`);
      base64Data = await fileToBase64(imageSource);
      imageMimeType = imageSource.type || 'application/pdf';
    } else {
      const result = await urlToBase64(imageSource);
      base64Data = result.base64;
      imageMimeType = mimeType || result.mimeType;
    }
    
    console.log("📡 서버 신용공여내역 OCR API 호출 중...");
    const response = await fetch('/api/ocr/credit-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data, mimeType: imageMimeType })
    });

    if (!response.ok) {
      console.error("❌ 신용공여내역 OCR API 요청 실패:", response.status);
      return null;
    }

    const result = await response.json();
    console.log("📥 신용공여내역 OCR 응답:", result);
    
    if (result.success && result.data) {
      console.log("✅ 신용공여내역 OCR 성공:", result.data.obligations?.length || 0, "건");
      return result.data as CreditReportData;
    } else {
      console.error("❌ 신용공여내역 OCR 처리 실패:", result.error);
      return null;
    }
    
  } catch (error) {
    console.error("❌ 신용공여내역 OCR 예외:", error);
    return null;
  }
}
