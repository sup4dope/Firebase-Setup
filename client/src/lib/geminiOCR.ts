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
    let base64Data: string;
    let imageMimeType: string;
    
    if (imageSource instanceof File) {
      base64Data = await fileToBase64(imageSource);
      imageMimeType = imageSource.type || 'image/jpeg';
    } else {
      const result = await urlToBase64(imageSource);
      base64Data = result.base64;
      imageMimeType = mimeType || result.mimeType;
    }
    
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

    if (!response.ok) {
      console.error("OCR API 요청 실패:", response.status);
      return null;
    }

    const result = await response.json();
    
    if (result.success && result.data) {
      console.log("✅ 사업자등록증 OCR 결과:", result.data);
      return result.data as BusinessRegistrationData;
    } else {
      console.error("OCR 처리 실패:", result.error);
      return null;
    }
    
  } catch (error) {
    console.error("사업자등록증 OCR 실패:", error);
    return null;
  }
}

/**
 * 파일명에 '사업자등록증'이 포함되어 있는지 확인
 */
export function isBusinessRegistrationFile(fileName: string): boolean {
  return fileName.includes('사업자등록증');
}

/**
 * 이미지 파일인지 확인
 */
export function isImageFile(fileType: string): boolean {
  return fileType.startsWith('image/');
}
