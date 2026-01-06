import { useEffect, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, serverTimestamp, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  getCustomerByPhone, 
  linkConsultationToCustomer,
  markConsultationProcessed,
  generateConsultationMemoSummary,
} from '@/lib/firestore';
import type { Consultation } from '@shared/types';
import { format } from 'date-fns';

const successfullyProcessedIds = new Set<string>();

interface LandingPageListenerProps {
  enabled?: boolean;
}

export function LandingPageListener({ enabled = true }: LandingPageListenerProps) {
  const currentlyProcessingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    console.log('🔊 LandingPageListener: 상담 신청 실시간 감지 시작');

    const consultationsRef = collection(db, 'consultations');
    const q = query(
      consultationsRef,
      orderBy('createdAt', 'desc'),
      firestoreLimit(200)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added') {
            const docId = change.doc.id;
            const data = change.doc.data();

            if (successfullyProcessedIds.has(docId)) {
              continue;
            }

            if (data.processed !== false) {
              successfullyProcessedIds.add(docId);
              continue;
            }

            if (data.linked_customer_id) {
              successfullyProcessedIds.add(docId);
              continue;
            }

            if (currentlyProcessingRef.current.has(docId)) {
              continue;
            }
            currentlyProcessingRef.current.add(docId);

            console.log(`📥 미처리 상담 신청 발견: ${docId}`, data);

            try {
              await processConsultation(docId, data);
              successfullyProcessedIds.add(docId);
            } catch (error) {
              console.error(`❌ 상담 처리 실패 (${docId}):`, error);
            } finally {
              currentlyProcessingRef.current.delete(docId);
            }
          }
        }
      },
      (error) => {
        console.error('🔥 LandingPageListener 오류:', error);
      }
    );

    return () => {
      console.log('🔇 LandingPageListener: 감지 중지');
      unsubscribe();
    };
  }, [enabled]);

  return null;
}

async function processConsultation(consultationId: string, data: Record<string, unknown>) {
  const phone = (data.phone as string) || '';
  const name = (data.name as string) || '';
  const businessName = (data.businessName as string) || '';
  const businessNumber = (data.businessNumber as string) || '';
  const businessAge = (data.businessAge as string) || '';
  const revenue = (data.revenue as string) || '';
  const region = (data.region as string) || '';
  const creditScore = (data.creditScore as string) || '';
  const taxStatus = (data.taxStatus as string) || '';
  const services = (data.services as string[]) || [];
  const source = (data.source as string) || 'landing-page';
  const createdAt = (data.createdAt as { toDate?: () => Date })?.toDate?.() 
    || (data.createdAt ? new Date(data.createdAt as string) : new Date());

  if (!phone) {
    console.warn(`⚠️ 전화번호 없음, 상담 처리 건너뜀: ${consultationId}`);
    await markConsultationProcessed(consultationId);
    return;
  }

  const consultation: Consultation = {
    id: consultationId,
    name,
    phone,
    businessName,
    businessNumber,
    businessAge,
    revenue,
    region,
    creditScore,
    taxStatus,
    services,
    source,
    createdAt,
  };

  const memoSummary = generateConsultationMemoSummary(consultation);

  const existingCustomer = await getCustomerByPhone(phone);

  if (existingCustomer) {
    console.log(`📋 기존 고객 발견 (${existingCustomer.id}), 메모 추가`);
    
    await addDoc(collection(db, 'counseling_logs'), {
      customer_id: existingCustomer.id,
      content: memoSummary,
      author_name: '시스템 (랜딩페이지)',
      author_id: 'system-landing',
      created_at: serverTimestamp(),
      type: 'landing_page_consultation',
    });

    const customerRef = await import('firebase/firestore').then(m => m.doc(db, 'customers', existingCustomer.id));
    await import('firebase/firestore').then(m => m.updateDoc(customerRef, {
      updated_at: serverTimestamp(),
    }));

    await linkConsultationToCustomer(consultationId, existingCustomer.id);
    await markConsultationProcessed(consultationId);

    console.log(`✅ 기존 고객 메모 추가 완료: ${existingCustomer.id}`);
  } else {
    console.log(`🆕 신규 고객 생성 시작: ${name} (${phone})`);

    const readableId = await generateNewReadableId();
    const today = format(new Date(), 'yyyy-MM-dd');

    const entrySource = source === 'landing-page' ? '광고' : '광고';

    const newCustomerData = {
      readable_id: readableId,
      name,
      phone,
      company_name: businessName,
      business_registration_number: businessNumber,
      status_code: '상담대기',
      entry_date: today,
      entry_source: entrySource,
      manager_id: '',
      manager_name: '미지정',
      team_id: '',
      team_name: '미지정',
      credit_score: 0,
      sales_y1: 0,
      sales_y2: 0,
      recent_sales: 0,
      approved_amount: 0,
      commission_rate: 0,
      is_business_owned: false,
      is_home_owned: false,
      notes: memoSummary,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };

    const customerDocRef = await addDoc(collection(db, 'customers'), newCustomerData);
    const newCustomerId = customerDocRef.id;

    await addDoc(collection(db, 'counseling_logs'), {
      customer_id: newCustomerId,
      content: memoSummary,
      author_name: '시스템 (랜딩페이지)',
      author_id: 'system-landing',
      created_at: serverTimestamp(),
      type: 'landing_page_consultation',
    });

    await linkConsultationToCustomer(consultationId, newCustomerId);
    await markConsultationProcessed(consultationId);

    console.log(`✅ 신규 고객 생성 완료: ${newCustomerId} (${readableId})`);
  }
}

async function generateNewReadableId(): Promise<string> {
  const { collection: firestoreCollection, query: firestoreQuery, where: firestoreWhere, orderBy: firestoreOrderBy, limit: firestoreLimit, getDocs, Timestamp: FirestoreTimestamp } = await import('firebase/firestore');
  
  const now = new Date();
  const datePrefix = now.toISOString().slice(2, 10).replace(/-/g, '').slice(0, 6);
  
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const customersRef = firestoreCollection(db, 'customers');
  const q = firestoreQuery(
    customersRef,
    firestoreWhere('created_at', '>=', FirestoreTimestamp.fromDate(todayStart)),
    firestoreOrderBy('created_at', 'desc'),
    firestoreLimit(1)
  );
  
  const snapshot = await getDocs(q);
  let sequence = 1;
  
  if (!snapshot.empty) {
    const lastCustomer = snapshot.docs[0].data();
    const lastId = lastCustomer.readable_id as string;
    if (lastId && lastId.startsWith(datePrefix)) {
      const lastSequence = parseInt(lastId.split('-')[1], 10);
      sequence = lastSequence + 1;
    }
  }
  
  return `${datePrefix}-${sequence.toString().padStart(3, '0')}`;
}

export default LandingPageListener;
