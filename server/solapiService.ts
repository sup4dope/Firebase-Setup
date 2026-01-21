import { SolapiMessageService } from 'solapi';

const apiKey = process.env.SOLAPI_API_KEY || '';
const apiSecret = process.env.SOLAPI_API_SECRET || '';
const pfId = process.env.SOLAPI_KAKAO_PFID || '';
const templateId = process.env.SOLAPI_TEMPLATE_ID || '';
const delayTemplateId = process.env.SOLAPI_DELAY_TEMPLATE_ID || '';
const assignTemplateId = process.env.SOLAPI_ASSIGN_TEMPLATE_ID || '';
const senderNumber = process.env.SOLAPI_SENDER_NUMBER || '';

let messageService: SolapiMessageService | null = null;

const getMessageService = (): SolapiMessageService | null => {
  if (!apiKey || !apiSecret) {
    console.error('❌ [Solapi] API 키 또는 시크릿이 설정되지 않았습니다.');
    return null;
  }
  
  if (!messageService) {
    messageService = new SolapiMessageService(apiKey, apiSecret);
  }
  
  return messageService;
};

export interface ConsultationAlimtalkData {
  customerPhone: string;
  customerName: string;
  services: string[];
  createdAt: Date;
}

export const sendConsultationAlimtalk = async (data: ConsultationAlimtalkData): Promise<{
  success: boolean;
  message: string;
  result?: any;
}> => {
  const service = getMessageService();
  
  if (!service) {
    return { success: false, message: 'Solapi 서비스가 초기화되지 않았습니다. API 키를 확인해주세요.' };
  }
  
  if (!pfId || !templateId || !senderNumber) {
    return { 
      success: false, 
      message: 'Solapi 설정이 완료되지 않았습니다. PFID, 템플릿ID, 발신번호를 확인해주세요.' 
    };
  }
  
  if (!data.customerPhone) {
    return { success: false, message: '고객 전화번호가 입력되지 않았습니다.' };
  }
  
  const cleanPhone = data.customerPhone.replace(/[^0-9]/g, '');
  
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return { success: false, message: '유효하지 않은 전화번호 형식입니다.' };
  }
  
  const formattedDate = formatDate(data.createdAt);
  const servicesText = data.services.length > 0 ? data.services.join(', ') : '미지정';
  
  try {
    const result = await service.send({
      to: cleanPhone,
      from: senderNumber,
      kakaoOptions: {
        pfId: pfId,
        templateId: templateId,
        variables: {
          '#{고객명}': data.customerName || '고객',
          '#{상담분야}': servicesText,
          '#{접수시간}': formattedDate,
        },
      },
    });
    
    console.log(`✅ [Solapi] 알림톡 발송 성공: ${cleanPhone}`);
    return { success: true, message: '알림톡이 정상 발송되었습니다.', result };
  } catch (error: any) {
    console.error(`❌ [Solapi] 알림톡 발송 실패 (${cleanPhone}):`, error.message);
    return { success: false, message: `발송 실패: ${error.message}` };
  }
};

export interface DelayAlimtalkData {
  customerPhone: string;
  customerName: string;
  services: string[];
}

export const sendDelayAlimtalk = async (data: DelayAlimtalkData): Promise<{
  success: boolean;
  message: string;
  result?: any;
}> => {
  const service = getMessageService();
  
  if (!service) {
    return { success: false, message: 'Solapi 서비스가 초기화되지 않았습니다. API 키를 확인해주세요.' };
  }
  
  if (!pfId || !delayTemplateId || !senderNumber) {
    return { 
      success: false, 
      message: 'Solapi 지연 알림 설정이 완료되지 않았습니다. PFID, 지연 템플릿ID, 발신번호를 확인해주세요.' 
    };
  }
  
  if (!data.customerPhone) {
    return { success: false, message: '고객 전화번호가 입력되지 않았습니다.' };
  }
  
  const cleanPhone = data.customerPhone.replace(/[^0-9]/g, '');
  
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return { success: false, message: '유효하지 않은 전화번호 형식입니다.' };
  }
  
  const servicesText = data.services.length > 0 ? data.services.join(', ') : '미지정';
  
  try {
    const result = await service.send({
      to: cleanPhone,
      from: senderNumber,
      kakaoOptions: {
        pfId: pfId,
        templateId: delayTemplateId,
        variables: {
          '#{고객명}': data.customerName || '고객',
          '#{상담분야}': servicesText,
        },
      },
    });
    
    console.log(`✅ [Solapi] 지연 알림톡 발송 성공: ${cleanPhone}`);
    return { success: true, message: '지연 알림톡이 정상 발송되었습니다.', result };
  } catch (error: any) {
    console.error(`❌ [Solapi] 지연 알림톡 발송 실패 (${cleanPhone}):`, error.message);
    return { success: false, message: `발송 실패: ${error.message}` };
  }
};

// 지역 → 지점 매핑 함수
const getBranchFromRegion = (region: string): string => {
  const regionLower = region.toLowerCase();
  
  // 서울 지점: 서울
  if (regionLower.includes('서울')) {
    return '서울';
  }
  
  // 경인 지점: 경기, 인천
  if (regionLower.includes('경기') || regionLower.includes('인천')) {
    return '경인';
  }
  
  // 대전 지점: 대전, 충청, 세종, 강원
  if (regionLower.includes('대전') || regionLower.includes('충청') || 
      regionLower.includes('충북') || regionLower.includes('충남') ||
      regionLower.includes('세종') || regionLower.includes('강원')) {
    return '대전';
  }
  
  // 부산 지점: 부산, 울산, 경상, 대구
  if (regionLower.includes('부산') || regionLower.includes('울산') || 
      regionLower.includes('경상') || regionLower.includes('경북') || 
      regionLower.includes('경남') || regionLower.includes('대구')) {
    return '부산';
  }
  
  // 광주 지점: 광주, 전라, 제주
  if (regionLower.includes('광주') || regionLower.includes('전라') || 
      regionLower.includes('전북') || regionLower.includes('전남') ||
      regionLower.includes('제주')) {
    return '광주';
  }
  
  // 기본값: 서울
  return '서울';
};

export { getBranchFromRegion };

export interface AssignmentAlimtalkData {
  customerPhone: string;
  customerName: string;
  managerName: string;
  managerPhone: string;
  branchName: string;
}

export const sendAssignmentAlimtalk = async (data: AssignmentAlimtalkData): Promise<{
  success: boolean;
  message: string;
  result?: any;
}> => {
  const service = getMessageService();
  
  if (!service) {
    return { success: false, message: 'Solapi 서비스가 초기화되지 않았습니다. API 키를 확인해주세요.' };
  }
  
  if (!pfId || !assignTemplateId || !senderNumber) {
    return { 
      success: false, 
      message: 'Solapi 담당자 배정 알림 설정이 완료되지 않았습니다. PFID, 배정 템플릿ID, 발신번호를 확인해주세요.' 
    };
  }
  
  if (!data.customerPhone) {
    return { success: false, message: '고객 전화번호가 입력되지 않았습니다.' };
  }
  
  const cleanPhone = data.customerPhone.replace(/[^0-9]/g, '');
  
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return { success: false, message: '유효하지 않은 전화번호 형식입니다.' };
  }
  
  try {
    const result = await service.send({
      to: cleanPhone,
      from: senderNumber,
      kakaoOptions: {
        pfId: pfId,
        templateId: assignTemplateId,
        variables: {
          '#{고객명}': data.customerName || '고객',
          '#{담당자명}': data.managerName || '담당자',
          '#{지점명}': data.branchName || '서울',
          '#{담당자번호}': data.managerPhone || '',
        },
      },
    });
    
    console.log(`✅ [Solapi] 담당자 배정 알림톡 발송 성공: ${cleanPhone} → ${data.managerName} (${data.branchName}지점)`);
    return { success: true, message: '담당자 배정 알림톡이 정상 발송되었습니다.', result };
  } catch (error: any) {
    console.error(`❌ [Solapi] 담당자 배정 알림톡 발송 실패 (${cleanPhone}):`, error.message);
    return { success: false, message: `발송 실패: ${error.message}` };
  }
};

export const sendBulkDelayAlimtalk = async (customers: DelayAlimtalkData[]): Promise<{
  success: boolean;
  message: string;
  successCount: number;
  failCount: number;
  results: Array<{ phone: string; success: boolean; error?: string }>;
}> => {
  const results: Array<{ phone: string; success: boolean; error?: string }> = [];
  
  for (const customer of customers) {
    const result = await sendDelayAlimtalk(customer);
    results.push({
      phone: customer.customerPhone,
      success: result.success,
      error: result.success ? undefined : result.message,
    });
  }
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  return {
    success: successCount > 0,
    message: `${successCount}건 발송 성공, ${failCount}건 실패`,
    successCount,
    failCount,
    results,
  };
};

const formatDate = (date: Date): string => {
  const d = new Date(date);
  
  const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = kstFormatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hours = getPart('hour');
  const minutes = getPart('minute');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const checkSolapiConfig = (): {
  configured: boolean;
  missing: string[];
} => {
  const missing: string[] = [];
  
  if (!apiKey) missing.push('SOLAPI_API_KEY');
  if (!apiSecret) missing.push('SOLAPI_API_SECRET');
  if (!pfId) missing.push('SOLAPI_KAKAO_PFID');
  if (!templateId) missing.push('SOLAPI_TEMPLATE_ID');
  if (!senderNumber) missing.push('SOLAPI_SENDER_NUMBER');
  
  return {
    configured: missing.length === 0,
    missing,
  };
};
