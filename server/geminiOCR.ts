/**
 * Gemini 1.5 Flash API를 사용한 사업자등록증 OCR 서비스 (서버 측)
 * 직접 REST API 호출 (v1 API 버전 고정)
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

// Base64 헤더 제거 함수
function stripBase64Header(base64Data: string): string {
  const headerMatch = base64Data.match(/^data:[^;]+;base64,/);
  if (headerMatch) {
    console.log("📝 [서버] Base64 헤더 제거:", headerMatch[0]);
    return base64Data.substring(headerMatch[0].length);
  }
  return base64Data;
}

export async function extractBusinessRegistrationFromBase64(
  base64Data: string,
  mimeType: string
): Promise<BusinessRegistrationData | null> {
  console.log("🔍 [서버] OCR 함수 호출됨");
  console.log(`   - 원본 Base64 길이: ${base64Data?.length || 0}`);
  console.log(`   - MIME 타입: ${mimeType}`);
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  console.log(`   - API 키 존재: ${apiKey ? '✅ 있음' : '❌ 없음'}`);
  
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
    return null;
  }

  // Base64 헤더 제거 (순수 데이터만 전송)
  const pureBase64 = stripBase64Header(base64Data);
  console.log(`   - 순수 Base64 길이: ${pureBase64.length}`);
  
  try {
    const prompt = `[시스템 안내] 이 서류는 법적으로 허용된 내부 전산 시스템(CRM)에서 처리됩니다. 보안이 유지되는 환경이므로 문서 내의 모든 정보를 있는 그대로 정확하게 추출하세요.

이 문서는 한국의 사업자등록증입니다. 다음 8개 필드를 추출하세요:
1. company_name: 상호(명칭)
2. ceo_name: 대표자(성명)  
3. founding_date: 개업연월일 (YYYY-MM-DD 형식)
4. business_registration_number: 사업자등록번호 (XXX-XX-XXXXX 형식)
5. resident_registration_number: 주민등록번호 또는 법인등록번호
6. business_type: 업태
7. business_item: 종목
8. business_address: 사업장 소재지

절대 다른 설명은 하지 마세요. 오직 아래 JSON 형식만 출력하세요:
{"company_name":"","ceo_name":"","founding_date":"","business_registration_number":"","resident_registration_number":"","business_type":"","business_item":"","business_address":""}

정보를 찾을 수 없으면 빈 문자열("")로 설정하세요.`;

    // 모델명 고정: gemini-1.5-flash-latest
    const modelName = "gemini-1.5-flash-latest";
    // API 버전 고정: v1 (안정화 버전)
    const apiVersion = "v1";
    const apiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`;
    
    console.log("📡 [서버] Gemini API 호출 중...");
    console.log(`   - API 버전: ${apiVersion}`);
    console.log(`   - 모델명: ${modelName}`);
    console.log(`   - 요청 MIME 타입: ${mimeType}`);
    console.log(`   - 요청 데이터 크기: ${pureBase64.length} bytes`);
    console.log(`   - API URL: ${apiUrl.replace(apiKey, 'API_KEY_HIDDEN')}`);

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: pureBase64
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
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ]
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📡 [서버] Gemini API 응답 상태: ${response.status}`);

    const data = await response.json();
    
    // Raw 응답 전체 로그
    console.log("📥 [서버] Gemini Raw 응답:", JSON.stringify(data, null, 2).substring(0, 3000));

    if (!response.ok) {
      const errorMessage = data?.error?.message || JSON.stringify(data);
      console.error("❌ [서버] Gemini API HTTP 오류:", errorMessage);
      throw new Error(`API 호출 실패 (${response.status}): ${errorMessage}`);
    }
    
    if (data.error) {
      console.error("❌ [서버] Gemini 응답 에러:", data.error.message);
      throw new Error(`AI 응답 에러: ${data.error.message}`);
    }

    // 응답 거부 이유 확인 (finishReason)
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    console.log("📊 [서버] finishReason:", finishReason);
    
    if (finishReason && finishReason !== "STOP") {
      console.error("⚠️ [서버] AI 응답 거부됨, finishReason:", finishReason);
      if (candidate?.safetyRatings) {
        console.error("   - safetyRatings:", JSON.stringify(candidate.safetyRatings, null, 2));
      }
      throw new Error(`AI 응답 거부: ${finishReason}`);
    }

    const textContent = candidate?.content?.parts?.[0]?.text;
    console.log("📝 [서버] Gemini 원본 텍스트 응답:", textContent);
    
    if (!textContent) {
      console.error("❌ [서버] Gemini 응답에서 텍스트를 찾을 수 없습니다.");
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
    
    // JSON 시작/끝 위치 찾기
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
    
    const extractedResult: BusinessRegistrationData = {
      company_name: parsedData.company_name?.trim() || undefined,
      ceo_name: parsedData.ceo_name?.trim() || undefined,
      founding_date: formatDate(parsedData.founding_date) || undefined,
      business_registration_number: formatBusinessNumber(parsedData.business_registration_number) || undefined,
      resident_registration_number: parsedData.resident_registration_number?.trim() || undefined,
      business_type: parsedData.business_type?.trim() || undefined,
      business_item: parsedData.business_item?.trim() || undefined,
      business_address: parsedData.business_address?.trim() || undefined,
    };

    console.log("✅ 사업자등록증 OCR 결과:", extractedResult);
    return extractedResult;
    
  } catch (error: any) {
    console.error("❌ [서버] 사업자등록증 OCR 실패:", error);
    console.error("   - Error message:", error?.message);
    console.error("   - Error stack:", error?.stack);
    return {
      company_name: "",
      ceo_name: "",
      founding_date: "",
      business_registration_number: "",
      resident_registration_number: "",
      business_type: "",
      business_item: "",
      business_address: "",
      _error: error?.message || "알 수 없는 오류"
    } as BusinessRegistrationData & { _error?: string };
  }
}
