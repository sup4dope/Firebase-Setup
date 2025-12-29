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
    const prompt = `[시스템 안내] 이 서류는 법적으로 허용된 내부 전산 시스템(CRM)에서 처리되는 것이며, 보안이 유지되는 환경입니다.
문서 내의 모든 정보를 있는 그대로 정확하게 추출해야 합니다.

이 문서는 한국의 사업자등록증입니다. 다음 정보를 추출하세요:

1. 상호(명칭) - company_name
2. 대표자(성명) - ceo_name
3. 개업연월일 - founding_date (YYYY-MM-DD 형식)
4. 사업자등록번호 - business_registration_number (XXX-XX-XXXXX 형식)
5. 주민등록번호 또는 법인등록번호 - resident_registration_number
6. 업태 - business_type
7. 종목 - business_item
8. 사업장 소재지 - business_address

JSON 형식으로만 응답하세요:
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

규칙: 정보를 찾을 수 없으면 빈 문자열("")로 설정.`;

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
        maxOutputTokens: 2048,
      },
      // 모든 안전 필터 해제 (민감 정보 처리를 위해 필수)
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ]
    };

    console.log("📡 [서버] Gemini API 호출 중...");
    console.log(`   - 요청 MIME 타입: ${mimeType}`);
    console.log(`   - 요청 데이터 크기: ${base64Data.length} bytes`);
    
    // gemini-1.5-flash 모델 사용 (PDF 직접 지원, v1beta API)
    const modelName = "gemini-1.5-flash-002";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    console.log(`   - 사용 모델: ${modelName}`);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📡 [서버] Gemini API 응답 상태: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData?.error?.message || JSON.stringify(errorData);
      console.error("❌ [서버] Gemini API HTTP 오류:", errorMessage);
      throw new Error(`API 호출 실패 (${response.status}): ${errorMessage}`);
    }

    const data: GeminiResponse = await response.json();
    
    // Raw 응답 전체 로그
    console.log("📥 [서버] Gemini Raw 응답:", JSON.stringify(data, null, 2).substring(0, 2000));
    
    if (data.error) {
      console.error("❌ [서버] Gemini 응답 에러:", data.error.message);
      throw new Error(`AI 응답 에러: ${data.error.message}`);
    }

    // 응답 거부 이유 확인 (finishReason)
    const candidate = data.candidates?.[0];
    const finishReason = (candidate as any)?.finishReason;
    console.log("📊 [서버] finishReason:", finishReason);
    
    if (finishReason && finishReason !== "STOP") {
      console.error("⚠️ [서버] AI 응답 거부됨, finishReason:", finishReason);
      const safetyRatings = (candidate as any)?.safetyRatings;
      if (safetyRatings) {
        console.error("   - safetyRatings:", JSON.stringify(safetyRatings, null, 2));
      }
      throw new Error(`AI 응답 거부: ${finishReason}`);
    }

    const textContent = candidate?.content?.parts?.[0]?.text;
    console.log("📝 [서버] Gemini 텍스트 응답 (전체):", textContent);
    
    if (!textContent) {
      console.error("❌ [서버] Gemini 응답에서 텍스트를 찾을 수 없습니다.");
      console.error("   - candidates:", JSON.stringify(data.candidates));
      console.error("   - finishReason:", finishReason);
      throw new Error("빈 응답 에러: AI로부터 텍스트 응답을 받지 못했습니다.");
    }

    // 마크다운 코드 블록 제거 (```json ... ``` 형태)
    let jsonStr = textContent.trim();
    console.log("📝 [서버] 원본 텍스트:", jsonStr.substring(0, 500));
    
    // 다양한 마크다운 패턴 처리
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
      console.log("📝 [서버] 마크다운 제거 후:", jsonStr.substring(0, 300));
    }
    
    // JSON 시작/끝 위치 찾기 (혹시 앞뒤에 다른 텍스트가 있을 경우)
    const jsonStartIndex = jsonStr.indexOf('{');
    const jsonEndIndex = jsonStr.lastIndexOf('}');
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
      jsonStr = jsonStr.substring(jsonStartIndex, jsonEndIndex + 1);
      console.log("📝 [서버] JSON 추출 완료:", jsonStr.substring(0, 300));
    }
    
    let parsedData;
    try {
      parsedData = JSON.parse(jsonStr);
      console.log("✅ [서버] JSON 파싱 성공:", parsedData);
    } catch (parseError: any) {
      console.error("❌ [서버] JSON 파싱 실패:", parseError.message);
      console.error("   - 파싱 시도한 문자열:", jsonStr);
      throw new Error(`JSON 파싱 에러: ${parseError.message}`);
    }
    
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
