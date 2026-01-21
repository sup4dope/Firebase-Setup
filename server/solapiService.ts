import { SolapiMessageService } from 'solapi';

const apiKey = process.env.SOLAPI_API_KEY || '';
const apiSecret = process.env.SOLAPI_API_SECRET || '';
const pfId = process.env.SOLAPI_KAKAO_PFID || '';
const templateId = process.env.SOLAPI_TEMPLATE_ID || '';
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
  
  return {
    configured: missing.length === 0,
    missing,
  };
};
