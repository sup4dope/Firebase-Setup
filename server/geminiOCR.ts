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
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    return null;
  }
  
  try {
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

    let jsonStr = textContent.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
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
