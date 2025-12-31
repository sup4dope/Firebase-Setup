export interface ExecutionPlan {
  institution: string;
  amount: string;
  purpose?: string;
}

export interface DebtDistribution {
  name: string;
  value: number;
  percentage: number;
}

export interface SalesData {
  year: string;
  value: number;
}

export interface ReportProps {
  businessName: string;
  ceoName: string;
  businessNumber: string;
  openingDate: string;
  industry: string;
  businessAge: string;
  address: string;
  reportDate: string;
  validUntil: string;
  consultantName: string;
  
  sales2022: number;
  sales2023: number;
  sales2024: number;
  sales2025: number;
  growthRate: number;
  
  totalDebt: number;
  loanBalance: number;
  guaranteeBalance: number;
  
  debtDistribution: DebtDistribution[];
  
  creditScore: number;
  creditGrade: string;
  creditComment: string;
  
  dti2024: number;
  dti2024Status: '안전' | '주의' | '위험';
  dti3Year: number;
  dti3YearStatus: '안전' | '주의' | '위험';
  dtiInterpretation: string;
  
  diagnosisResult: string;
  currentRate: number;
  improvedRate: number;
  rateDiff: number;
  currentInterest: string;
  improvedInterest: string;
  interestSavings: string;
  
  executionPlan: ExecutionPlan[];
  totalExpectedAmount: string;
  
  recommendation1: string;
  recommendation2: string;
  recommendation3: string;
}

export const formatBillion = (value: number): string => {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억원`;
  } else if (value >= 10000) {
    return `${(value / 10000).toFixed(0)}만원`;
  }
  return `${value.toLocaleString()}원`;
};
