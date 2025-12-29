import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractBusinessRegistrationFromBase64 } from "./geminiOCR";

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

  return httpServer;
}
