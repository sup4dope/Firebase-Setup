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
