import type { Express } from "express";
import { createServer, type Server } from "http";
import admin from 'firebase-admin';
import { storage } from "./storage";
import { extractBusinessRegistrationFromBase64, extractVatCertificateFromBase64, extractCreditReportFromBase64 } from "./geminiOCR";
import { setUserCustomClaims, syncAllUserClaims, getUserCustomClaims, requireAuth, requireSuperAdmin, getAdminApp, type AuthenticatedRequest } from "./firebaseAdmin";
import { sendConsultationAlimtalk, sendBulkDelayAlimtalk, sendAssignmentAlimtalk, sendBusinessCardAlimtalk, sendLongAbsenceAlimtalk, getBranchFromRegion, checkSolapiConfig } from "./solapiService";
import { getTemplates, getTemplateDetail, createDocument, getDocument, getDocuments, checkEformsignConfig, mapEformsignStatus, extractEformsignStatus } from "./eformsignService";

const FieldValue = admin.firestore.FieldValue;

function numberToKorean(num: number): string {
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const smallUnits = ['', '십', '백', '천'];
  const bigUnits = ['', '만', '억', '조'];
  if (num === 0) return '영';
  let result = '';
  let unitIndex = 0;
  while (num > 0) {
    const chunk = num % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let temp = chunk;
      for (let i = 0; i < 4 && temp > 0; i++) {
        const digit = temp % 10;
        if (digit > 0) {
          const digitStr = (i > 0 && digit === 1) ? '' : digits[digit];
          chunkStr = digitStr + smallUnits[i] + chunkStr;
        }
        temp = Math.floor(temp / 10);
      }
      result = chunkStr + bigUnits[unitIndex] + result;
    }
    num = Math.floor(num / 10000);
    unitIndex++;
  }
  return result;
}

function formatContractAmountServer(manWon: number): string {
  const won = manWon * 10000;
  const formatted = won.toLocaleString('ko-KR');
  const korean = numberToKorean(won);
  return `${formatted} (금 ${korean} 원)`;
}

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
      console.log("[eformsign] 템플릿 목록 조회 성공, 응답:", JSON.stringify(templates).substring(0, 1000));
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

  app.post("/api/eformsign/documents", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { template_id, template_name, document_name, fields, recipients, comment,
              customer_id, customer_name, created_by } = req.body;

      if (!template_id) {
        return res.status(400).json({ success: false, error: "template_id가 필요합니다." });
      }

      const processedFields = (fields && Array.isArray(fields)) ? fields.map((f: any) => {
        if (f.id === '계약금') {
          const strVal = String(f.value).replace(/,/g, '');
          const numVal = parseFloat(strVal);
          if (!isNaN(numVal) && numVal > 0 && !/[가-힣()]/.test(String(f.value))) {
            return { ...f, value: formatContractAmountServer(numVal) };
          }
        }
        return f;
      }) : fields;

      console.log(`[eformsign] 문서 생성 요청: template_id=${template_id}, document_name=${document_name}`);
      console.log(`[eformsign] fields:`, JSON.stringify(processedFields));
      console.log(`[eformsign] recipients:`, JSON.stringify(recipients));

      const result = await createDocument(template_id, {
        document_name,
        fields: processedFields,
        recipients: recipients || [],
        comment,
      });

      console.log(`[eformsign] 문서 생성 성공: template=${template_id}, result:`, JSON.stringify(result).substring(0, 500));

      const documentId = result?.document?.id || '';
      const admin = getAdminApp();
      const firestore = admin.firestore();

      if (customer_id && documentId) {
        const now = new Date();
        const fieldsRecord: Record<string, string> = {};
        if (processedFields && Array.isArray(processedFields)) {
          processedFields.forEach((f: any) => { fieldsRecord[f.id] = f.value; });
        }

        const contractAmountRaw = fieldsRecord['계약금'] || '';
        const commissionRateRaw = fieldsRecord['자문료율'] || '';
        const wonMatch = contractAmountRaw.replace(/,/g, '').match(/^(\d+)/);
        const amountWon = wonMatch ? parseInt(wonMatch[1], 10) : 0;
        const amountManWon = Math.round(amountWon / 10000);

        await firestore.collection('contracts_eformsign').add({
          customer_id,
          customer_name: customer_name || '',
          document_id: documentId,
          template_id,
          template_name: template_name || '',
          status: '발송완료',
          sent_at: now.toISOString(),
          fields: fieldsRecord,
          amount_man_won: amountManWon,
          commission_rate: parseFloat(commissionRateRaw) || 0,
          created_by: created_by || req.user?.email || '',
          created_at: now.toISOString(),
        });
        console.log(`[eformsign] contracts_eformsign 레코드 생성 완료: ${documentId}`);

        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const memoContent = `[계약서발송완료] 발송일자: ${dateStr} | 계약금: ${contractAmountRaw} | 자문료율: ${commissionRateRaw}%`;
        const memoEntry = {
          content: memoContent,
          author_id: req.user?.uid || 'system',
          author_name: created_by || '시스템',
          created_at: now.toISOString(),
        };

        try {
          const customerRef = firestore.collection('customers').doc(customer_id);
          await customerRef.update({
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            updated_at: now.toISOString(),
          });
          console.log(`[eformsign] 고객 메모 추가 완료: ${customer_id}`);
        } catch (memoErr: any) {
          console.error(`[eformsign] 고객 메모 추가 실패 (계약 발송은 성공): ${memoErr.message}`);
        }
      }

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

  app.get("/api/contracts", requireAuth, async (req, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const { customer_id } = req.query;

      let snapshot;
      try {
        if (customer_id) {
          snapshot = await firestore.collection('contracts_eformsign')
            .where('customer_id', '==', customer_id)
            .orderBy('created_at', 'desc')
            .get();
        } else {
          snapshot = await firestore.collection('contracts_eformsign')
            .orderBy('created_at', 'desc')
            .get();
        }
      } catch (indexError: any) {
        if (indexError.code === 9 || indexError.message?.includes('index')) {
          console.warn('[contracts] 복합 인덱스 미생성 - fallback 쿼리 사용');
          if (customer_id) {
            snapshot = await firestore.collection('contracts_eformsign')
              .where('customer_id', '==', customer_id as string)
              .get();
          } else {
            snapshot = await firestore.collection('contracts_eformsign')
              .get();
          }
        } else {
          throw indexError;
        }
      }

      const contracts = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));

      contracts.sort((a: any, b: any) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });

      res.json({ success: true, data: contracts });
    } catch (error: any) {
      console.error("[contracts] 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/contracts/:contractId/resend", requireAuth, async (req, res) => {
    try {
      const { contractId } = req.params;
      console.log(`[eformsign] 계약서 재발송 시작: contractId=${contractId}`);

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      const contractData = contractDoc.data()!;
      const { template_id, customer_id, customer_name, fields: fieldsRecord, created_by } = contractData;

      const customerDoc = await firestore.collection('customers').doc(customer_id).get();
      const customerData = customerDoc.exists ? customerDoc.data() : null;
      const phone = customerData?.phone?.replace(/-/g, '') || '';
      const recipientName = customerData?.name || customer_name || '';

      const formattedFieldsRecord: Record<string, string> = {};
      const fieldsArray = Object.entries(fieldsRecord || {}).map(([id, value]) => {
        if (id === '계약금') {
          const strVal = String(value).replace(/,/g, '');
          const numVal = parseFloat(strVal);
          if (!isNaN(numVal) && numVal > 0 && !/[가-힣()]/.test(String(value))) {
            const formatted = formatContractAmountServer(numVal);
            formattedFieldsRecord[id] = formatted;
            return { id, value: formatted };
          }
        }
        formattedFieldsRecord[id] = String(value);
        return { id, value: String(value) };
      });

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const dateField = fieldsArray.find(f => f.id === '계약일자');
      if (dateField) {
        dateField.value = dateStr;
        formattedFieldsRecord['계약일자'] = dateStr;
      }

      const recipients = [{
        step_type: '05',
        use_mail: false,
        use_sms: true,
        member: {
          name: recipientName,
          id: phone ? `${phone}@guest.eformsign.com` : `guest_${customer_id}@guest.eformsign.com`,
          sms: { country_code: '+82', phone_number: phone },
        },
        auth: { valid: { day: 7, hour: 0 } },
      }];

      const documentName = `${customer_name || recipientName}_경영지원자문 계약서`;

      console.log(`[eformsign] 재발송 - template: ${template_id}, fields: ${JSON.stringify(fieldsArray)}`);
      const result = await createDocument(template_id, {
        document_name: documentName,
        fields: fieldsArray,
        recipients,
      });

      const newDocumentId = result?.document?.id || '';
      console.log(`[eformsign] 재발송 문서 생성 성공: ${newDocumentId}`);

      if (newDocumentId) {
        const contractAmountFormatted = formattedFieldsRecord['계약금'] || '';
        const commissionRateRaw = formattedFieldsRecord['자문료율'] || fieldsRecord?.['자문료율'] || '';
        const wonMatch = String(contractAmountFormatted).replace(/,/g, '').match(/^(\d+)/);
        const amountWon = wonMatch ? parseInt(wonMatch[1], 10) : 0;
        const amountManWon = Math.round(amountWon / 10000);

        await firestore.collection('contracts_eformsign').add({
          customer_id,
          customer_name: customer_name || '',
          document_id: newDocumentId,
          template_id,
          template_name: contractData.template_name || '',
          status: '발송완료',
          sent_at: now.toISOString(),
          fields: formattedFieldsRecord,
          amount_man_won: contractData.amount_man_won || amountManWon,
          commission_rate: contractData.commission_rate || (parseFloat(commissionRateRaw) || 0),
          created_by: created_by || req.user?.email || '',
          created_at: now.toISOString(),
        });
        console.log(`[eformsign] 재발송 contracts_eformsign 레코드 생성 완료: ${newDocumentId}`);

        const memoContent = `[계약서재발송] 발송일자: ${dateStr} | 계약금: ${contractAmountFormatted} | 자문료율: ${commissionRateRaw}%`;
        const memoEntry = {
          content: memoContent,
          author_id: req.user?.uid || 'system',
          author_name: created_by || '시스템',
          created_at: now.toISOString(),
        };

        try {
          const customerRef = firestore.collection('customers').doc(customer_id);
          await customerRef.update({
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            updated_at: now.toISOString(),
          });
          console.log(`[eformsign] 재발송 고객 메모 추가 완료: ${customer_id}`);
        } catch (memoErr: any) {
          console.error(`[eformsign] 재발송 고객 메모 추가 실패: ${memoErr.message}`);
        }
      }

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("[eformsign] 계약서 재발송 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/contracts/sync", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const admin = getAdminApp();
      const firestore = admin.firestore();

      const contractsRef = firestore.collection('contracts_eformsign');
      const pendingSnapshot = await contractsRef
        .where('status', 'in', ['발송완료', '서명대기'])
        .get();

      if (pendingSnapshot.empty) {
        return res.json({ success: true, message: '동기화할 계약이 없습니다.', synced: 0 });
      }

      let syncedCount = 0;
      const results: Array<{ documentId: string; oldStatus: string; newStatus: string }> = [];

      for (const contractDoc of pendingSnapshot.docs) {
        const contractData = contractDoc.data();
        const documentId = contractData.document_id;

        if (!documentId) continue;

        try {
          const docInfo = await getDocument(documentId);
          const mappedStatus = extractEformsignStatus(docInfo);
          const rawStatusType = docInfo?.current_status?.status_type || '';

          console.log(`[eformsign Sync] doc=${documentId}, status_type=${rawStatusType}, mapped=${mappedStatus}, current=${contractData.status}`);

          if (mappedStatus && mappedStatus !== contractData.status) {
            const updateData: Record<string, any> = { status: mappedStatus };

            if (mappedStatus === '서명완료') {
              updateData.completed_at = new Date().toISOString();
            }

            await contractDoc.ref.update(updateData);
            syncedCount++;
            results.push({ documentId, oldStatus: contractData.status, newStatus: mappedStatus });

            if (mappedStatus === '서명완료' && contractData.customer_id) {
              const customerId = contractData.customer_id;
              const customerRef = firestore.collection('customers').doc(customerId);
              const customerSnap = await customerRef.get();

              if (customerSnap.exists) {
                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                const contractAmountManWon = contractData.amount_man_won || 0;
                const commissionRateNum = contractData.commission_rate || 0;
                const previousStatus = customerSnap.data()?.status_code || '';

                const memoContent = `[계약서작성완료] 완료일: ${dateStr} | 계약금: ${contractAmountManWon}만원 | 자문료율: ${commissionRateNum}% | 상태: 계약완료(선불)`;
                const memoEntry = {
                  content: memoContent,
                  author_id: 'system',
                  author_name: '시스템(eformsign)',
                  created_at: now.toISOString(),
                };

                const customerUpdateData: Record<string, any> = {
                  status_code: '계약완료(선불)',
                  contract_completion_date: dateStr,
                  updated_at: now.toISOString(),
                  memo_history: FieldValue.arrayUnion(memoEntry),
                  recent_memo: memoContent,
                  latest_memo: memoContent,
                };

                if (contractAmountManWon > 0) {
                  customerUpdateData.approved_amount = contractAmountManWon;
                }
                if (commissionRateNum > 0) {
                  customerUpdateData.commission_rate = commissionRateNum;
                }

                await customerRef.update(customerUpdateData);
                console.log(`[eformsign Sync] 고객 상태 변경: ${customerId} → 계약완료(선불)`);

                await firestore.collection('status_logs').add({
                  customer_id: customerId,
                  customer_name: contractData.customer_name || '',
                  previous_status: previousStatus,
                  new_status: '계약완료(선불)',
                  changed_by_id: 'system',
                  changed_by_name: '시스템(eformsign)',
                  changed_at: now.toISOString(),
                  reason: '전자계약 서명 완료 (수동 동기화)',
                });
              }
            }
          }
        } catch (docErr: any) {
          console.error(`[eformsign Sync] 문서 ${documentId} 상태 조회 실패:`, docErr.message);
        }
      }

      console.log(`[eformsign Sync] 동기화 완료: ${syncedCount}건 업데이트`);
      res.json({ success: true, synced: syncedCount, results });
    } catch (error: any) {
      console.error("[eformsign Sync] 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/contracts/:contractId/sync", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { contractId } = req.params;
      const admin = getAdminApp();
      const firestore = admin.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      const contractData = contractDoc.data()!;
      const documentId = contractData.document_id;

      if (!documentId) {
        return res.status(400).json({ success: false, error: 'document_id가 없습니다.' });
      }

      const docInfo = await getDocument(documentId);
      const rawStatusType = docInfo?.current_status?.status_type || '';
      console.log(`[eformsign Sync] 개별 동기화 - doc=${documentId}, status_type=${rawStatusType}, current_status:`, JSON.stringify(docInfo?.current_status || {}).substring(0, 200));
      const mappedStatus = extractEformsignStatus(docInfo);

      console.log(`[eformsign Sync] 개별 동기화 - doc=${documentId}, status_type=${rawStatusType}, mapped=${mappedStatus}, current=${contractData.status}`);

      if (!mappedStatus || mappedStatus === contractData.status) {
        return res.json({ success: true, message: '변경 사항 없음', currentStatus: contractData.status, eformsignStatus: rawStatusType, mappedStatus });
      }

      const updateData: Record<string, any> = { status: mappedStatus };
      if (mappedStatus === '서명완료') {
        updateData.completed_at = new Date().toISOString();
      }
      await contractDoc.ref.update(updateData);

      if (mappedStatus === '서명완료' && contractData.customer_id) {
        const customerId = contractData.customer_id;
        const customerRef = firestore.collection('customers').doc(customerId);
        const customerSnap = await customerRef.get();

        if (customerSnap.exists) {
          const now = new Date();
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

          const contractAmountManWon = contractData.amount_man_won || 0;
          const commissionRateNum = contractData.commission_rate || 0;
          const previousStatus = customerSnap.data()?.status_code || '';

          const memoContent = `[계약서작성완료] 완료일: ${dateStr} | 계약금: ${contractAmountManWon}만원 | 자문료율: ${commissionRateNum}% | 상태: 계약완료(선불)`;
          const memoEntry = {
            content: memoContent,
            author_id: 'system',
            author_name: '시스템(eformsign)',
            created_at: now.toISOString(),
          };

          const customerUpdateData: Record<string, any> = {
            status_code: '계약완료(선불)',
            contract_completion_date: dateStr,
            updated_at: now.toISOString(),
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
          };

          if (contractAmountManWon > 0) {
            customerUpdateData.approved_amount = contractAmountManWon;
          }
          if (commissionRateNum > 0) {
            customerUpdateData.commission_rate = commissionRateNum;
          }

          await customerRef.update(customerUpdateData);
          console.log(`[eformsign Sync] 고객 상태 변경: ${customerId} → 계약완료(선불)`);

          await firestore.collection('status_logs').add({
            customer_id: customerId,
            customer_name: contractData.customer_name || '',
            previous_status: previousStatus,
            new_status: '계약완료(선불)',
            changed_by_id: 'system',
            changed_by_name: '시스템(eformsign)',
            changed_at: now.toISOString(),
            reason: '전자계약 서명 완료 (수동 동기화)',
          });
        }
      }

      res.json({ success: true, oldStatus: contractData.status, newStatus: mappedStatus, eformsignStatus });
    } catch (error: any) {
      console.error("[eformsign Sync] 개별 동기화 오류:", error.message);
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
        const contractData = contractDoc.data();
        const updateData: Record<string, any> = {
          status: mappedStatus,
        };

        if (mappedStatus === '서명완료') {
          updateData.completed_at = new Date().toISOString();
        }

        await contractDoc.ref.update(updateData);
        console.log(`[eformsign Webhook] 계약 상태 업데이트: ${contractDoc.id} → ${mappedStatus}`);

        if (mappedStatus === '서명완료' && contractData.customer_id) {
          const customerId = contractData.customer_id;
          const customerRef = firestore.collection('customers').doc(customerId);
          const customerSnap = await customerRef.get();

          if (customerSnap.exists) {
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const contractAmountManWon = contractData.amount_man_won || 0;
            const commissionRateNum = contractData.commission_rate || 0;

            const previousStatus = customerSnap.data()?.status_code || '';

            const memoContent = `[계약서작성완료] 완료일: ${dateStr} | 계약금: ${contractAmountManWon}만원 | 자문료율: ${commissionRateNum}% | 상태: 계약완료(선불)`;
            const memoEntry = {
              content: memoContent,
              author_id: 'system',
              author_name: '시스템(eformsign)',
              created_at: now.toISOString(),
            };

            const customerUpdateData: Record<string, any> = {
              status_code: '계약완료(선불)',
              contract_completion_date: dateStr,
              updated_at: now.toISOString(),
              memo_history: FieldValue.arrayUnion(memoEntry),
              recent_memo: memoContent,
              latest_memo: memoContent,
            };

            if (contractAmountManWon > 0) {
              customerUpdateData.approved_amount = contractAmountManWon;
            }
            if (commissionRateNum > 0) {
              customerUpdateData.commission_rate = commissionRateNum;
            }

            await customerRef.update(customerUpdateData);
            console.log(`[eformsign Webhook] 고객 상태 변경: ${customerId} → 계약완료(선불), 계약금=${contractAmountManWon}만원, 자문료율=${commissionRateNum}%`);

            await firestore.collection('status_logs').add({
              customer_id: customerId,
              customer_name: contractData.customer_name || '',
              previous_status: previousStatus,
              new_status: '계약완료(선불)',
              changed_by_id: 'system',
              changed_by_name: '시스템(eformsign)',
              changed_at: now.toISOString(),
              reason: '전자계약 서명 완료',
            });
            console.log(`[eformsign Webhook] 상태 로그 기록 완료: ${previousStatus} → 계약완료(선불)`);
          }
        }
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
