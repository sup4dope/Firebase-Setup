/**
 * Gemini 1.5 Flash API를 사용한 사업자등록증 OCR 서비스
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

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

/**
 * 날짜 형식 변환 (다양한 형식 → YYYY-MM-DD)
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  
  // 이미 YYYY-MM-DD 형식인 경우
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // YYYY.MM.DD 또는 YYYY/MM/DD 형식
  const match1 = dateStr.match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  if (match1) {
    const [, year, month, day] = match1;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // YYYYMMDD 형식
  const match2 = dateStr.match(/(\d{4})(\d{2})(\d{2})/);
  if (match2) {
    const [, year, month, day] = match2;
    return `${year}-${month}-${day}`;
  }
  
  // 한글 포함 형식 (예: 2020년 01월 15일)
  const match3 = dateStr.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (match3) {
    const [, year, month, day] = match3;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return dateStr;
}

/**
 * 사업자등록번호 형식 변환 (000-00-00000)
 */
function formatBusinessNumber(numStr: string): string {
  if (!numStr) return "";
  
  // 숫자만 추출
  const digits = numStr.replace(/\D/g, '');
  
  if (digits.length !== 10) {
    return numStr;
  }
  
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/**
 * 이미지 파일을 Base64로 변환
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:image/jpeg;base64, 부분 제거
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
 * Gemini API를 호출하여 사업자등록증 정보 추출
 */
export async function extractBusinessRegistration(
  imageSource: File | string,
  mimeType?: string
): Promise<BusinessRegistrationData | null> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("Gemini API 키가 설정되지 않았습니다.");
    return null;
  }
  
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
    
    const prompt = `이 사업자등록증 이미지에서 다음 정보를 정확하게 추출해주세요:
- 상호명 (company_name)
- 대표자명 (ceo_name)
- 개업연월일 (founding_date)
- 사업자등록번호 (business_registration_number)
- 주민(법인)등록번호 (resident_registration_number)
- 업종 (business_type)
- 종목 (business_item)
- 사업장 소재지 (business_address)

반드시 다음 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "company_name": "상호명",
  "ceo_name": "대표자명",
  "founding_date": "개업연월일",
  "business_registration_number": "사업자등록번호",
  "resident_registration_number": "주민또는법인등록번호",
  "business_type": "업종",
  "business_item": "종목",
  "business_address": "사업장소재지"
}

정보를 찾을 수 없는 경우 해당 필드의 값을 빈 문자열("")로 설정해주세요.`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            },
            {
              inline_data: {
                mime_type: imageMimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 1,
        maxOutputTokens: 1024,
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API 오류:", errorData);
      return null;
    }

    const data: GeminiResponse = await response.json();
    
    if (data.error) {
      console.error("Gemini API 에러:", data.error.message);
      return null;
    }

    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textContent) {
      console.error("Gemini 응답에서 텍스트를 찾을 수 없습니다.");
      return null;
    }

    // JSON 추출 (```json ... ``` 형식 처리)
    let jsonStr = textContent.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // JSON 파싱
    const parsedData = JSON.parse(jsonStr);
    
    // 데이터 정제 및 형식 변환
    const result: BusinessRegistrationData = {
      company_name: parsedData.company_name?.trim() || undefined,
      ceo_name: parsedData.ceo_name?.trim() || undefined,
      founding_date: formatDate(parsedData.founding_date) || undefined,
      business_registration_number: formatBusinessNumber(parsedData.business_registration_number) || undefined,
      resident_registration_number: parsedData.resident_registration_number?.trim() || undefined,
      business_type: parsedData.business_type?.trim() || undefined,
      business_item: parsedData.business_item?.trim() || undefined,
      business_address: parsedData.business_address?.trim() || undefined,
    };

    console.log("✅ 사업자등록증 OCR 결과:", result);
    return result;
    
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
