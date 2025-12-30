/**
 * Gemini 2.0 Flash API를 사용한 사업자등록증 OCR 서비스 (서버 측)
 * v1 API 경로 + gemini-2.0-flash 모델 고정 (Tier 1)
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

function parseResidentId(residentId: string): { front: string; back: string } {
  if (!residentId) return { front: "", back: "" };
  
  const cleaned = residentId.replace(/\s/g, '');
  
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    return {
      front: parts[0]?.substring(0, 6) || "",
      back: parts[1]?.substring(0, 7) || ""
    };
  }
  
  if (cleaned.length >= 13) {
    return {
      front: cleaned.substring(0, 6),
      back: cleaned.substring(6, 13)
    };
  }
  
  return { front: cleaned, back: "" };
}

function parseAddress(address: string): { base: string; detail: string } {
  if (!address) return { base: "", detail: "" };
  
  const commaIndex = address.indexOf(',');
  if (commaIndex !== -1) {
    return {
      base: address.substring(0, commaIndex).trim(),
      detail: address.substring(commaIndex + 1).trim()
    };
  }
  
  return { base: address.trim(), detail: "" };
}

function parseBusinessType(businessType: string): string[] {
  if (!businessType) return [];
  
  const types = businessType.split('/').map(t => t.trim()).filter(t => t.length > 0);
  return types.length > 0 ? types : [businessType.trim()];
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
  
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  console.log("Final Request URL:", url.replace(apiKey, "MASKED"));
  
  const systemPrompt = `너는 한국의 '사업자등록증명' 이미지를 분석하여 특정 UI 폼(Form)에 맞는 JSON 데이터를 생성하는 OCR 데이터 엔지니어야.

다음 규칙에 따라 데이터를 가공하고 매핑해줘:
1. 상호(법인명) → company_name: 있는 그대로 추출
2. 사업자등록번호 → business_registration_number: 하이픈 포함 여부 관계없이 유지
3. 대표자성명 → ceo_name: 있는 그대로 추출
4. 주민(법인)등록번호 → resident_id: 하이픈 포함하여 전체 추출 (예: 800101-1234567)
5. 사업장소재지 → business_address: 전체 주소 추출
6. 개업일/사업자등록일 → founding_date: YYYY-MM-DD 형식으로 변환
7. 업태 → business_type: 슬래시(/)로 구분된 경우 그대로 유지
8. 종목 → business_item: 있는 그대로 추출

반드시 아래 JSON 형식으로만 응답해:
{"company_name":"","ceo_name":"","founding_date":"","business_registration_number":"","resident_id":"","business_type":"","business_item":"","business_address":""}`;

  const body = {
    "contents": [{
      "parts": [
        { "text": systemPrompt },
        { "inline_data": { "mime_type": mimeType, "data": pureBase64 } }
      ]
    }]
  };

  try {
    console.log("📡 [서버] Gemini API 호출...");
    console.log(`   - 모델: gemini-2.0-flash (Tier 1)`);
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
    
    if (response.status === 429) {
      console.error("⚠️ [서버] API 할당량 초과 (429)");
      throw new Error("오늘 무료 사용량이 소진되었습니다. 잠시 후 다시 시도하거나 결제 설정을 확인해 주세요.");
    }
    
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
    
    const residentIdParsed = parseResidentId(parsedData.resident_id || parsedData.resident_registration_number || "");
    const addressParsed = parseAddress(parsedData.business_address || "");
    const businessTypeList = parseBusinessType(parsedData.business_type || "");
    
    const extractedResult: BusinessRegistrationData = {
      company_name: parsedData.company_name?.trim() || "",
      ceo_name: parsedData.ceo_name?.trim() || "",
      founding_date: formatDate(parsedData.founding_date || "") || "",
      business_registration_number: formatBusinessNumber(parsedData.business_registration_number || "") || "",
      resident_id_front: residentIdParsed.front,
      resident_id_back: residentIdParsed.back,
      business_type: businessTypeList[0] || "",
      business_type_list: businessTypeList,
      business_item: parsedData.business_item?.trim() || "",
      business_address: addressParsed.base,
      business_address_detail: addressParsed.detail,
    };

    console.log("✅ 사업자등록증 OCR 결과 (가공완료):", extractedResult);
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
      resident_id_front: "",
      resident_id_back: "",
      business_type: "",
      business_type_list: [],
      business_item: "",
      business_address: "",
      business_address_detail: "",
      _error: error?.message || "알 수 없는 오류"
    } as BusinessRegistrationData & { _error?: string };
  }
}

// ========== 부가가치세 과세표준증명 OCR ==========

export interface VatCertificateData {
  recent_sales?: number;  // 최근 매출 (억원)
  sales_y1?: number;      // Y-1 매출 (억원)
  sales_y2?: number;      // Y-2 매출 (억원)
  sales_y3?: number;      // Y-3 매출 (억원)
  raw_data?: { year: number; amount: number }[];  // 원본 연도별 데이터
}

function convertToEok(amount: number): number {
  // 원화를 억원으로 변환 (소수점 둘째 자리까지)
  return Math.round(amount / 100000000 * 100) / 100;
}

export async function extractVatCertificateFromBase64(
  base64Data: string,
  mimeType: string
): Promise<VatCertificateData | null> {
  const currentYear = new Date().getFullYear();
  
  console.log("🔍 [서버] 부가가치세 과세표준증명 OCR 시작");
  console.log(`   📅 현재 기준 연도: ${currentYear}년`);
  console.log(`   📅 Y-1: ${currentYear - 1}년, Y-2: ${currentYear - 2}년, Y-3: ${currentYear - 3}년`);
  console.log(`   - 원본 Base64 길이: ${base64Data?.length || 0}`);
  console.log(`   - MIME 타입: ${mimeType}`);
  
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("❌ [서버] GEMINI_API_KEY 환경변수 없음");
    return null;
  }
  
  const cleanBase64 = stripBase64Header(base64Data);
  
  const prompt = `이 문서는 한국의 "부가가치세 과세표준증명" 또는 "부가가치세과세표준증명원"입니다.
문서에서 각 과세기간(연도)별 매출 금액을 추출해 주세요.

추출 규칙:
1. "과세기간" 또는 "귀속연도"에서 연도(YYYY)를 추출
2. 해당 연도의 "계", "합계", "과세표준" 금액을 추출
3. 같은 연도에 여러 기간(1기, 2기 등)이 있다면 모두 합산
4. 금액은 숫자만 추출 (쉼표, 원 등 제거)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "sales_by_year": [
    {"year": 2024, "total_amount": 288611996},
    {"year": 2023, "total_amount": 356000000},
    {"year": 2022, "total_amount": 420000000}
  ]
}

- year: 4자리 연도 숫자
- total_amount: 해당 연도 전체 합계 금액 (원 단위, 숫자만)
- 데이터가 없는 연도는 포함하지 마세요`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: cleanBase64
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 2048
    }
  };

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    console.log("📡 [서버] Gemini API 호출 (부가세 과세표준증명)...");
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [서버] API 오류 ${response.status}:`, errorText);
      return null;
    }
    
    const result = await response.json();
    console.log("📥 [서버] Gemini 응답 수신");
    
    const textContent = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) {
      console.error("❌ [서버] 응답에 텍스트 없음");
      return null;
    }
    
    console.log("📝 [서버] 원본 응답:", textContent);
    
    // JSON 추출
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("❌ [서버] JSON 형식 없음");
      return null;
    }
    
    const parsedData = JSON.parse(jsonMatch[0]);
    console.log("✅ [서버] JSON 파싱 성공:", parsedData);
    
    // 연도별 매출 데이터 매핑
    const salesByYear = parsedData.sales_by_year || [];
    const yearMap: { [key: number]: number } = {};
    
    // 같은 연도 합산
    for (const item of salesByYear) {
      const year = Number(item.year);
      const amount = Number(item.total_amount) || 0;
      yearMap[year] = (yearMap[year] || 0) + amount;
    }
    
    console.log("📊 [서버] 연도별 매출 합산 결과:", yearMap);
    
    // 현재 연도 기준으로 매핑
    const recentSales = yearMap[currentYear] ? convertToEok(yearMap[currentYear]) : undefined;
    const salesY1 = yearMap[currentYear - 1] ? convertToEok(yearMap[currentYear - 1]) : undefined;
    const salesY2 = yearMap[currentYear - 2] ? convertToEok(yearMap[currentYear - 2]) : undefined;
    const salesY3 = yearMap[currentYear - 3] ? convertToEok(yearMap[currentYear - 3]) : undefined;
    
    console.log(`✅ [서버] 매출 매핑 결과:`);
    console.log(`   - 최근매출 (${currentYear}년): ${recentSales !== undefined ? recentSales + '억' : '데이터 없음'}`);
    console.log(`   - Y-1 매출 (${currentYear - 1}년): ${salesY1 !== undefined ? salesY1 + '억' : '데이터 없음'}`);
    console.log(`   - Y-2 매출 (${currentYear - 2}년): ${salesY2 !== undefined ? salesY2 + '억' : '데이터 없음'}`);
    console.log(`   - Y-3 매출 (${currentYear - 3}년): ${salesY3 !== undefined ? salesY3 + '억' : '데이터 없음'}`);
    
    return {
      recent_sales: recentSales,
      sales_y1: salesY1,
      sales_y2: salesY2,
      sales_y3: salesY3,
      raw_data: Object.entries(yearMap).map(([year, amount]) => ({
        year: Number(year),
        amount: convertToEok(amount)
      }))
    };
    
  } catch (error: any) {
    console.error("❌ [서버] 부가세 과세표준증명 OCR 실패:", error);
    return null;
  }
}
