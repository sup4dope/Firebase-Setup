import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractBusinessRegistrationFromBase64, extractVatCertificateFromBase64, extractCreditReportFromBase64 } from "./geminiOCR";
import { setUserCustomClaims, syncAllUserClaims, getUserCustomClaims } from "./firebaseAdmin";
import { sendConsultationAlimtalk, sendBulkDelayAlimtalk, checkSolapiConfig } from "./solapiService";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // 디버그: 사용 가능한 Gemini 모델 목록 조회
  app.get("/api/debug/gemini-models", async (req, res) => {
    console.log("🔍 [디버그] Gemini 모델 목록 조회...");
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY 없음" });
    }
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
      console.log("Final Request URL:", url.replace(apiKey, "MASKED"));
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log("📥 모델 목록 응답:", JSON.stringify(data, null, 2).substring(0, 3000));
      
      if (data.models) {
        const modelNames = data.models.map((m: any) => m.name);
        console.log("✅ 사용 가능한 모델:", modelNames);
        res.json({ success: true, models: modelNames, raw: data });
      } else {
        res.json({ success: false, error: data.error, raw: data });
      }
    } catch (error: any) {
      console.error("❌ 모델 목록 조회 실패:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // OCR API endpoint for business registration extraction
  app.post("/api/ocr/business-registration", async (req, res) => {
    console.log("📥 [라우터] OCR API 요청 수신");
    
    try {
      const { base64Data, mimeType } = req.body;
      
      console.log(`   - Base64 존재: ${base64Data ? '✅' : '❌'}, 길이: ${base64Data?.length || 0}`);
      console.log(`   - MIME 타입: ${mimeType || '(없음)'}`);
      
      if (!base64Data || !mimeType) {
        console.log("❌ [라우터] 필수 파라미터 누락");
        return res.status(400).json({ 
          error: "base64Data와 mimeType이 필요합니다." 
        });
      }
      
      console.log("🔄 [라우터] OCR 처리 함수 호출...");
      const result = await extractBusinessRegistrationFromBase64(base64Data, mimeType) as any;
      
      // _error 필드가 있으면 에러가 발생한 것
      if (result?._error) {
        console.log("⚠️ [라우터] OCR 실패 (에러 발생):", result._error);
        res.json({ 
          success: false, 
          error: result._error, 
          data: result,
          details: "OCR 처리 중 에러 발생, 빈 데이터 반환됨" 
        });
      } else if (result) {
        console.log("✅ [라우터] OCR 성공:", Object.keys(result));
        res.json({ success: true, data: result });
      } else {
        console.log("❌ [라우터] OCR 실패 (결과 없음)");
        res.json({ success: false, error: "OCR 결과가 비어 있습니다.", details: "extractBusinessRegistrationFromBase64 returned null" });
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || "";
      console.error("❌ [라우터] OCR API 예외:", errorMessage);
      console.error("   - Stack:", errorStack);
      res.status(500).json({ 
        success: false, 
        error: errorMessage,
        stack: errorStack,
        details: "서버에서 OCR 처리 중 예외 발생"
      });
    }
  });

  // OCR API endpoint for VAT certificate (부가가치세 과세표준증명)
  app.post("/api/ocr/vat-certificate", async (req, res) => {
    console.log("📥 [라우터] 부가세 과세표준증명 OCR 요청 수신");
    
    try {
      const { base64Data, mimeType } = req.body;
      
      console.log(`   - Base64 존재: ${base64Data ? '✅' : '❌'}, 길이: ${base64Data?.length || 0}`);
      console.log(`   - MIME 타입: ${mimeType || '(없음)'}`);
      
      if (!base64Data || !mimeType) {
        console.log("❌ [라우터] 필수 파라미터 누락");
        return res.status(400).json({ 
          error: "base64Data와 mimeType이 필요합니다." 
        });
      }
      
      console.log("🔄 [라우터] 부가세 OCR 처리 함수 호출...");
      const result = await extractVatCertificateFromBase64(base64Data, mimeType);
      
      if (result) {
        console.log("✅ [라우터] 부가세 OCR 성공:", result);
        res.json({ success: true, data: result });
      } else {
        console.log("❌ [라우터] 부가세 OCR 실패 (결과 없음)");
        res.json({ success: false, error: "OCR 결과가 비어 있습니다." });
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error("❌ [라우터] 부가세 OCR API 예외:", errorMessage);
      res.status(500).json({ 
        success: false, 
        error: errorMessage,
        details: "서버에서 OCR 처리 중 예외 발생"
      });
    }
  });

  // OCR API endpoint for credit report (사업자신용정보공여내역)
  app.post("/api/ocr/credit-report", async (req, res) => {
    console.log("📥 [라우터] 신용공여내역 OCR 요청 수신");
    
    try {
      const { base64Data, mimeType } = req.body;
      
      console.log(`   - Base64 존재: ${base64Data ? '✅' : '❌'}, 길이: ${base64Data?.length || 0}`);
      console.log(`   - MIME 타입: ${mimeType || '(없음)'}`);
      
      if (!base64Data || !mimeType) {
        console.log("❌ [라우터] 필수 파라미터 누락");
        return res.status(400).json({ 
          error: "base64Data와 mimeType이 필요합니다." 
        });
      }
      
      console.log("🔄 [라우터] 신용공여내역 OCR 처리 함수 호출...");
      const result = await extractCreditReportFromBase64(base64Data, mimeType);
      
      if (result) {
        console.log("✅ [라우터] 신용공여내역 OCR 성공:", result.obligations?.length || 0, "건");
        res.json({ success: true, data: result });
      } else {
        console.log("❌ [라우터] 신용공여내역 OCR 실패 (결과 없음)");
        res.json({ success: false, error: "OCR 결과가 비어 있습니다." });
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error("❌ [라우터] 신용공여내역 OCR API 예외:", errorMessage);
      res.status(500).json({ 
        success: false, 
        error: errorMessage,
        details: "서버에서 OCR 처리 중 예외 발생"
      });
    }
  });

  // === Firebase Custom Claims API ===
  
  // 단일 사용자 Custom Claims 설정
  app.post("/api/admin/set-custom-claims", async (req, res) => {
    console.log("📥 [Admin] Custom Claims 설정 요청");
    
    try {
      const { uid, role, team_id } = req.body;
      
      if (!uid || !role) {
        return res.status(400).json({ 
          success: false, 
          error: "uid와 role이 필요합니다." 
        });
      }
      
      await setUserCustomClaims(uid, role, team_id);
      
      res.json({ 
        success: true, 
        message: `Custom claim 설정 완료: ${uid} -> role: ${role}, team_id: ${team_id || 'N/A'}` 
      });
    } catch (error: any) {
      console.error("❌ Custom Claims 설정 실패:", error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // 다중 사용자 Custom Claims 일괄 설정 (마이그레이션용)
  app.post("/api/admin/sync-all-claims", async (req, res) => {
    console.log("📥 [Admin] 전체 사용자 Custom Claims 동기화 요청");
    
    try {
      const { users } = req.body;
      
      if (!users || !Array.isArray(users)) {
        return res.status(400).json({ 
          success: false, 
          error: "users 배열이 필요합니다. [{uid, role}, ...]" 
        });
      }
      
      const results = await syncAllUserClaims(users);
      
      console.log(`✅ 동기화 완료: 성공 ${results.success}건, 실패 ${results.failed}건`);
      
      res.json({ 
        success: true, 
        results 
      });
    } catch (error: any) {
      console.error("❌ 전체 동기화 실패:", error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // 사용자 Custom Claims 조회
  app.get("/api/admin/get-custom-claims/:uid", async (req, res) => {
    console.log("📥 [Admin] Custom Claims 조회 요청");
    
    try {
      const { uid } = req.params;
      
      if (!uid) {
        return res.status(400).json({ 
          success: false, 
          error: "uid가 필요합니다." 
        });
      }
      
      const claims = await getUserCustomClaims(uid);
      
      res.json({ 
        success: true, 
        uid,
        claims 
      });
    } catch (error: any) {
      console.error("❌ Custom Claims 조회 실패:", error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Solapi 설정 상태 확인
  app.get("/api/solapi/status", async (req, res) => {
    console.log("🔍 [Solapi] 설정 상태 조회");
    
    const config = checkSolapiConfig();
    res.json({
      success: true,
      configured: config.configured,
      missing: config.missing,
    });
  });

  // 상담 접수 알림톡 발송 (랜딩페이지에서 호출 - 고객에게 접수 확인 알림)
  app.post("/api/solapi/consultation-notify", async (req, res) => {
    console.log("📤 [Solapi] 상담 접수 확인 알림톡 발송 요청");
    
    try {
      const { customerPhone, customerName, services, createdAt } = req.body;
      
      if (!customerPhone) {
        return res.status(400).json({
          success: false,
          error: "customerPhone(고객 전화번호)은 필수입니다.",
        });
      }
      
      if (!customerName) {
        return res.status(400).json({
          success: false,
          error: "customerName(고객명)은 필수입니다.",
        });
      }
      
      const result = await sendConsultationAlimtalk({
        customerPhone,
        customerName,
        services: services || [],
        createdAt: createdAt ? new Date(createdAt) : new Date(),
      });
      
      console.log(`📤 [Solapi] 고객(${customerPhone}) 알림톡 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 알림톡 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // 지연 알림톡 일괄 발송 (미처리 상담 고객 대상)
  app.post("/api/solapi/delay-notify", async (req, res) => {
    console.log("📤 [Solapi] 지연 알림톡 일괄 발송 요청");
    
    try {
      const { customers } = req.body;
      
      if (!customers || !Array.isArray(customers) || customers.length === 0) {
        return res.status(400).json({
          success: false,
          error: "customers 배열은 필수입니다.",
        });
      }
      
      const result = await sendBulkDelayAlimtalk(customers);
      
      console.log(`📤 [Solapi] 지연 알림톡 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 지연 알림톡 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return httpServer;
}
