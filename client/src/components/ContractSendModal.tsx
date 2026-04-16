import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/firebase';
import { getCustomers } from '@/lib/firestore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Send, FileText, User, Building2, Search, Loader2, AlertCircle } from 'lucide-react';
import type { Customer, EformsignTemplate } from '@shared/types';

function numberToKorean(num: number): string {
  if (num === 0) return '영';
  const units = ['', '만', '억', '조'];
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const subUnits = ['', '십', '백', '천'];

  let result = '';
  let unitIndex = 0;

  while (num > 0) {
    const chunk = num % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let tempChunk = chunk;
      for (let i = 0; i < 4 && tempChunk > 0; i++) {
        const d = tempChunk % 10;
        if (d > 0) {
          const digitStr = (d === 1 && i > 0) ? '' : digits[d];
          chunkStr = digitStr + subUnits[i] + chunkStr;
        }
        tempChunk = Math.floor(tempChunk / 10);
      }
      result = chunkStr + units[unitIndex] + result;
    }
    num = Math.floor(num / 10000);
    unitIndex++;
  }
  return result;
}

function formatContractAmount(manWon: number): string {
  const won = manWon * 10000;
  const formatted = won.toLocaleString('ko-KR');
  const korean = numberToKorean(won);
  return `${formatted} (금 ${korean} 원)`;
}

interface ContractSendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (info?: { templateName: string; contractType: 'pre' | 'post' | 'out' }) => void;
  preselectedCustomer?: Customer;
}

interface FieldMapping {
  id: string;
  value: string;
  label: string;
  autoFilled: boolean;
}

export function ContractSendModal({ open, onOpenChange, onSuccess, preselectedCustomer }: ContractSendModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<'customer' | 'template' | 'fields' | 'confirm'>('customer');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(preselectedCustomer || null);

  const [templates, setTemplates] = useState<EformsignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EformsignTemplate | null>(null);

  const [fields, setFields] = useState<FieldMapping[]>([]);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (open) {
      if (preselectedCustomer) {
        setSelectedCustomer(preselectedCustomer);
        setRecipientName(preselectedCustomer.name || '');
        setRecipientPhone(preselectedCustomer.phone || '');
        setStep('template');
        fetchTemplates();
      } else {
        setStep('customer');
      }
      setSelectedTemplate(null);
      setFields([]);
      setDocumentName('');
      setComment('');
    }
  }, [open, preselectedCustomer]);

  useEffect(() => {
    if (open && step === 'customer' && customers.length === 0) {
      const fetchCustomers = async () => {
        try {
          const data = await getCustomers();
          setCustomers(data);
        } catch (error) {
          console.error('Error fetching customers:', error);
        }
      };
      fetchCustomers();
    }
  }, [open, step]);

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await authFetch('/api/eformsign/templates');
      const data = await res.json();

      if (data.success && data.data) {
        const templateList = Array.isArray(data.data) ? data.data :
          data.data.forms ? data.data.forms :
          data.data.templates ? data.data.templates : [];

        const INTERNAL_KEYWORDS = ['근로계약서'];
        const mapped: EformsignTemplate[] = templateList
          .map((t: any) => ({
            id: t.template_id || t.id || t.form_id,
            name: t.template_name || t.name || t.form_name || '이름없는 템플릿',
            description: t.description || '',
          }))
          .filter((t: EformsignTemplate) => !INTERNAL_KEYWORDS.some(kw => t.name.includes(kw)));
        setTemplates(mapped);
      } else {
        toast({ title: '템플릿 조회 실패', description: data.error || '템플릿을 가져올 수 없습니다.', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Error fetching templates:', error);
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setRecipientName(customer.name || '');
    setRecipientPhone(customer.phone || '');
    setStep('template');
    fetchTemplates();
  };

  const detectContractType = (templateName: string): 'pre' | 'post' | 'out' => {
    const name = templateName.toLowerCase();
    if (name.includes('(out)') || name.includes('(out)')) return 'out';
    if (name.includes('(post)') || name.includes('(post)')) return 'post';
    return 'pre';
  };

  const getContractTypeLabel = (type: 'pre' | 'post' | 'out'): string => {
    switch (type) {
      case 'post': return '후불';
      case 'out': return '외주';
      default: return '선불';
    }
  };

  const handleSelectTemplate = (template: EformsignTemplate) => {
    setSelectedTemplate(template);

    if (selectedCustomer) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const contractType = detectContractType(template.name);
      const amountManWon = selectedCustomer.approved_amount || 50;
      const commissionRate = selectedCustomer.commission_rate || 5;

      const fullAddress = [selectedCustomer.business_address, selectedCustomer.business_address_detail].filter(Boolean).join(' ');

      const autoFields: FieldMapping[] = [
        { id: '계약일자', value: todayStr, label: '계약일자', autoFilled: true },
        { id: '상호명', value: selectedCustomer.company_name || '', label: '상호명', autoFilled: true },
        { id: '사업자번호', value: selectedCustomer.business_registration_number || '', label: '사업자번호', autoFilled: true },
        { id: '대표자명', value: selectedCustomer.name || '', label: '대표자명', autoFilled: true },
        { id: '소재지', value: fullAddress, label: '소재지', autoFilled: true },
        { id: '연락처', value: selectedCustomer.phone || '', label: '연락처', autoFilled: true },
      ];

      if (contractType !== 'out') {
        autoFields.push({ id: '계약금', value: String(amountManWon), label: '계약금(만원)', autoFilled: false });
      }
      autoFields.push({ id: '자문료율', value: String(commissionRate), label: '자문료율(%)', autoFilled: false });

      setFields(autoFields);
      setDocumentName(`${selectedCustomer.company_name || selectedCustomer.name}_경영지원자문 계약서`);
    }

    setStep('fields');
  };

  const handleFieldChange = (index: number, value: string) => {
    setFields(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], value, autoFilled: false };
      return updated;
    });
  };

  const addCustomField = () => {
    setFields(prev => [...prev, { id: `custom_${Date.now()}`, value: '', label: '', autoFilled: false }]);
  };

  const handleCustomFieldLabelChange = (index: number, label: string) => {
    setFields(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], label, id: label.replace(/\s/g, '_').toLowerCase() || `custom_${index}` };
      return updated;
    });
  };

  const handleSend = async () => {
    if (!selectedCustomer || !selectedTemplate || !user) return;

    if (!recipientPhone) {
      toast({ title: '수신자 정보 필요', description: '수신자 휴대폰 번호를 입력해주세요.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const contractAmountField = fields.find(f => f.id === '계약금');
      const commissionRateField = fields.find(f => f.id === '자문료율');
      const rawAmountManWon = contractAmountField ? parseFloat(contractAmountField.value.replace(/,/g, '')) : 0;
      const rawCommissionRate = commissionRateField ? parseFloat(commissionRateField.value.replace(/,/g, '')) : 0;

      const apiFields = fields
        .filter(f => f.value.trim())
        .map(f => {
          if (f.id === '계약금') {
            const numVal = parseFloat(f.value.replace(/,/g, ''));
            if (!isNaN(numVal) && numVal > 0 && !/[가-힣()]/.test(f.value)) {
              return { id: f.id, value: formatContractAmount(numVal) };
            }
          }
          return { id: f.id, value: f.value };
        });

      const phoneClean = recipientPhone.replace(/-/g, '');
      const recipients: any[] = [{
        step_type: '05',
        use_mail: false,
        use_sms: true,
        member: {
          name: recipientName || selectedCustomer.name,
          id: `${phoneClean}@guest.eformsign.com`,
          sms: { country_code: '+82', phone_number: phoneClean },
        },
        auth: {
          valid: { day: 7, hour: 0 },
        },
      }];

      const res = await authFetch('/api/eformsign/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          template_name: selectedTemplate.name,
          document_name: documentName || `${selectedCustomer.company_name || selectedCustomer.name}_경영지원자문 계약서`,
          fields: apiFields,
          recipients,
          comment,
          customer_id: selectedCustomer.id,
          customer_name: selectedCustomer.company_name || selectedCustomer.name,
          created_by: user.name || user.email || '',
          amount_man_won: rawAmountManWon || 0,
          commission_rate_raw: rawCommissionRate || 0,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({ title: '발송 완료', description: '전자계약서가 성공적으로 발송되었습니다.' });
        onOpenChange(false);
        const cType = detectContractType(selectedTemplate?.name || '');
        onSuccess?.({ templateName: selectedTemplate?.name || '', contractType: cType });
      } else {
        toast({ title: '발송 실패', description: data.error || '계약서 발송에 실패했습니다.', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Error sending contract:', error);
      toast({ title: '오류', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.company_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone && c.phone.includes(customerSearch))
      )
    : customers.slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto" data-testid="contract-send-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            전자계약 발송
          </DialogTitle>
          <DialogDescription>
            {step === 'customer' && '계약서를 보낼 고객을 선택하세요.'}
            {step === 'template' && '사용할 계약서 템플릿을 선택하세요.'}
            {step === 'fields' && '계약서 변수를 확인하고 수정하세요.'}
            {step === 'confirm' && '계약서 발송 정보를 확인하세요.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          {['customer', 'template', 'fields', 'confirm'].map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${step === s ? 'bg-primary text-primary-foreground' :
                  ['customer', 'template', 'fields', 'confirm'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                {i + 1}
              </div>
              <span className={`text-xs ${step === s ? 'font-semibold' : 'text-muted-foreground'}`}>
                {s === 'customer' ? '고객' : s === 'template' ? '템플릿' : s === 'fields' ? '변수' : '확인'}
              </span>
              {i < 3 && <span className="text-muted-foreground mx-1">→</span>}
            </div>
          ))}
        </div>

        {step === 'customer' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="고객명, 상호명, 전화번호로 검색..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-customer"
              />
            </div>
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredCustomers.map(customer => (
                  <Card
                    key={customer.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSelectCustomer(customer)}
                    data-testid={`card-customer-${customer.id}`}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{customer.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {customer.company_name || '-'}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{customer.phone || '-'}</div>
                    </CardContent>
                  </Card>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === 'template' && (
          <div className="space-y-4">
            {selectedCustomer && (
              <Card className="bg-muted/50">
                <CardContent className="p-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{selectedCustomer.name}</span>
                  <span className="text-xs text-muted-foreground">({selectedCustomer.company_name})</span>
                  <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setStep('customer')}>
                    변경
                  </Button>
                </CardContent>
              </Card>
            )}

            {templatesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground text-sm">
                  사용 가능한 템플릿이 없습니다.<br/>
                  eformsign에서 템플릿을 먼저 생성해주세요.
                </p>
                <Button variant="outline" size="sm" onClick={fetchTemplates}>
                  다시 불러오기
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[350px]">
                <div className="space-y-2">
                  {templates.map(template => (
                    <Card
                      key={template.id}
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleSelectTemplate(template)}
                      data-testid={`card-template-${template.id}`}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{template.name}</div>
                          {template.description && (
                            <div className="text-xs text-muted-foreground truncate">{template.description}</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}

        {step === 'fields' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>고객: <strong className="text-foreground">{selectedCustomer?.name}</strong></span>
              <span>|</span>
              <span>템플릿: <strong className="text-foreground">{selectedTemplate?.name}</strong></span>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="document-name">문서 이름</Label>
                <Input
                  id="document-name"
                  value={documentName}
                  onChange={(e) => setDocumentName(e.target.value)}
                  placeholder="계약서 문서 이름"
                  data-testid="input-document-name"
                />
              </div>

              <div className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">기입 변수 (발송 시 자동 입력)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">나머지 항목은 고객이 카카오톡으로 계약서를 받아 직접 입력합니다.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addCustomField} data-testid="button-add-field">
                    + 변수 추가
                  </Button>
                </div>
                <ScrollArea className="max-h-[350px]">
                  <div className="space-y-2">
                    {fields.map((field, idx) => {
                      const isKnownField = ['계약일자','상호명','사업자번호','대표자명','소재지','연락처','계약금','자문료율'].includes(field.id);
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          {isKnownField ? (
                            <Label className="w-32 text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                              {field.label}
                              {field.autoFilled && <Badge variant="outline" className="text-[10px] px-1 py-0">자동</Badge>}
                            </Label>
                          ) : (
                            <Input
                              className="w-32 text-xs shrink-0"
                              value={field.label}
                              onChange={(e) => handleCustomFieldLabelChange(idx, e.target.value)}
                              placeholder="변수명"
                            />
                          )}
                          <Input
                            className="flex-1"
                            value={field.value}
                            onChange={(e) => handleFieldChange(idx, e.target.value)}
                            placeholder={field.label || '값 입력'}
                            data-testid={`input-field-${field.id}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              <div className="border rounded-lg p-3 space-y-3">
                <Label className="text-sm font-semibold">수신자 정보</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">이름</Label>
                    <Input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="수신자 이름"
                      data-testid="input-recipient-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">휴대폰</Label>
                    <Input
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      data-testid="input-recipient-phone"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="comment">메모 (선택사항)</Label>
                <Textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="계약서에 대한 메모..."
                  rows={2}
                  data-testid="input-comment"
                />
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep('template')} data-testid="button-back-to-template">
                이전
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !recipientPhone}
                data-testid="button-send-contract"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    발송 중...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" />
                    계약서 발송
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
