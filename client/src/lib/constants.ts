// 한글 상태명 기반 상수 정의

// 모든 상태 목록 (한글 자연어)
export const ALL_STATUS_VALUES = [
  // 상담 단계
  "상담대기",
  
  // 부재
  "단기부재",
  "장기부재",
  
  // 거절류
  "거절사유 미파악",
  "인증불가",
  "정부기관 오인",
  "기타자금 오인",
  "불가업종",
  "매출없음",
  "신용점수 미달",
  "차입금초과",
  
  // 희망타겟
  "업력미달",
  "최근대출",
  "인증미동의(국세청)",
  "인증미동의(공여내역)",
  "진행기간 미동의",
  "자문료 미동의",
  "계약금미동의(선불)",
  "계약금미동의(후불)",
  
  // 계약완료
  "계약완료(선불)",
  "계약완료(외주)",
  "계약완료(후불)",
  
  // 서류취합
  "서류취합완료(선불)",
  "서류취합완료(외주)",
  "서류취합완료(후불)",
  
  // 신청완료
  "신청완료(선불)",
  "신청완료(외주)",
  "신청완료(후불)",
  
  // 집행완료
  "집행완료",  // 레거시 지원용
  "집행완료(선불)",
  "집행완료(후불)",
  "집행완료(외주)",
  "최종부결",
] as const;

// 상태별 스타일 정의 (한글 상태명을 키로 사용) - 라이트/다크 모드 지원
export const STATUS_STYLES: Record<string, { bg: string; text: string; border?: string }> = {
  // 상담대기 - 보라색
  "상담대기": { bg: "bg-purple-500/20", text: "text-purple-700 dark:text-purple-300", border: "border-purple-500/30" },
  
  // 부재 - 주황색/노란색
  "단기부재": { bg: "bg-orange-500/20", text: "text-orange-700 dark:text-orange-300", border: "border-orange-500/30" },
  "장기부재": { bg: "bg-amber-500/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/30" },
  
  // 쓰레기통/거절류 - 빨간색/로즈
  "쓰레기통": { bg: "bg-red-500/20", text: "text-red-700 dark:text-red-300", border: "border-red-500/30" },
  "거절사유 미파악": { bg: "bg-rose-500/20", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/30" },
  "인증불가": { bg: "bg-red-500/20", text: "text-red-700 dark:text-red-300", border: "border-red-500/30" },
  "정부기관 오인": { bg: "bg-rose-500/20", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/30" },
  "기타자금 오인": { bg: "bg-red-500/20", text: "text-red-700 dark:text-red-300", border: "border-red-500/30" },
  "불가업종": { bg: "bg-rose-500/20", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/30" },
  "매출없음": { bg: "bg-red-500/20", text: "text-red-700 dark:text-red-300", border: "border-red-500/30" },
  "신용점수 미달": { bg: "bg-rose-500/20", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/30" },
  "차입금초과": { bg: "bg-red-500/20", text: "text-red-700 dark:text-red-300", border: "border-red-500/30" },
  
  // 희망타겟 - 노란색
  "업력미달": { bg: "bg-yellow-500/20", text: "text-amber-700 dark:text-yellow-300", border: "border-yellow-500/30" },
  "최근대출": { bg: "bg-yellow-500/20", text: "text-amber-700 dark:text-yellow-300", border: "border-yellow-500/30" },
  "인증미동의(국세청)": { bg: "bg-yellow-500/20", text: "text-amber-700 dark:text-yellow-300", border: "border-yellow-500/30" },
  "인증미동의(공여내역)": { bg: "bg-yellow-500/20", text: "text-amber-700 dark:text-yellow-300", border: "border-yellow-500/30" },
  "진행기간 미동의": { bg: "bg-yellow-500/20", text: "text-amber-700 dark:text-yellow-300", border: "border-yellow-500/30" },
  "자문료 미동의": { bg: "bg-yellow-500/20", text: "text-amber-700 dark:text-yellow-300", border: "border-yellow-500/30" },
  "계약금미동의(선불)": { bg: "bg-yellow-500/20", text: "text-amber-700 dark:text-yellow-300", border: "border-yellow-500/30" },
  "계약금미동의(후불)": { bg: "bg-yellow-500/20", text: "text-amber-700 dark:text-yellow-300", border: "border-yellow-500/30" },
  
  // 계약완료 - 초록색/에메랄드
  "계약완료(선불)": { bg: "bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30" },
  "계약완료(외주)": { bg: "bg-green-500/20", text: "text-green-700 dark:text-green-300", border: "border-green-500/30" },
  "계약완료(후불)": { bg: "bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30" },
  
  // 서류취합 - 파란색
  "서류취합완료(선불)": { bg: "bg-blue-500/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500/30" },
  "서류취합완료(외주)": { bg: "bg-sky-500/20", text: "text-sky-700 dark:text-sky-300", border: "border-sky-500/30" },
  "서류취합완료(후불)": { bg: "bg-blue-500/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500/30" },
  
  // 신청완료 - 인디고
  "신청완료(선불)": { bg: "bg-indigo-500/20", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-500/30" },
  "신청완료(외주)": { bg: "bg-violet-500/20", text: "text-violet-700 dark:text-violet-300", border: "border-violet-500/30" },
  "신청완료(후불)": { bg: "bg-indigo-500/20", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-500/30" },
  
  // 집행완료 - 청록색/티일
  "집행완료": { bg: "bg-teal-500/20", text: "text-teal-700 dark:text-teal-300", border: "border-teal-500/30" },  // 레거시 지원용
  "집행완료(선불)": { bg: "bg-teal-500/20", text: "text-teal-700 dark:text-teal-300", border: "border-teal-500/30" },
  "집행완료(후불)": { bg: "bg-teal-400/20", text: "text-teal-600 dark:text-teal-400", border: "border-teal-400/30" },
  "집행완료(외주)": { bg: "bg-cyan-500/20", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-500/30" },
  
  // 최종부결 - 진한 빨간색
  "최종부결": { bg: "bg-red-700/20", text: "text-red-800 dark:text-red-400", border: "border-red-700/30" },
};

// 상태 옵션 (드롭다운용) - value와 label 모두 한글
export const STATUS_OPTIONS: { value: string; label: string; group?: string }[] = [
  // 상담
  { value: "상담대기", label: "상담대기", group: "상담" },
  
  // 부재
  { value: "단기부재", label: "단기부재", group: "부재" },
  { value: "장기부재", label: "장기부재", group: "부재" },
  
  // 거절
  { value: "거절사유 미파악", label: "거절사유 미파악", group: "거절" },
  { value: "인증불가", label: "인증불가", group: "거절" },
  { value: "정부기관 오인", label: "정부기관 오인", group: "거절" },
  { value: "기타자금 오인", label: "기타자금 오인", group: "거절" },
  { value: "불가업종", label: "불가업종", group: "거절" },
  { value: "매출없음", label: "매출없음", group: "거절" },
  { value: "신용점수 미달", label: "신용점수 미달", group: "거절" },
  { value: "차입금초과", label: "차입금초과", group: "거절" },
  
  // 희망타겟
  { value: "업력미달", label: "업력미달", group: "희망타겟" },
  { value: "최근대출", label: "최근대출", group: "희망타겟" },
  { value: "인증미동의(국세청)", label: "인증미동의(국세청)", group: "희망타겟" },
  { value: "인증미동의(공여내역)", label: "인증미동의(공여내역)", group: "희망타겟" },
  { value: "진행기간 미동의", label: "진행기간 미동의", group: "희망타겟" },
  { value: "자문료 미동의", label: "자문료 미동의", group: "희망타겟" },
  { value: "계약금미동의(선불)", label: "계약금미동의(선불)", group: "희망타겟" },
  { value: "계약금미동의(후불)", label: "계약금미동의(후불)", group: "희망타겟" },
  
  // 계약완료
  { value: "계약완료(선불)", label: "계약완료(선불)", group: "계약" },
  { value: "계약완료(외주)", label: "계약완료(외주)", group: "계약" },
  { value: "계약완료(후불)", label: "계약완료(후불)", group: "계약" },
  
  // 서류취합
  { value: "서류취합완료(선불)", label: "서류취합완료(선불)", group: "서류" },
  { value: "서류취합완료(외주)", label: "서류취합완료(외주)", group: "서류" },
  { value: "서류취합완료(후불)", label: "서류취합완료(후불)", group: "서류" },
  
  // 신청완료
  { value: "신청완료(선불)", label: "신청완료(선불)", group: "신청" },
  { value: "신청완료(외주)", label: "신청완료(외주)", group: "신청" },
  { value: "신청완료(후불)", label: "신청완료(후불)", group: "신청" },
  
  // 집행완료
  { value: "집행완료(선불)", label: "집행완료(선불)", group: "집행" },
  { value: "집행완료(후불)", label: "집행완료(후불)", group: "집행" },
  { value: "집행완료(외주)", label: "집행완료(외주)", group: "집행" },
  { value: "최종부결", label: "최종부결", group: "집행" },
];

// 퍼널 필터링 그룹 정의 (30가지 규칙)
export const FUNNEL_GROUPS: Record<string, string[]> = {
  // 1. 전체
  "전체": [],
  
  // 2. 상담대기
  "상담대기": ["상담대기"],
  
  // 3. 쓰레기통 (상위 그룹) - 하위 항목들 포함
  "쓰레기통": [
    "쓰레기통", "거절사유 미파악", "인증불가", "정부기관 오인", "기타자금 오인",
    "불가업종", "매출없음", "신용점수 미달", "차입금초과"
  ],
  
  // 4, 5. 부재중
  "단기부재": ["단기부재"],
  "장기부재": ["장기부재"],
  
  // 6. 희망타겟 (상위 그룹)
  "희망타겟": [
    "업력미달", "최근대출", "인증미동의(국세청)", "인증미동의(공여내역)",
    "진행기간 미동의", "자문료 미동의", "계약금미동의(선불)", "계약금미동의(후불)"
  ],
  
  // 7~14. 희망타겟 하위 개별 항목
  "업력미달": ["업력미달"],
  "최근대출": ["최근대출"],
  "인증미동의(국세청)": ["인증미동의(국세청)"],
  "인증미동의(공여내역)": ["인증미동의(공여내역)"],
  "진행기간 미동의": ["진행기간 미동의"],
  "자문료 미동의": ["자문료 미동의"],
  "계약금미동의(선불)": ["계약금미동의(선불)"],
  "계약금미동의(후불)": ["계약금미동의(후불)"],
  
  // 15~18. 계약완료 (상위 그룹 및 개별)
  "계약완료": ["계약완료(선불)", "계약완료(외주)", "계약완료(후불)"],
  "계약완료(선불)": ["계약완료(선불)"],
  "계약완료(외주)": ["계약완료(외주)"],
  "계약완료(후불)": ["계약완료(후불)"],
  
  // 19~22. 서류취합 (상위 그룹 및 개별)
  "서류취합": ["서류취합완료(선불)", "서류취합완료(외주)", "서류취합완료(후불)"],
  "서류취합완료(선불)": ["서류취합완료(선불)"],
  "서류취합완료(외주)": ["서류취합완료(외주)"],
  "서류취합완료(후불)": ["서류취합완료(후불)"],
  
  // 23~26. 신청완료 (상위 그룹 및 개별)
  "신청완료": ["신청완료(선불)", "신청완료(외주)", "신청완료(후불)"],
  "신청완료(선불)": ["신청완료(선불)"],
  "신청완료(외주)": ["신청완료(외주)"],
  "신청완료(후불)": ["신청완료(후불)"],
  
  // 27~32. 집행완료 (상위 그룹 및 개별)
  "집행완료_그룹": ["집행완료", "집행완료(선불)", "집행완료(후불)", "집행완료(외주)", "최종부결"],
  "집행완료": ["집행완료"],  // 레거시 지원용
  "집행완료(선불)": ["집행완료", "집행완료(선불)"],  // 레거시 포함
  "집행완료(후불)": ["집행완료(후불)"],
  "집행완료(외주)": ["집행완료(외주)"],
  "최종부결": ["최종부결"],
  
  // 쓰레기통 하위 개별 항목
  "거절사유 미파악": ["거절사유 미파악"],
  "인증불가": ["인증불가"],
  "정부기관 오인": ["정부기관 오인"],
  "기타자금 오인": ["기타자금 오인"],
  "불가업종": ["불가업종"],
  "매출없음": ["매출없음"],
  "신용점수 미달": ["신용점수 미달"],
  "차입금초과": ["차입금초과"],
};

// 퍼널 차트 카테고리 정의 (상단 헤더용)
export const FUNNEL_CATEGORIES = [
  {
    id: "상담대기",
    label: "상담대기",
    statuses: ["상담대기"],
    color: "purple",
  },
  {
    id: "쓰레기통",
    label: "쓰레기통",
    statuses: FUNNEL_GROUPS["쓰레기통"],
    color: "red",
  },
  {
    id: "단기부재",
    label: "단기부재",
    statuses: ["단기부재"],
    color: "orange",
  },
  {
    id: "장기부재",
    label: "장기부재",
    statuses: ["장기부재"],
    color: "amber",
  },
  {
    id: "희망타겟",
    label: "희망타겟",
    statuses: FUNNEL_GROUPS["희망타겟"],
    color: "yellow",
  },
  {
    id: "계약완료",
    label: "계약완료",
    statuses: FUNNEL_GROUPS["계약완료"],
    color: "emerald",
  },
  {
    id: "서류취합",
    label: "서류취합",
    statuses: FUNNEL_GROUPS["서류취합"],
    color: "blue",
  },
  {
    id: "신청완료",
    label: "신청완료",
    statuses: FUNNEL_GROUPS["신청완료"],
    color: "indigo",
  },
  {
    id: "집행완료(선불)",
    label: "집행완료(선불)",
    statuses: ["집행완료", "집행완료(선불)"],  // 레거시 포함
    color: "teal",
  },
  {
    id: "집행완료(후불)",
    label: "집행완료(후불)",
    statuses: ["집행완료(후불)"],
    color: "cyan",
  },
  {
    id: "집행완료(외주)",
    label: "집행완료(외주)",
    statuses: ["집행완료(외주)"],
    color: "sky",
  },
  {
    id: "최종부결",
    label: "최종부결",
    statuses: ["최종부결"],
    color: "rose",
  },
];

// 기본 상태값
export const DEFAULT_STATUS = "상담대기";

// 상태 스타일 가져오기 헬퍼
export function getStatusStyle(status: string): { bg: string; text: string; border?: string } {
  return STATUS_STYLES[status] || { bg: "bg-gray-500/20", text: "text-gray-700 dark:text-gray-300", border: "border-gray-500/30" };
}

// 진행기관 목록
export const PROCESSING_ORGS = ['신용취약', '재도전', '혁신', '일시적', '상생', '지역재단', '미소금융', '신보', '기보', '중진공', '농신보', '기업인증', '기타'];

// 진행기관 상태 타입
export type ProcessingOrgStatus = '진행중' | '부결' | '승인';

// 진행기관 상태별 색상
export const ORG_STATUS_COLORS: Record<ProcessingOrgStatus, { bg: string; text: string; border: string }> = {
  '진행중': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-600' },
  '부결': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-600' },
  '승인': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-300 dark:border-green-600' },
};
