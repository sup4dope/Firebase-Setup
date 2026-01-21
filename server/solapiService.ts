import { SolapiMessageService } from 'solapi';

const apiKey = process.env.SOLAPI_API_KEY || '';
const apiSecret = process.env.SOLAPI_API_SECRET || '';
const pfId = process.env.SOLAPI_KAKAO_PFID || '';
const templateId = process.env.SOLAPI_TEMPLATE_ID || '';
const senderNumber = process.env.SOLAPI_SENDER_NUMBER || '';
const notifyPhoneNumbers = process.env.SOLAPI_NOTIFY_PHONES || '';

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
  customerName: string;
  services: string[];
  createdAt: Date;
}

export const sendConsultationAlimtalk = async (data: ConsultationAlimtalkData): Promise<{
  success: boolean;
  message: string;
  results?: any[];
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
  
  if (!notifyPhoneNumbers) {
    return { success: false, message: '알림 수신 전화번호가 설정되지 않았습니다.' };
  }
  
  const phones = notifyPhoneNumbers.split(',').map(p => p.trim()).filter(p => p);
  
  if (phones.length === 0) {
    return { success: false, message: '유효한 알림 수신 전화번호가 없습니다.' };
  }
  
  const formattedDate = formatDate(data.createdAt);
  const servicesText = data.services.length > 0 ? data.services.join(', ') : '미지정';
  
  const results: any[] = [];
  
  for (const phone of phones) {
    try {
      const result = await service.send({
        to: phone,
        from: senderNumber,
        kakaoOptions: {
          pfId: pfId,
          templateId: templateId,
          variables: {
            '#{고객명}': data.customerName || '미입력',
            '#{상담분야}': servicesText,
            '#{접수시간}': formattedDate,
          },
        },
      });
      
      console.log(`✅ [Solapi] 알림톡 발송 성공: ${phone}`);
      results.push({ phone, success: true, result });
    } catch (error: any) {
      console.error(`❌ [Solapi] 알림톡 발송 실패 (${phone}):`, error.message);
      results.push({ phone, success: false, error: error.message });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  
  return {
    success: successCount > 0,
    message: `${successCount}/${phones.length}건 발송 완료`,
    results,
  };
};

const formatDate = (date: Date): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
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
  if (!notifyPhoneNumbers) missing.push('SOLAPI_NOTIFY_PHONES');
  
  return {
    configured: missing.length === 0,
    missing,
  };
};
