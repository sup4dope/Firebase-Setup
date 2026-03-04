import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractBusinessRegistrationFromBase64, extractVatCertificateFromBase64, extractCreditReportFromBase64 } from "./geminiOCR";
import { setUserCustomClaims, syncAllUserClaims, getUserCustomClaims, requireAuth, requireSuperAdmin, getAdminApp, type AuthenticatedRequest } from "./firebaseAdmin";
import { sendConsultationAlimtalk, sendBulkDelayAlimtalk, sendAssignmentAlimtalk, sendBusinessCardAlimtalk, sendLongAbsenceAlimtalk, getBranchFromRegion, checkSolapiConfig } from "./solapiService";
import { getTemplates, getTemplateDetail, createDocument, getDocument, getDocuments, checkEformsignConfig, mapEformsignStatus } from "./eformsignService";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // 디버그: 사용 가능한 Gemini 모델 목록 조회 (인증 필요)
  app.get("/api/debug/gemini-models", requireAuth, async (req, res) => {
    console.log("🔍 [디버그] Gemini 모델 목록 조회...");
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "API 키가 설정되지 않았습니다." });
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
        res.json({ success: true, models: modelNames });
      } else {
        console.error("모델 목록 조회 실패:", data.error);
        res.json({ success: false, error: "모델 목록을 가져올 수 없습니다." });
      }
    } catch (error: any) {
      console.error("❌ 모델 목록 조회 실패:", error.message);
      res.status(500).json({ error: "모델 목록 조회 중 오류가 발생했습니다." });
    }
  });

  // OCR API endpoint for business registration extraction (인증 필요)
  app.post("/api/ocr/business-registration", requireAuth, async (req, res) => {
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
          error: "OCR 인식에 실패했습니다. 다시 시도해주세요."
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
        error: "OCR 처리 중 오류가 발생했습니다."
      });
    }
  });

  // OCR API endpoint for VAT certificate (인증 필요)
  app.post("/api/ocr/vat-certificate", requireAuth, async (req, res) => {
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
        error: "OCR 처리 중 오류가 발생했습니다."
      });
    }
  });

  // OCR API endpoint for credit report (인증 필요)
  app.post("/api/ocr/credit-report", requireAuth, async (req, res) => {
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
        error: "OCR 처리 중 오류가 발생했습니다."
      });
    }
  });

  // === Firebase Custom Claims API ===

  // 자기 자신의 Custom Claims 자동 설정 (첫 로그인 시)
  app.post("/api/auth/init-claims", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email;
      if (!uid) {
        return res.status(401).json({ success: false, error: '인증 정보가 없습니다.' });
      }

      const adminApp = getAdminApp();
      const usersRef = adminApp.firestore().collection('users');
      
      // uid로 먼저 검색, 없으면 email로 fallback (Admin SDK는 Security Rules 우회)
      let userDoc = await usersRef.where('uid', '==', uid).get();
      
      if (userDoc.empty && email) {
        userDoc = await usersRef.where('email', '==', email).get();
        
        // email로 찾은 경우 uid 바인딩도 수행
        if (!userDoc.empty) {
          const docRef = userDoc.docs[0].ref;
          await docRef.update({ uid });
          console.log(`🔗 [Auth] uid 바인딩 완료: ${email} -> ${uid}`);
        }
      }
      
      if (userDoc.empty) {
        return res.status(404).json({ success: false, error: '등록된 사용자를 찾을 수 없습니다.' });
      }

      const userData = userDoc.docs[0].data();
      const role = userData.role;
      const team_id = userData.team_id || '';

      if (!role) {
        return res.status(400).json({ success: false, error: '역할이 설정되지 않은 사용자입니다.' });
      }

      await setUserCustomClaims(uid, role, team_id);
      console.log(`✅ [Auth] 자동 Claims 설정: ${uid} -> role: ${role}, team_id: ${team_id}`);

      res.json({ success: true, role, team_id });
    } catch (error: any) {
      console.error("❌ 자동 Claims 설정 실패:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 단일 사용자 Custom Claims 설정 (super_admin 전용)
  app.post("/api/admin/set-custom-claims", requireAuth, requireSuperAdmin, async (req, res) => {
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

  // 다중 사용자 Custom Claims 일괄 설정 (super_admin 전용)
  app.post("/api/admin/sync-all-claims", requireAuth, requireSuperAdmin, async (req, res) => {
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

  // 사용자 Custom Claims 조회 (super_admin 전용)
  app.get("/api/admin/get-custom-claims/:uid", requireAuth, requireSuperAdmin, async (req, res) => {
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
  app.get("/api/solapi/status", requireAuth, async (req, res) => {
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
      const { customerPhone, customerName, services, createdAt, utm_source, utm_medium, utm_campaign } = req.body;
      
      if (utm_source || utm_medium || utm_campaign) {
        console.log(`📊 [UTM] source=${utm_source || 'direct'}, medium=${utm_medium || 'direct'}, campaign=${utm_campaign || 'direct'}`);
      }
      
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
        error: "알림톡 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // 지연 알림톡 일괄 발송 (인증 필요)
  app.post("/api/solapi/delay-notify", requireAuth, async (req, res) => {
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
        error: "지연 알림톡 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // 담당자 배정 알림톡 발송 (인증 필요)
  app.post("/api/solapi/assignment-notify", requireAuth, async (req, res) => {
    console.log("📤 [Solapi] 담당자 배정 알림톡 발송 요청");
    
    try {
      const { customerPhone, customerName, managerName, managerPhone, region } = req.body;
      
      if (!customerPhone || !customerName || !managerName) {
        return res.status(400).json({
          success: false,
          error: "customerPhone, customerName, managerName은 필수입니다.",
        });
      }
      
      // 지역 → 지점 변환
      const branchName = getBranchFromRegion(region || '');
      
      const result = await sendAssignmentAlimtalk({
        customerPhone,
        customerName,
        managerName,
        managerPhone: managerPhone || '',
        branchName,
      });
      
      console.log(`📤 [Solapi] 담당자 배정 알림톡 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 담당자 배정 알림톡 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: "담당자 배정 알림톡 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // 장기부재 알림 발송 API (인증 필요)
  app.post("/api/solapi/send-longabsence", requireAuth, async (req, res) => {
    try {
      const { customerPhone, customerName, services } = req.body;
      
      if (!customerPhone) {
        return res.status(400).json({
          success: false,
          error: "customerPhone은 필수입니다.",
        });
      }
      
      const result = await sendLongAbsenceAlimtalk({
        customerPhone,
        customerName: customerName || '고객',
        services: services || [],
      });
      
      console.log(`📤 [Solapi] 장기부재 알림 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 장기부재 알림 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: "장기부재 알림 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // 명함 발송 API (인증 필요)
  app.post("/api/solapi/send-businesscard", requireAuth, async (req, res) => {
    try {
      const { customerPhone, customerName, managerName, managerPhone, managerEmail, businessAddress } = req.body;
      
      if (!customerPhone || !managerName) {
        return res.status(400).json({
          success: false,
          error: "customerPhone, managerName은 필수입니다.",
        });
      }
      
      // 사업장 주소 → 지점 변환 (없으면 본사)
      const branchName = businessAddress ? getBranchFromRegion(businessAddress) : '본사';
      
      const result = await sendBusinessCardAlimtalk({
        customerPhone,
        customerName: customerName || '고객',
        managerName,
        branchName,
        managerPhone: managerPhone || '',
        managerEmail: managerEmail || '',
      });
      
      console.log(`📤 [Solapi] 명함 발송 결과: ${result.message}`);
      
      res.json(result);
    } catch (error: any) {
      console.error("❌ [Solapi] 명함 발송 오류:", error.message);
      res.status(500).json({
        success: false,
        error: "명함 발송 중 오류가 발생했습니다.",
      });
    }
  });

  // ============================================================
  // eformsign 전자계약 API
  // ============================================================

  app.get("/api/eformsign/status", requireAuth, async (req, res) => {
    const config = checkEformsignConfig();
    res.json(config);
  });

  app.get("/api/eformsign/templates", requireAuth, async (req, res) => {
    try {
      const templates = await getTemplates();
      console.log("[eformsign] 템플릿 목록 조회 성공");
      res.json({ success: true, data: templates });
    } catch (error: any) {
      console.error("[eformsign] 템플릿 목록 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/eformsign/templates/:templateId", requireAuth, async (req, res) => {
    try {
      const detail = await getTemplateDetail(req.params.templateId);
      console.log(`[eformsign] 템플릿 상세 조회: ${req.params.templateId}`);
      res.json({ success: true, data: detail });
    } catch (error: any) {
      console.error("[eformsign] 템플릿 상세 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/documents", requireAuth, async (req, res) => {
    try {
      const { template_id, document_name, fields, recipients, comment } = req.body;

      if (!template_id) {
        return res.status(400).json({ success: false, error: "template_id가 필요합니다." });
      }

      const result = await createDocument(template_id, {
        document_name,
        fields,
        recipients,
        comment,
      });

      console.log(`[eformsign] 문서 생성 성공: template=${template_id}`);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("[eformsign] 문서 생성 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/eformsign/documents/:documentId", requireAuth, async (req, res) => {
    try {
      const doc = await getDocument(req.params.documentId);
      console.log(`[eformsign] 문서 상태 조회: ${req.params.documentId}`);
      res.json({ success: true, data: doc });
    } catch (error: any) {
      console.error("[eformsign] 문서 상태 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/eformsign/documents", requireAuth, async (req, res) => {
    try {
      const { type, status, from, to, limit: limitParam, offset } = req.query;
      const docs = await getDocuments({
        type: type as string,
        status: status as string,
        from: from as string,
        to: to as string,
        limit: limitParam ? Number(limitParam) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      console.log("[eformsign] 문서 목록 조회 성공");
      res.json({ success: true, data: docs });
    } catch (error: any) {
      console.error("[eformsign] 문서 목록 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Webhook - eformsign에서 호출 (인증 없음)
  app.post("/api/eformsign/webhook", async (req, res) => {
    try {
      const { event, document_id, document_name, template_id, status } = req.body;
      console.log(`[eformsign Webhook] event=${event}, doc_id=${document_id}, status=${status}`);

      const mappedStatus = mapEformsignStatus(event || status || '');

      const admin = getAdminApp();
      const firestore = admin.firestore();

      const contractsRef = firestore.collection('contracts_eformsign');
      const snapshot = await contractsRef.where('document_id', '==', document_id).limit(1).get();

      if (!snapshot.empty) {
        const contractDoc = snapshot.docs[0];
        const updateData: Record<string, any> = {
          status: mappedStatus,
        };

        if (mappedStatus === '서명완료') {
          updateData.completed_at = new Date().toISOString();
        }

        await contractDoc.ref.update(updateData);
        console.log(`[eformsign Webhook] 계약 상태 업데이트: ${contractDoc.id} → ${mappedStatus}`);
      } else {
        console.log(`[eformsign Webhook] document_id=${document_id}에 해당하는 계약을 찾지 못함`);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[eformsign Webhook] 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return httpServer;
}
