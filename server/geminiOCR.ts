/**
 * Gemini 1.5 Flash API를 사용한 사업자등록증 OCR 서비스 (서버 측)
 * v1 API 경로 + gemini-1.5-flash 모델 고정
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

  const pureBase64 = stripBase64Header(base64Data);
  console.log(`   - 순수 Base64 길이: ${pureBase64.length}`);
  
  // URL 고정: v1 + gemini-2.0-flash-lite (API 키에서 사용 가능한 모델)
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
  
  console.log("Final Request URL:", url.replace(apiKey, "MASKED"));
  
  // Body 수동 구성
  const body = {
    "contents": [{
      "parts": [
        { "text": "사업자등록증에서 상호명, 대표자명, 개업일, 사업자번호, 종목, 업종, 소재지를 추출해 JSON으로 응답해줘. 반드시 다음 형식으로만 응답해: {\"company_name\":\"\",\"ceo_name\":\"\",\"founding_date\":\"\",\"business_registration_number\":\"\",\"resident_registration_number\":\"\",\"business_type\":\"\",\"business_item\":\"\",\"business_address\":\"\"}" },
        { "inline_data": { "mime_type": mimeType, "data": pureBase64 } }
      ]
    }]
  };

  try {
    console.log("📡 [서버] Gemini API 호출...");
    console.log(`   - 모델: gemini-2.0-flash-lite`);
    console.log(`   - MIME: ${mimeType}`);
    console.log(`   - 데이터 크기: ${pureBase64.length} bytes`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    console.log(`📡 [서버] 응답 상태: ${response.status}`);
    
    const data = await response.json();
    console.log("📥 [서버] Raw 응답:", JSON.stringify(data, null, 2).substring(0, 2000));
    
    // 429 할당량 초과 에러 처리
    if (response.status === 429) {
      console.error("⚠️ [서버] API 할당량 초과 (429)");
      throw new Error("오늘 무료 사용량이 소진되었습니다. 잠시 후 다시 시도하거나 결제 설정을 확인해 주세요.");
    }
    
    // 기타 에러 처리
    if (!response.ok) {
      const errorMessage = data?.error?.message || JSON.stringify(data);
      throw new Error(`API 호출 실패 (${response.status}): ${errorMessage}`);
    }
    
    if (data.error) {
      throw new Error(`AI 응답 에러: ${data.error.message}`);
    }

    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;
    console.log("📊 [서버] finishReason:", finishReason);
    
    if (finishReason && finishReason !== "STOP") {
      console.error("⚠️ [서버] AI 응답 거부됨:", finishReason);
      if (candidate?.safetyRatings) {
        console.error("   - safetyRatings:", JSON.stringify(candidate.safetyRatings, null, 2));
      }
      throw new Error(`AI 응답 거부: ${finishReason}`);
    }

    const textContent = candidate?.content?.parts?.[0]?.text;
    console.log("📝 [서버] 원본 텍스트 응답:", textContent);
    
    if (!textContent) {
      throw new Error("빈 응답 에러: AI로부터 텍스트 응답을 받지 못했습니다.");
    }

    let jsonStr = textContent.trim();
    
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    
    const jsonStartIndex = jsonStr.indexOf('{');
    const jsonEndIndex = jsonStr.lastIndexOf('}');
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
      jsonStr = jsonStr.substring(jsonStartIndex, jsonEndIndex + 1);
    }
    
    let parsedData;
    try {
      parsedData = JSON.parse(jsonStr);
      console.log("✅ [서버] JSON 파싱 성공:", parsedData);
    } catch (parseError: any) {
      console.error("❌ [서버] JSON 파싱 실패:", parseError.message);
      throw new Error(`JSON 파싱 에러: ${parseError.message}`);
    }
    
    const extractedResult: BusinessRegistrationData = {
      company_name: parsedData.company_name?.trim() || parsedData["상호명"]?.trim() || undefined,
      ceo_name: parsedData.ceo_name?.trim() || parsedData["대표자명"]?.trim() || undefined,
      founding_date: formatDate(parsedData.founding_date || parsedData["개업일"] || "") || undefined,
      business_registration_number: formatBusinessNumber(parsedData.business_registration_number || parsedData["사업자번호"] || "") || undefined,
      resident_registration_number: parsedData.resident_registration_number?.trim() || undefined,
      business_type: parsedData.business_type?.trim() || parsedData["업종"]?.trim() || undefined,
      business_item: parsedData.business_item?.trim() || parsedData["종목"]?.trim() || undefined,
      business_address: parsedData.business_address?.trim() || parsedData["소재지"]?.trim() || undefined,
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
