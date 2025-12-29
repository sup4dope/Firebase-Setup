import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractBusinessRegistrationFromBase64 } from "./geminiOCR";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // OCR API endpoint for business registration extraction
  app.post("/api/ocr/business-registration", async (req, res) => {
    try {
      const { base64Data, mimeType } = req.body;
      
      if (!base64Data || !mimeType) {
        return res.status(400).json({ 
          error: "base64Data와 mimeType이 필요합니다." 
        });
      }
      
      const result = await extractBusinessRegistrationFromBase64(base64Data, mimeType);
      
      if (result) {
        res.json({ success: true, data: result });
      } else {
        res.json({ success: false, error: "OCR 처리에 실패했습니다." });
      }
    } catch (error) {
      console.error("OCR API 오류:", error);
      res.status(500).json({ 
        success: false, 
        error: "서버 오류가 발생했습니다." 
      });
    }
  });

  return httpServer;
}
