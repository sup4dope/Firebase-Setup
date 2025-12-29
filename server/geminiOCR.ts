/**
 * Gemini 1.5 Flash API를 사용한 사업자등록증 OCR 서비스 (서버 측)
 */

export interface BusinessRegistrationData {
  company_name?: string;
  ceo_name?: string;
  founding_date?: string;
  business_registration_number?: string;
  resident_registration_number?: string;
  business_type?: string;
  business_item?: string;
  business_address?: string;
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

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  const match1 = dateStr.match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  if (match1) {
    const [, year, month, day] = match1;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  const match2 = dateStr.match(/(\d{4})(\d{2})(\d{2})/);
  if (match2) {
    const [, year, month, day] = match2;
    return `${year}-${month}-${day}`;
  }
  
  const match3 = dateStr.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (match3) {
    const [, year, month, day] = match3;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return dateStr;
}

function formatBusinessNumber(numStr: string): string {
  if (!numStr) return "";
  
  const digits = numStr.replace(/\D/g, '');
  
  if (digits.length !== 10) {
    return numStr;
  }
  
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export async function extractBusinessRegistrationFromBase64(
  base64Data: string,
  mimeType: string
): Promise<BusinessRegistrationData | null> {
  console.log("🔍 [서버] OCR 함수 호출됨");
  console.log(`   - Base64 길이: ${base64Data?.length || 0}`);
  console.log(`   - MIME 타입: ${mimeType}`);
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  console.log(`   - API 키 존재: ${apiKey ? '✅ 있음' : '❌ 없음 (undefined)'}`);
  
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    return null;
  }
  
  try {
    const prompt = `이 문서는 한국의 사업자등록증입니다. PDF 또는 이미지 형식일 수 있습니다.
문서에서 다음 정보를 정확하게 추출해주세요:

1. 상호(명칭) - company_name: 사업체의 이름
2. 대표자(성명) - ceo_name: 대표자의 이름
3. 개업연월일 - founding_date: 사업 시작 날짜
4. 사업자등록번호 - business_registration_number: 10자리 번호 (XXX-XX-XXXXX 형식)
5. 주민(법인)등록번호 - resident_registration_number: 주민등록번호 또는 법인등록번호 (매우 중요! 반드시 찾아주세요)
6. 업태 - business_type: 사업의 업태
7. 종목 - business_item: 사업의 종목
8. 사업장 소재지 - business_address: 사업장의 주소

반드시 아래 JSON 형식으로만 응답해주세요. 다른 설명 없이 JSON만 출력하세요:
{
  "company_name": "",
  "ceo_name": "",
  "founding_date": "",
  "business_registration_number": "",
  "resident_registration_number": "",
  "business_type": "",
  "business_item": "",
  "business_address": ""
}

주의사항:
- 정보를 찾을 수 없으면 빈 문자열("")로 설정
- 주민(법인)등록번호는 사업자등록증에서 "주민등록번호" 또는 "법인등록번호" 항목을 확인
- 날짜는 YYYY-MM-DD 형식으로 변환`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
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

    console.log("📡 [서버] Gemini API 호출 중...");
    
    // gemini-2.0-flash-exp 모델 사용 (PDF 지원)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      }
    );

    console.log(`📡 [서버] Gemini API 응답 상태: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData?.error?.message || JSON.stringify(errorData);
      console.error("❌ [서버] Gemini API 오류:", errorMessage);
      throw new Error(`Gemini API 오류: ${errorMessage}`);
    }

    const data: GeminiResponse = await response.json();
    console.log("📥 [서버] Gemini 응답 수신 완료");
    
    if (data.error) {
      console.error("❌ [서버] Gemini API 에러:", data.error.message);
      return null;
    }

    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("📝 [서버] Gemini 텍스트 응답:", textContent?.substring(0, 500));
    
    if (!textContent) {
      console.error("❌ [서버] Gemini 응답에서 텍스트를 찾을 수 없습니다.");
      return null;
    }

    let jsonStr = textContent.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    console.log("📝 [서버] 파싱할 JSON:", jsonStr.substring(0, 300));
    const parsedData = JSON.parse(jsonStr);
    
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
