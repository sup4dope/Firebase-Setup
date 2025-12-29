/**
 * 사업자등록증 OCR 클라이언트 서비스
 * 서버 측 Gemini API를 호출하여 사업자등록증 정보 추출
 */

export interface BusinessRegistrationData {
  company_name?: string;        // 상호명
  ceo_name?: string;            // 대표자명
  founding_date?: string;       // 개업연월일 (YYYY-MM-DD)
  business_registration_number?: string;  // 사업자등록번호 (000-00-00000)
  resident_registration_number?: string;  // 주민(법인)등록번호
  business_type?: string;       // 업종
  business_item?: string;       // 종목
  business_address?: string;    // 사업장 소재지
}

/**
 * 이미지 파일을 Base64로 변환
 */
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

/**
 * URL에서 이미지를 가져와 Base64로 변환
 */
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

/**
 * 서버 OCR API를 호출하여 사업자등록증 정보 추출
 */
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

/**
 * 파일명에 사업자등록증 관련 키워드가 포함되어 있는지 확인
 * 더 유연한 매칭: 공백, 대소문자 무시
 */
export function isBusinessRegistrationFile(fileName: string): boolean {
  const normalizedName = fileName.toLowerCase().replace(/\s+/g, '');
  const keywords = ['사업자등록증', '사업자등록', '등록증'];
  const matched = keywords.some(keyword => normalizedName.includes(keyword));
  
  console.log(`🔍 파일명 체크: "${fileName}" -> 정규화: "${normalizedName}" -> 매칭: ${matched}`);
  return matched;
}

/**
 * 이미지 파일인지 확인
 */
export function isImageFile(fileType: string): boolean {
  const isImage = fileType.startsWith('image/');
  console.log(`🔍 파일 타입 체크: "${fileType}" -> 이미지 여부: ${isImage}`);
  return isImage;
}
