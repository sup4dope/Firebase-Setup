// Dummy Data Generation Script for CRM System
// Run with: npx tsx scripts/generateDummyData.ts

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';

// Firebase config from environment
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: `${process.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: `${process.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Korean names for dummy data
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const firstNames = ['민준', '서준', '도윤', '예준', '시우', '하준', '지호', '준서', '준우', '현우', '도현', '지훈', '건우', '우진', '선우', '서진', '민재', '현준', '연우', '유준', '지원', '수빈', '지우', '예은', '지민', '서연', '하윤', '수아', '지아', '다은'];

// Company name parts
const companyPrefixes = ['(주)', '주식회사', ''];
const companyNames = ['한빛', '미래', '세원', '대한', '삼성', '한국', '신한', '우리', '하나', '제일', '동양', '태평양', '금성', '현대', '기아', '쌍용', '한화', '롯데', 'SK', 'LG', '포스코', '두산', 'CJ', 'GS', 'KT'];
const companySuffixes = ['테크', '시스템', '소프트', '솔루션', '전자', '기계', '건설', '상사', '무역', '물류', '에너지', '바이오', '헬스케어', '엔지니어링', '인더스트리'];

// Status codes from constants
const statusCodes = [
  "상담대기", "단기부재", "장기부재",
  "거절사유 미파악", "인증불가", "정부기관 오인", "기타자금 오인", "불가업종", "매출없음", "신용점수 미달", "차입금초과",
  "업력미달", "최근대출", "신규휴면", "대표이력",
  "상담완료", "서류준비", "심사중", "승인대기", "계약완료", "집행완료"
];

// Negative status codes (for rejection_reason field mapping)
const negativeStatusCodes = [
  "거절사유 미파악", "인증불가", "정부기관 오인", "기타자금 오인", "불가업종", "매출없음", "신용점수 미달", "차입금초과"
];

// Business types
const businessTypes = ['제조업', '도소매업', 'IT/소프트웨어', '건설업', '서비스업', '요식업', '운수업', '부동산', '금융업', '교육업'];
const entrySource = ['네이버', '구글', '카카오', '지인추천', '블로그', '유튜브', '인스타그램', '페이스북', '기타'];

function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhone(): string {
  return `010-${randomInt(1000, 9999)}-${randomInt(1000, 9999)}`;
}

function generateEmail(name: string): string {
  const domains = ['naver.com', 'gmail.com', 'daum.net', 'kakao.com', 'hanmail.net'];
  return `${name.toLowerCase().replace(/\s/g, '')}${randomInt(1, 999)}@${randomFromArray(domains)}`;
}

function generateCompanyName(): string {
  const prefix = randomFromArray(companyPrefixes);
  const name = randomFromArray(companyNames);
  const suffix = randomFromArray(companySuffixes);
  return `${prefix}${name}${suffix}`.trim();
}

function generateBusinessRegNumber(): string {
  return `${randomInt(100, 999)}-${randomInt(10, 99)}-${randomInt(10000, 99999)}`;
}

function generateDate(startYear: number, endYear: number): string {
  const year = randomInt(startYear, endYear);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateReadableId(date: string, seq: number): string {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}-${String(seq).padStart(3, '0')}`;
}

async function getExistingUsers() {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  const users: { uid: string; name: string; team_id: string | null; team_name: string | null; role: string }[] = [];
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.role !== 'super_admin' && data.status !== '퇴사') {
      users.push({
        uid: doc.id,
        name: data.name || 'Unknown',
        team_id: data.team_id || null,
        team_name: data.team_name || null,
        role: data.role || 'staff'
      });
    }
  });
  
  return users;
}

async function generateDummyCustomers(count: number) {
  console.log(`Generating ${count} dummy customers...`);
  
  // Get existing users (staff/team_leader only)
  const users = await getExistingUsers();
  
  if (users.length === 0) {
    // Create dummy users if none exist
    console.log('No users found. Creating dummy users...');
    const dummyUsers = [
      { uid: 'dummy1', name: '김영업', team_id: 'team1', team_name: '영업1팀', role: 'staff' },
      { uid: 'dummy2', name: '이상담', team_id: 'team1', team_name: '영업1팀', role: 'staff' },
      { uid: 'dummy3', name: '박컨설', team_id: 'team2', team_name: '영업2팀', role: 'team_leader' },
      { uid: 'dummy4', name: '최지원', team_id: 'team2', team_name: '영업2팀', role: 'staff' },
      { uid: 'dummy5', name: '정매니저', team_id: 'team1', team_name: '영업1팀', role: 'team_leader' },
    ];
    users.push(...dummyUsers);
  }
  
  console.log(`Found ${users.length} users for assignment`);
  
  const customersRef = collection(db, 'customers');
  const statusLogsRef = collection(db, 'status_logs');
  
  // Generate entry dates within last 3 months
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
  // Group by date for readable_id generation
  const dateSequenceMap: Record<string, number> = {};
  
  for (let i = 0; i < count; i++) {
    // Random entry date within last 3 months
    const entryDate = new Date(threeMonthsAgo.getTime() + Math.random() * (today.getTime() - threeMonthsAgo.getTime()));
    const entryDateStr = entryDate.toISOString().split('T')[0];
    
    // Generate sequence for readable_id
    if (!dateSequenceMap[entryDateStr]) {
      dateSequenceMap[entryDateStr] = 1;
    } else {
      dateSequenceMap[entryDateStr]++;
    }
    
    const manager = randomFromArray(users);
    const status = randomFromArray(statusCodes);
    const name = randomFromArray(lastNames) + randomFromArray(firstNames);
    const companyName = generateCompanyName();
    
    // Determine amounts based on status
    let approvedAmount = 0;
    let contractAmount = 0;
    let depositAmount = 0;
    let executionAmount = 0;
    let commissionRate = randomInt(2, 5);
    let contractFeeRate = randomInt(1, 3);
    
    if (['승인대기', '계약완료', '집행완료'].includes(status)) {
      approvedAmount = randomInt(500, 10000); // 500만원 ~ 1억원
    }
    if (['계약완료', '집행완료'].includes(status)) {
      contractAmount = Math.round(approvedAmount * (contractFeeRate / 100));
      depositAmount = randomInt(100, 500);
    }
    if (status === '집행완료') {
      executionAmount = approvedAmount;
    }
    
    // Founding date (company age)
    const foundingDate = generateDate(2010, 2023);
    
    const customer = {
      readable_id: generateReadableId(entryDateStr, dateSequenceMap[entryDateStr]),
      daily_no: dateSequenceMap[entryDateStr],
      name,
      company_name: companyName,
      business_registration_number: generateBusinessRegNumber(),
      phone: generatePhone(),
      email: generateEmail(name),
      status_code: status,
      manager_id: manager.uid,
      manager_name: manager.name,
      team_id: manager.team_id || 'default',
      team_name: manager.team_name || '기본팀',
      entry_date: entryDateStr,
      founding_date: foundingDate,
      approved_amount: approvedAmount,
      commission_rate: commissionRate,
      contract_amount: contractAmount,
      deposit_amount: depositAmount,
      contract_fee_rate: contractFeeRate,
      execution_amount: executionAmount,
      processing_org: randomFromArray(['중소벤처기업진흥공단', '신용보증기금', '기술보증기금', '소상공인시장진흥공단', '지역신용보증재단']),
      business_type: randomFromArray(businessTypes),
      entry_source: randomFromArray(entrySource),
      credit_score: randomInt(300, 900),
      recent_sales: randomInt(1, 100), // 억원
      notes: `테스트 데이터 ${i + 1}`,
      created_at: Timestamp.fromDate(entryDate),
      updated_at: Timestamp.fromDate(new Date()),
    };
    
    try {
      const docRef = await addDoc(customersRef, customer);
      
      // Add status log
      await addDoc(statusLogsRef, {
        customer_id: docRef.id,
        old_status: null,
        new_status: status,
        changed_at: Timestamp.fromDate(entryDate),
        changed_by: manager.uid,
        changed_by_name: manager.name,
      });
      
      console.log(`Created customer ${i + 1}/${count}: ${name} (${companyName}) - ${status}`);
    } catch (error) {
      console.error(`Failed to create customer ${i + 1}:`, error);
    }
  }
  
  console.log(`\nDummy data generation complete! Created ${count} customers.`);
}

// Run the script
generateDummyCustomers(100)
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
