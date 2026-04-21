import type { Express } from "express";
import { createServer, type Server } from "http";
import admin from 'firebase-admin';
import { storage } from "./storage";
import { extractBusinessRegistrationFromBase64, extractVatCertificateFromBase64, extractCreditReportFromBase64 } from "./geminiOCR";
import { setUserCustomClaims, syncAllUserClaims, getUserCustomClaims, requireAuth, requireSuperAdmin, getAdminApp, type AuthenticatedRequest } from "./firebaseAdmin";
import { sendConsultationAlimtalk, sendBulkDelayAlimtalk, sendAssignmentAlimtalk, sendBusinessCardAlimtalk, sendLongAbsenceAlimtalk, getBranchFromRegion, checkSolapiConfig } from "./solapiService";
import { getTemplates, getTemplateDetail, createDocument, getDocument, getDocuments, downloadDocument, checkEformsignConfig, mapEformsignStatus, extractEformsignStatus, cancelDocument, getDocumentReadStatus } from "./eformsignService";
import { sendBill, cancelBill, destroyBill, readBill, resendBill, getBalance, checkPaymintConfig, getPaymintStateLabel, type ApprovalCallbackData } from "./paymintService";

const FieldValue = admin.firestore.FieldValue;

type ContractType = 'pre' | 'post' | 'out';

function detectContractType(templateName: string): ContractType {
  const name = templateName.toLowerCase();
  if (name.includes('(out)') || name.includes('(out)')) return 'out';
  if (name.includes('(post)') || name.includes('(post)')) return 'post';
  return 'pre';
}

function getContractStatusByType(contractType: ContractType): string {
  switch (contractType) {
    case 'post': return '계약완료(후불)';
    case 'out': return '계약완료(외주)';
    default: return '수납대기';
  }
}

function getContractSentStatusByType(contractType: ContractType): string {
  switch (contractType) {
    case 'post': return '계약서발송완료(후불)';
    case 'out': return '계약서발송완료(외주)';
    default: return '계약서발송완료(선불)';
  }
}

function getContractTypeLabel(contractType: ContractType): string {
  switch (contractType) {
    case 'post': return '후불계약';
    case 'out': return '외주계약';
    default: return '선불계약';
  }
}

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
              customer_id, customer_name, created_by, amount_man_won: clientAmountManWon, commission_rate_raw: clientCommissionRate } = req.body;

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

        const amountManWon = (typeof clientAmountManWon === 'number' && clientAmountManWon > 0)
          ? clientAmountManWon
          : (() => {
              const wonMatch = contractAmountRaw.replace(/,/g, '').match(/^(\d+)/);
              const amountWon = wonMatch ? parseInt(wonMatch[1], 10) : 0;
              return Math.round(amountWon / 10000);
            })();

        const commissionRate = (typeof clientCommissionRate === 'number' && clientCommissionRate > 0)
          ? clientCommissionRate
          : (parseFloat(commissionRateRaw) || 0);

        const customerDoc = await firestore.collection('customers').doc(customer_id).get();
        const customerData = customerDoc.exists ? customerDoc.data() : null;

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
          commission_rate: commissionRate,
          created_by: created_by || req.user?.email || '',
          created_by_uid: req.user?.uid || '',
          manager_id: customerData?.manager_id || req.user?.uid || '',
          team_id: customerData?.team_id || '',
          created_at: now.toISOString(),
        });
        console.log(`[eformsign] contracts_eformsign 레코드 생성 완료: ${documentId}, 계약금: ${amountManWon}만원, 자문료율: ${commissionRate}%`);

        const contractType = detectContractType(template_name || '');

        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const amountPart = contractType !== 'out' ? ` | 계약금: ${contractAmountRaw}` : '';
        const memoContent = `[계약서발송완료] 발송일자: ${dateStr}${amountPart} | 자문료율: ${commissionRateRaw}%`;
        const memoEntry = {
          content: memoContent,
          author_id: req.user?.uid || 'system',
          author_name: created_by || '시스템',
          created_at: now.toISOString(),
        };

        try {
          const customerRef = firestore.collection('customers').doc(customer_id);
          const prevDoc = await customerRef.get();
          const prevStatus = prevDoc.data()?.status_code || '';
          const sentStatus = getContractSentStatusByType(contractType);
          const customerUpdate: Record<string, any> = {
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            updated_at: now.toISOString(),
            status_code: sentStatus,
          };
          if (contractType !== 'out' && amountManWon > 0) {
            customerUpdate.approved_amount = amountManWon;
            customerUpdate.contract_amount = amountManWon;
          }
          if (commissionRate > 0) {
            customerUpdate.commission_rate = commissionRate;
            customerUpdate.contract_fee_rate = commissionRate;
          }
          await customerRef.update(customerUpdate);
          try {
            await firestore.collection('status_logs').add({
              customer_id,
              previous_status: prevStatus,
              new_status: sentStatus,
              changed_by_user_id: req.user?.uid || 'system',
              changed_by_user_name: created_by || '시스템',
              changed_at: now.toISOString(),
            });
          } catch (logErr: any) {
            console.error(`[eformsign] 상태 로그 생성 실패: ${logErr.message}`);
          }

          console.log(`[eformsign] 고객 상태 → ${sentStatus} + 메모 업데이트 완료: ${customer_id} (${contractType})`);
        } catch (memoErr: any) {
          console.error(`[eformsign] 고객 업데이트 실패 (계약 발송은 성공): ${memoErr.message}`);
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

  app.get("/api/eformsign/documents/:documentId/download", requireAuth, async (req, res) => {
    try {
      const { buffer, contentType, fileName } = await downloadDocument(req.params.documentId);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (error: any) {
      console.error("[eformsign] 문서 다운로드 오류:", error.message);
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

  app.get("/api/contracts", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const { customer_id } = req.query;

      const userRole = (req.user as any)?.role || '';
      const userTeamId = (req.user as any)?.team_id || '';
      const userUid = req.user?.uid || '';

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

      let contracts = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (userRole === 'staff') {
        contracts = contracts.filter((c: any) =>
          !c.manager_id || c.manager_id === userUid || c.created_by_uid === userUid
        );
      } else if (userRole === 'team_leader') {
        contracts = contracts.filter((c: any) =>
          !c.team_id || c.team_id === userTeamId || c.created_by_uid === userUid
        );
      }

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

  app.delete("/api/contracts/:contractId", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userRole = (req.user as any)?.role || '';
      if (userRole !== 'super_admin') {
        return res.status(403).json({ success: false, error: '삭제 권한이 없습니다.' });
      }

      const { contractId } = req.params;
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      await firestore.collection('contracts_eformsign').doc(contractId).delete();
      console.log(`[contracts] 계약 삭제 완료: ${contractId}`);

      res.json({ success: true });
    } catch (error: any) {
      console.error("[contracts] 삭제 오류:", error.message);
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

      // 유효기간: body로 전달받은 valid_day 우선, 없으면 기본값 14일(2주)
      const validDayRaw = (req.body as any)?.valid_day;
      const validDay = (typeof validDayRaw === 'number' && validDayRaw > 0 && validDayRaw <= 365)
        ? Math.floor(validDayRaw)
        : 14;

      const recipients = [{
        step_type: '05',
        use_mail: false,
        use_sms: true,
        member: {
          name: recipientName,
          id: phone ? `${phone}@guest.eformsign.com` : `guest_${customer_id}@guest.eformsign.com`,
          sms: { country_code: '+82', phone_number: phone },
        },
        auth: { valid: { day: validDay, hour: 0 } },
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
          created_by_uid: req.user?.uid || contractData.created_by_uid || '',
          manager_id: contractData.manager_id || req.user?.uid || '',
          team_id: contractData.team_id || '',
          created_at: now.toISOString(),
        });
        console.log(`[eformsign] 재발송 contracts_eformsign 레코드 생성 완료: ${newDocumentId}`);

        const resendContractType = detectContractType(contractData.template_name || '');
        const resendAmountPart = resendContractType !== 'out' ? ` | 계약금: ${contractAmountFormatted}` : '';
        const memoContent = `[계약서재발송] 발송일자: ${dateStr}${resendAmountPart} | 자문료율: ${commissionRateRaw}%`;
        const memoEntry = {
          content: memoContent,
          author_id: req.user?.uid || 'system',
          author_name: created_by || '시스템',
          created_at: now.toISOString(),
        };

        try {
          const resendSentStatus = getContractSentStatusByType(resendContractType);
          const customerRef = firestore.collection('customers').doc(customer_id);
          const prevResendDoc = await customerRef.get();
          const prevResendStatus = prevResendDoc.data()?.status_code || '';
          await customerRef.update({
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            updated_at: now.toISOString(),
            status_code: resendSentStatus,
          });

          try {
            await firestore.collection('status_logs').add({
              customer_id,
              previous_status: prevResendStatus,
              new_status: resendSentStatus,
              changed_by_user_id: req.user?.uid || 'system',
              changed_by_user_name: created_by || '시스템',
              changed_at: now.toISOString(),
            });
          } catch (logErr: any) {
            console.error(`[eformsign] 재발송 상태 로그 생성 실패: ${logErr.message}`);
          }

          console.log(`[eformsign] 재발송 고객 상태 → ${resendSentStatus} + 메모 추가 완료: ${customer_id}`);
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

  app.post("/api/eformsign/contracts/:contractId/cancel", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { contractId } = req.params;
      const { reason } = (req.body || {}) as { reason?: string };
      const cancelComment = (typeof reason === 'string' && reason.trim()) ? reason.trim() : '계약서 취소';
      console.log(`[eformsign] 계약서 발송취소 시작: contractId=${contractId}, reason=${cancelComment}`);

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      const contractData = contractDoc.data()!;
      const { document_id, status } = contractData;

      if (status === '서명완료' || status === '무효') {
        return res.status(400).json({ success: false, error: `이미 ${status} 상태인 계약서는 취소할 수 없습니다.` });
      }

      if (document_id) {
        try {
          await cancelDocument(document_id, cancelComment);
          console.log(`[eformsign] eformsign 문서 취소 성공: ${document_id}`);
        } catch (eformsignError: any) {
          console.error(`[eformsign] eformsign 문서 취소 실패:`, eformsignError.message);
          return res.status(500).json({ success: false, error: `eformsign 취소 실패: ${eformsignError.message}` });
        }
      }

      await firestore.collection('contracts_eformsign').doc(contractId).update({
        status: '무효',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: cancelComment,
        cancelled_by: req.user?.email || req.user?.uid || '',
      });

      console.log(`[eformsign] 계약서 발송취소 완료: contractId=${contractId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[eformsign] 계약서 발송취소 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // [신규] 계약서 열람여부 확인
  app.get("/api/eformsign/contracts/:contractId/read-status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { contractId } = req.params;
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const contractDoc = await firestore.collection('contracts_eformsign').doc(contractId).get();
      if (!contractDoc.exists) {
        return res.status(404).json({ success: false, error: '계약 레코드를 찾을 수 없습니다.' });
      }

      const contractData = contractDoc.data()!;
      const documentId = contractData.document_id;
      if (!documentId) {
        return res.status(400).json({ success: false, error: 'document_id가 없습니다.' });
      }

      const status = await getDocumentReadStatus(documentId);
      console.log(`[eformsign] 열람여부 조회 완료: contractId=${contractId}, opened=${status.opened}, count=${status.open_count}`);

      // Firestore에 열람 정보 캐싱 (best-effort)
      try {
        const updateData: Record<string, any> = {
          opened: status.opened,
          open_count: status.open_count,
          read_status_checked_at: new Date().toISOString(),
        };
        if (status.first_opened_at) updateData.first_opened_at = status.first_opened_at;
        if (status.last_opened_at) updateData.last_opened_at = status.last_opened_at;
        await contractDoc.ref.update(updateData);
      } catch (cacheErr: any) {
        console.warn(`[eformsign] 열람정보 캐싱 실패: ${cacheErr.message}`);
      }

      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error("[eformsign] 열람여부 조회 오류:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/eformsign/contracts/sync", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const admin = getAdminApp();
      const firestore = admin.firestore();

      const contractsRef = firestore.collection('contracts_eformsign');
      const pendingSnapshot = await contractsRef
        .where('status', 'in', ['발송완료', '서명대기', '거부'])
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
          const resolvedStatus = docInfo?.current_status || docInfo?.document?.current_status || {};
          const rawStatusType = resolvedStatus?.status_type ?? '';
          console.log(`[eformsign Sync] doc=${documentId}, current_status:`, JSON.stringify(resolvedStatus));
          const mappedStatus = extractEformsignStatus(docInfo);

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

                const contractType = detectContractType(contractData.template_name || '');
                const targetStatus = getContractStatusByType(contractType);
                const typeLabel = getContractTypeLabel(contractType);

                const contractAmountManWon = contractData.amount_man_won || 0;
                const commissionRateNum = contractData.commission_rate || 0;
                const previousStatus = customerSnap.data()?.status_code || '';

                const amountPart = contractType !== 'out' ? ` | 계약금: ${contractAmountManWon}만원` : '';
                const memoContent = `[계약서작성완료] 완료일: ${dateStr}${amountPart} | 자문료율: ${commissionRateNum}% | 상태: ${targetStatus}`;
                const memoEntry = {
                  content: memoContent,
                  author_id: 'system',
                  author_name: '시스템(eformsign)',
                  created_at: now.toISOString(),
                };

                const customerUpdateData: Record<string, any> = {
                  status_code: targetStatus,
                  contract_completion_date: dateStr,
                  updated_at: now.toISOString(),
                  memo_history: FieldValue.arrayUnion(memoEntry),
                  recent_memo: memoContent,
                  latest_memo: memoContent,
                };

                if (contractType !== 'out' && contractAmountManWon > 0) {
                  customerUpdateData.approved_amount = contractAmountManWon;
                  customerUpdateData.contract_amount = contractAmountManWon;
                }
                if (commissionRateNum > 0) {
                  customerUpdateData.commission_rate = commissionRateNum;
                  customerUpdateData.contract_fee_rate = commissionRateNum;
                }

                await customerRef.update(customerUpdateData);
                console.log(`[eformsign Sync] 고객 상태 변경: ${customerId} → ${targetStatus} (${typeLabel}), 계약금: ${contractAmountManWon}만원, 자문료율: ${commissionRateNum}%`);

                await firestore.collection('status_logs').add({
                  customer_id: customerId,
                  customer_name: contractData.customer_name || '',
                  previous_status: previousStatus,
                  new_status: targetStatus,
                  changed_by_id: 'system',
                  changed_by_name: '시스템(eformsign)',
                  changed_at: now.toISOString(),
                  reason: `전자계약 서명 완료 - ${typeLabel} (수동 동기화)`,
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
      const resolvedStatus = docInfo?.current_status || docInfo?.document?.current_status || {};
      const rawStatusType = resolvedStatus?.status_type ?? '';
      console.log(`[eformsign Sync] 개별 동기화 - doc=${documentId}, raw response:`, JSON.stringify(docInfo).substring(0, 2000));
      console.log(`[eformsign Sync] 개별 동기화 - doc=${documentId}, current_status:`, JSON.stringify(resolvedStatus));
      const mappedStatus = extractEformsignStatus(docInfo);

      console.log(`[eformsign Sync] 개별 동기화 - doc=${documentId}, status_type=${rawStatusType}, mapped=${mappedStatus}, current=${contractData.status}`);

      if (!mappedStatus || mappedStatus === contractData.status) {
        return res.json({ success: true, message: '변경 사항 없음', currentStatus: contractData.status, eformsignStatus: rawStatusType, mappedStatus, eformsignRaw: docInfo?.current_status || {} });
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

          const contractType = detectContractType(contractData.template_name || '');
          const targetStatus = getContractStatusByType(contractType);
          const typeLabel = getContractTypeLabel(contractType);

          const contractAmountManWon = contractData.amount_man_won || 0;
          const commissionRateNum = contractData.commission_rate || 0;
          const previousStatus = customerSnap.data()?.status_code || '';

          const amountPart = contractType !== 'out' ? ` | 계약금: ${contractAmountManWon}만원` : '';
          const memoContent = `[계약서작성완료] 완료일: ${dateStr}${amountPart} | 자문료율: ${commissionRateNum}% | 상태: ${targetStatus}`;
          const memoEntry = {
            content: memoContent,
            author_id: 'system',
            author_name: '시스템(eformsign)',
            created_at: now.toISOString(),
          };

          const customerUpdateData: Record<string, any> = {
            status_code: targetStatus,
            contract_completion_date: dateStr,
            updated_at: now.toISOString(),
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
          };

          if (contractType !== 'out' && contractAmountManWon > 0) {
            customerUpdateData.approved_amount = contractAmountManWon;
            customerUpdateData.contract_amount = contractAmountManWon;
          }
          if (commissionRateNum > 0) {
            customerUpdateData.commission_rate = commissionRateNum;
            customerUpdateData.contract_fee_rate = commissionRateNum;
          }

          await customerRef.update(customerUpdateData);
          console.log(`[eformsign Sync] 고객 상태 변경: ${customerId} → ${targetStatus} (${typeLabel}), 계약금: ${contractAmountManWon}만원, 자문료율: ${commissionRateNum}%`);

          await firestore.collection('status_logs').add({
            customer_id: customerId,
            customer_name: contractData.customer_name || '',
            previous_status: previousStatus,
            new_status: targetStatus,
            changed_by_id: 'system',
            changed_by_name: '시스템(eformsign)',
            changed_at: now.toISOString(),
            reason: `전자계약 서명 완료 - ${typeLabel} (수동 동기화)`,
          });
        }
      }

      res.json({ success: true, oldStatus: contractData.status, newStatus: mappedStatus, eformsignStatusType: rawStatusType });
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

            const contractType = detectContractType(contractData.template_name || '');
            const targetStatus = getContractStatusByType(contractType);
            const typeLabel = getContractTypeLabel(contractType);

            const contractAmountManWon = contractData.amount_man_won || 0;
            const commissionRateNum = contractData.commission_rate || 0;

            const previousStatus = customerSnap.data()?.status_code || '';

            const amountPart = contractType !== 'out' ? ` | 계약금: ${contractAmountManWon}만원` : '';
            const memoContent = `[계약서작성완료] 완료일: ${dateStr}${amountPart} | 자문료율: ${commissionRateNum}% | 상태: ${targetStatus}`;
            const memoEntry = {
              content: memoContent,
              author_id: 'system',
              author_name: '시스템(eformsign)',
              created_at: now.toISOString(),
            };

            const customerUpdateData: Record<string, any> = {
              status_code: targetStatus,
              contract_completion_date: dateStr,
              updated_at: now.toISOString(),
              memo_history: FieldValue.arrayUnion(memoEntry),
              recent_memo: memoContent,
              latest_memo: memoContent,
            };

            if (contractType !== 'out' && contractAmountManWon > 0) {
              customerUpdateData.approved_amount = contractAmountManWon;
              customerUpdateData.contract_amount = contractAmountManWon;
            }
            if (commissionRateNum > 0) {
              customerUpdateData.commission_rate = commissionRateNum;
              customerUpdateData.contract_fee_rate = commissionRateNum;
            }

            await customerRef.update(customerUpdateData);
            console.log(`[eformsign Webhook] 고객 상태 변경: ${customerId} → ${targetStatus} (${typeLabel}), 계약금=${contractAmountManWon}만원, 자문료율=${commissionRateNum}%`);

            await firestore.collection('status_logs').add({
              customer_id: customerId,
              customer_name: contractData.customer_name || '',
              previous_status: previousStatus,
              new_status: targetStatus,
              changed_by_id: 'system',
              changed_by_name: '시스템(eformsign)',
              changed_at: now.toISOString(),
              reason: `전자계약 서명 완료 - ${typeLabel}`,
            });
            console.log(`[eformsign Webhook] 상태 로그 기록 완료: ${previousStatus} → ${targetStatus}`);
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

  // =========================================================================
  // 외부 스프레드시트 → consultations 컬렉션 Webhook
  // =========================================================================
  app.post("/api/webhook/consultation", async (req, res) => {
    console.log("[Webhook] 외부 상담 데이터 수신");

    try {
      const {
        name, phone, businessName, businessNumber,
        revenue, services, source, note,
        utm_source, utm_medium, utm_campaign
      } = req.body;

      if (!name || !phone) {
        return res.status(400).json({
          success: false,
          error: "name(고객명)과 phone(연락처)은 필수입니다.",
        });
      }

      const formatPhone = (p: string): string => {
        const digits = p.replace(/\D/g, '');
        if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
        return p;
      };
      const formattedPhone = formatPhone(String(phone));

      const adminApp = getAdminApp();
      const db = adminApp.firestore();

      const existing = await db.collection("consultations")
        .where("phone", "==", formattedPhone)
        .where("processed", "==", false)
        .limit(1)
        .get();

      if (!existing.empty) {
        console.log(`[Webhook] 중복 미처리 상담 존재 (phone: ${formattedPhone}), 스킵`);
        return res.status(200).json({ result: "duplicate", message: "이미 동일 연락처의 미처리 상담이 존재합니다." });
      }

      const consultationData = {
        name: String(name),
        phone: formattedPhone,
        businessName: String(businessName || ""),
        businessNumber: String(businessNumber || ""),
        businessAge: "",
        revenue: String(revenue || ""),
        region: "",
        creditScore: "",
        taxStatus: "",
        services: Array.isArray(services) ? services : ["정책자금 (융자)"],
        source: String(source || "GoogleAds_Agency_Sheet"),
        email: "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false,
        linked_customer_id: null,
        note: String(note || ""),
        utm_source: String(utm_source || ""),
        utm_medium: String(utm_medium || ""),
        utm_campaign: String(utm_campaign || ""),
      };

      const docRef = await db.collection("consultations").add(consultationData);
      console.log(`[Webhook] 상담 저장 완료: ${docRef.id} (${name} / ${phone})`);

      try {
        const serviceList = Array.isArray(services) ? services : ["정책자금 (융자)"];
        const alimtalkResult = await sendConsultationAlimtalk({
          customerPhone: formattedPhone,
          customerName: String(name),
          services: serviceList,
          createdAt: new Date(),
        });
        console.log(`[Webhook] 알림톡 발송: ${alimtalkResult.message}`);
      } catch (alimtalkError: any) {
        console.error(`[Webhook] 알림톡 발송 실패 (상담 저장은 완료): ${alimtalkError.message}`);
      }

      res.status(201).json({ result: "success", id: docRef.id });
    } catch (error: any) {
      console.error("[Webhook] 상담 저장 오류:", error.message);
      res.status(500).json({ result: "error", error: error.message });
    }
  });

  app.post("/api/leave-requests/admin-create", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { user_id, user_name, team_id, team_name, leave_date, leave_type, leave_days, reason } = req.body;
      
      if (!user_id || !user_name || !leave_date || !leave_type) {
        return res.status(400).json({ error: "필수 필드가 누락되었습니다." });
      }

      const firestore = admin.firestore();

      let adminName = '관리자';
      const adminDoc = await firestore.collection('users').doc(req.user!.uid).get();
      if (adminDoc.exists) {
        adminName = adminDoc.data()?.name || req.user!.name || '관리자';
      }

      const docRef = await firestore.collection('leave_requests').add({
        user_id,
        user_name,
        team_id: team_id || '',
        team_name: team_name || '',
        leave_date,
        leave_type,
        leave_days: leave_days || (leave_type === 'full' ? 1.0 : 0.5),
        reason: reason || '관리자 등록',
        status: 'approved',
        admin_approved_by: req.user!.uid,
        admin_approved_name: adminName,
        admin_approved_at: admin.firestore.FieldValue.serverTimestamp(),
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      const userRef = firestore.collection('users').doc(user_id);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const currentUsed = userDoc.data()?.usedLeave || 0;
        await userRef.update({
          usedLeave: currentUsed + (leave_days || (leave_type === 'full' ? 1.0 : 0.5)),
        });
      }

      res.json({ result: "success", id: docRef.id });
    } catch (error: any) {
      console.error("[LeaveRequest] 관리자 연차 등록 오류:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================
  // 결제선생(PayMint) API 라우트
  // ============================================================

  app.post("/api/paymint/send", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { customer_id, customer_name, phone, contract_amount_manwon, manager_id, manager_name, expire_dt, contract_eformsign_id } = req.body;

      if (!customer_id || !customer_name || !phone || !contract_amount_manwon) {
        return res.status(400).json({ error: '필수 값이 누락되었습니다.' });
      }

      const priceWon = Math.round(contract_amount_manwon * 10000 * 1.1);
      const baseUrl = req.headers['x-forwarded-proto'] 
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `${req.protocol}://${req.headers.host}`;
      const callbackURL = `${baseUrl}/api/paymint/callback`;

      const result = await sendBill({
        productName: '경영컨설팅 계약금',
        message: `${customer_name}님, 계약금 결제 청구서입니다. (${contract_amount_manwon}만원 + VAT)`,
        memberName: customer_name,
        phone: phone.replace(/-/g, ''),
        price: priceWon,
        expireDt: expire_dt,
        callbackURL,
      });

      if (result.code !== '0000') {
        console.error(`[PayMint Send] 실패: ${result.code} - ${result.msg}`);
        return res.status(400).json({ error: result.msg, code: result.code });
      }

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const now = new Date();

      const paymentData = {
        customer_id,
        customer_name,
        bill_id: result.bill_id,
        short_url: result.shortURL || '',
        amount: priceWon,
        contract_amount_manwon,
        phone: phone.replace(/-/g, ''),
        product_name: '정책자금 컨설팅 계약금',
        message: `${customer_name}님, 계약금 결제 청구서입니다. (${contract_amount_manwon}만원 + VAT)`,
        state: 'W',
        sent_by: req.user!.uid,
        sent_by_name: req.user!.name || '',
        manager_id: manager_id || '',
        manager_name: manager_name || '',
        expire_dt: expire_dt || '',
        contract_eformsign_id: contract_eformsign_id || '',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      const docRef = await firestore.collection('payments_paymint').add(paymentData);
      console.log(`[PayMint Send] 청구서 발송 성공: bill_id=${result.bill_id}, amount=${priceWon}원, customer=${customer_name}`);

      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const memoContent = `[결제청구] 발송일: ${dateStr} | 금액: ${priceWon.toLocaleString()}원 (계약금 ${contract_amount_manwon}만원 + VAT)`;
      const memoEntry = {
        content: memoContent,
        author_id: req.user!.uid,
        author_name: req.user!.name || '시스템',
        created_at: now.toISOString(),
      };

      await firestore.collection('customers').doc(customer_id).update({
        memo_history: FieldValue.arrayUnion(memoEntry),
        recent_memo: memoContent,
        latest_memo: memoContent,
        last_memo_date: dateStr,
        updated_at: now.toISOString(),
      });

      res.json({
        result: 'success',
        payment_id: docRef.id,
        bill_id: result.bill_id,
        short_url: result.shortURL,
        amount: priceWon,
      });
    } catch (error: any) {
      console.error('[PayMint Send] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paymint/callback", async (req, res) => {
    try {
      const data = req.body as ApprovalCallbackData;
      console.log(`[PayMint Callback] bill_id=${data.bill_id}, state=${data.appr_state}`);

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();

      const paymentsRef = firestore.collection('payments_paymint');
      const snapshot = await paymentsRef.where('bill_id', '==', data.bill_id).limit(1).get();

      if (snapshot.empty) {
        console.error(`[PayMint Callback] bill_id=${data.bill_id} 결제 기록 없음`);
        return res.json({ code: "0000", msg: "성공하였습니다." });
      }

      const paymentDoc = snapshot.docs[0];
      const paymentData = paymentDoc.data();
      const now = new Date();

      const updateData: Record<string, any> = {
        state: data.appr_state,
        appr_pay_type: data.appr_pay_type || '',
        appr_dt: data.appr_dt || '',
        appr_price: data.appr_price || '',
        appr_issuer: data.appr_issuer || '',
        appr_issuer_cd: data.appr_issuer_cd || '',
        appr_issuer_num: data.appr_issuer_num || '',
        appr_acquirer_cd: data.appr_acquirer_cd || '',
        appr_acquirer_nm: data.appr_acquirer_nm || '',
        appr_num: data.appr_num || '',
        appr_origin_num: data.appr_origin_num || '',
        appr_monthly: data.appr_monthly || '',
        appr_cash_num: data.appr_cash_num || '',
        appr_cash_trader: data.appr_cash_trader || '',
        appr_cash_issuance_number: data.appr_cash_issuance_number || '',
        updated_at: now.toISOString(),
      };

      await paymentDoc.ref.update(updateData);
      console.log(`[PayMint Callback] 결제 상태 업데이트: ${paymentDoc.id} → ${data.appr_state}`);

      if (data.appr_state === 'F') {
        const customerId = paymentData.customer_id;
        const customerRef = firestore.collection('customers').doc(customerId);
        const customerSnap = await customerRef.get();

        if (customerSnap.exists) {
          const customerData = customerSnap.data();
          const previousStatus = customerData?.status_code || '';
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

          const issuerInfo = data.appr_issuer ? ` (${data.appr_issuer})` : '';
          const memoContent = `[결제완료] 결제일: ${dateStr} | 금액: ${Number(data.appr_price || 0).toLocaleString()}원${issuerInfo} | 승인번호: ${data.appr_num || '-'}`;
          const memoEntry = {
            content: memoContent,
            author_id: 'system',
            author_name: '시스템(결제선생)',
            created_at: now.toISOString(),
          };

          await customerRef.update({
            status_code: '계약완료(선불)',
            deposit_paid_date: dateStr,
            updated_at: now.toISOString(),
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            last_memo_date: dateStr,
          });

          await firestore.collection('status_logs').add({
            customer_id: customerId,
            customer_name: paymentData.customer_name || '',
            previous_status: previousStatus,
            new_status: '계약완료(선불)',
            changed_by: 'system',
            changed_by_name: '시스템(결제선생)',
            changed_at: now.toISOString(),
            memo: `결제완료 - 자동 상태 변경 (결제금액: ${Number(data.appr_price || 0).toLocaleString()}원)`,
          });

          await firestore.collection('payments_paymint').doc(paymentDoc.id).update({
            payment_completed_notified: false,
          });

          console.log(`[PayMint Callback] 고객 상태 변경: ${customerId} → 계약완료(선불)`);
        }
      }

      res.json({ code: "0000", msg: "성공하였습니다." });
    } catch (error: any) {
      console.error('[PayMint Callback] 오류:', error.message);
      res.json({ code: "0000", msg: "성공하였습니다." });
    }
  });

  app.post("/api/paymint/cancel", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { payment_id, bill_id, price } = req.body;

      if (!bill_id || !price) {
        return res.status(400).json({ error: '필수 값이 누락되었습니다.' });
      }

      const result = await cancelBill({ billId: bill_id, price: Number(price) });

      if (result.code !== '0000') {
        return res.status(400).json({ error: result.msg, code: result.code });
      }

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const now = new Date();

      if (payment_id) {
        await firestore.collection('payments_paymint').doc(payment_id).update({
          state: 'C',
          cancel_dt: result.appr_cancel_dt || now.toISOString(),
          cancel_num: result.appr_num || '',
          updated_at: now.toISOString(),
        });

        const payDoc = await firestore.collection('payments_paymint').doc(payment_id).get();
        const payData = payDoc.data();
        if (payData?.customer_id) {
          const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const memoContent = `[결제취소] 취소일: ${dateStr} | 금액: ${Number(price).toLocaleString()}원 | 처리자: ${req.user!.name || '관리자'}`;
          const memoEntry = {
            content: memoContent,
            author_id: req.user!.uid,
            author_name: req.user!.name || '관리자',
            created_at: now.toISOString(),
          };
          await firestore.collection('customers').doc(payData.customer_id).update({
            memo_history: FieldValue.arrayUnion(memoEntry),
            recent_memo: memoContent,
            latest_memo: memoContent,
            updated_at: now.toISOString(),
          });
        }
      }

      console.log(`[PayMint Cancel] 결제 취소 성공: bill_id=${bill_id}`);
      res.json({ result: 'success', ...result });
    } catch (error: any) {
      console.error('[PayMint Cancel] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paymint/destroy", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { payment_id, bill_id, price } = req.body;

      if (!bill_id || !price) {
        return res.status(400).json({ error: '필수 값이 누락되었습니다.' });
      }

      const result = await destroyBill({ billId: bill_id, price: Number(price) });

      if (result.code !== '0000') {
        return res.status(400).json({ error: result.msg, code: result.code });
      }

      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const now = new Date();

      if (payment_id) {
        await firestore.collection('payments_paymint').doc(payment_id).update({
          state: 'D',
          updated_at: now.toISOString(),
        });
      }

      console.log(`[PayMint Destroy] 청구서 파기 성공: bill_id=${bill_id}`);
      res.json({ result: 'success', ...result });
    } catch (error: any) {
      console.error('[PayMint Destroy] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paymint/status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { bill_id, payment_id } = req.body;

      if (!bill_id) {
        return res.status(400).json({ error: 'bill_id가 필요합니다.' });
      }

      const result = await readBill({ billId: bill_id });

      if (result.appr_state && payment_id) {
        const adminApp = getAdminApp();
        const firestore = adminApp.firestore();
        await firestore.collection('payments_paymint').doc(payment_id).update({
          state: result.appr_state,
          appr_pay_type: result.appr_pay_type || '',
          appr_dt: result.appr_dt || '',
          appr_price: result.appr_price || '',
          appr_issuer: result.appr_issuer || '',
          appr_num: result.appr_num || '',
          appr_monthly: result.appr_monthly || '',
          updated_at: new Date().toISOString(),
        });
      }

      res.json({ result: 'success', ...result });
    } catch (error: any) {
      console.error('[PayMint Status] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paymint/resend", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { bill_id } = req.body;

      if (!bill_id) {
        return res.status(400).json({ error: 'bill_id가 필요합니다.' });
      }

      const result = await resendBill({ billId: bill_id });

      if (result.code !== '0000') {
        return res.status(400).json({ error: result.msg, code: result.code });
      }

      console.log(`[PayMint Resend] 재발송 성공: bill_id=${bill_id}`);
      res.json({ result: 'success', ...result });
    } catch (error: any) {
      console.error('[PayMint Resend] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paymint/balance", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await getBalance();
      res.json(result);
    } catch (error: any) {
      console.error('[PayMint Balance] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paymint/payments", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const role = req.user!.role;
      const uid = req.user!.uid;

      const paymentsQuery = firestore.collection('payments_paymint').orderBy('created_at', 'desc');
      const snapshot = await paymentsQuery.get();

      let payments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      const customerIdFilter = req.query.customer_id as string | undefined;
      if (customerIdFilter) {
        payments = payments.filter((p: any) => p.customer_id === customerIdFilter);
      }

      const stateFilter = req.query.state as string | undefined;
      if (stateFilter) {
        payments = payments.filter((p: any) => p.state === stateFilter);
      }
      const queryLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
      if (queryLimit > 0) {
        payments = payments.slice(0, queryLimit);
      }

      if (role === 'staff') {
        payments = payments.filter((p: any) => p.manager_id === uid || p.sent_by === uid);
      } else if (role === 'team_leader') {
        const teamId = req.user!.team_id;
        if (teamId) {
          const teamSnap = await firestore.collection('teams').doc(teamId).get();
          const teamMembers = teamSnap.exists ? (teamSnap.data()?.members || []) : [];
          payments = payments.filter((p: any) => teamMembers.includes(p.manager_id) || p.sent_by === uid);
        }
      }

      res.json(payments);
    } catch (error: any) {
      console.error('[PayMint Payments] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/paymint/payments/:id", requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const adminApp = getAdminApp();
      const firestore = adminApp.firestore();
      const paymentId = req.params.id;

      const docRef = firestore.collection('payments_paymint').doc(paymentId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: '결제 내역을 찾을 수 없습니다.' });
      }

      await docRef.delete();
      console.log(`[PayMint] 결제 내역 삭제: ${paymentId} by ${req.user!.email}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[PayMint Delete] 오류:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
