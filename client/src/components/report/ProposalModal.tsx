import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, FileText } from "lucide-react"

const AGENCY_OPTIONS = [
  "소상공인진흥공단",
  "지역신용보증재단",
  "미소금융재단",
  "신용보증기금",
  "기술보증기금",
  "중소기업벤처진흥공단",
  "농림수산업자 신용보증기금",
  "국민체육진흥공단",
  "정부 직접대출",
  "금융권 대리대출"
]

export interface RecommendedAgency {
  name: string;
  amount: string;
  rate: string;
  period: string;
}

export interface ProposalFormData {
  desiredAmount: string;
  agencies: RecommendedAgency[];
}

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: ProposalFormData) => void;
  customerName: string;
}

function formatAmountDisplay(value: string): string {
  const num = parseInt(value.replace(/[^0-9]/g, ""), 10)
  if (isNaN(num) || num === 0) return ""
  
  if (num >= 10000) {
    const eok = Math.floor(num / 10000)
    const man = num % 10000
    if (man === 0) {
      return `${eok}억원`
    }
    return `${eok}억 ${man.toLocaleString()}만원`
  }
  return `${num.toLocaleString()}만원`
}

export function ProposalModal({ isOpen, onClose, onGenerate, customerName }: ProposalModalProps) {
  const [desiredAmount, setDesiredAmount] = useState("")
  const [agencies, setAgencies] = useState<RecommendedAgency[]>([
    { name: "", amount: "", rate: "1% ~ 4.5%", period: "1년 ~ 10년" }
  ])

  const addAgency = () => {
    setAgencies([...agencies, { name: "", amount: "", rate: "1% ~ 4.5%", period: "1년 ~ 10년" }])
  }

  const removeAgency = (index: number) => {
    if (agencies.length > 1) {
      setAgencies(agencies.filter((_, i) => i !== index))
    }
  }

  const updateAgency = (index: number, field: keyof RecommendedAgency, value: string) => {
    const updated = [...agencies]
    updated[index] = { ...updated[index], [field]: value }
    setAgencies(updated)
  }

  const handleAmountChange = (index: number, value: string) => {
    const numericValue = value.replace(/[^0-9]/g, "")
    updateAgency(index, "amount", numericValue)
  }

  const handleDesiredAmountChange = (value: string) => {
    const numericValue = value.replace(/[^0-9]/g, "")
    setDesiredAmount(numericValue)
  }

  const handleGenerate = () => {
    const validAgencies = agencies.filter(a => a.name.trim() && a.amount.trim())
    if (validAgencies.length === 0) {
      alert("최소 1개의 추천 기관을 입력해주세요.")
      return
    }
    
    const formattedAgencies = validAgencies.map(a => ({
      ...a,
      amount: formatAmountDisplay(a.amount),
      rate: "1% ~ 4.5%",
      period: "1년 ~ 10년"
    }))
    
    onGenerate({
      desiredAmount: desiredAmount ? formatAmountDisplay(desiredAmount) : "협의 후 결정",
      agencies: formattedAgencies
    })
  }

  const handleClose = () => {
    setDesiredAmount("")
    setAgencies([{ name: "", amount: "", rate: "1% ~ 4.5%", period: "1년 ~ 10년" }])
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5 text-cyan-600" />
            정책자금 제안서 생성
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-semibold text-teal-700">{customerName}</span> 고객의 제안서를 생성합니다.
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="desiredAmount" className="text-sm font-medium">
              희망 조달 금액 (만원 단위)
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="desiredAmount"
                placeholder="예: 50000 (5억원)"
                value={desiredAmount}
                onChange={(e) => handleDesiredAmountChange(e.target.value)}
                className="border-gray-300"
                data-testid="input-desired-amount"
              />
              {desiredAmount && (
                <span className="text-sm text-teal-700 font-medium whitespace-nowrap min-w-[100px]">
                  {formatAmountDisplay(desiredAmount)}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">추천 집행 기관</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addAgency}
                className="text-cyan-600 border-cyan-600 hover:bg-cyan-50"
                data-testid="button-add-agency"
              >
                <Plus className="w-4 h-4 mr-1" />
                기관 추가
              </Button>
            </div>

            <div className="space-y-4">
              {agencies.map((agency, index) => (
                <div
                  key={index}
                  className="p-4 border border-gray-200 rounded-lg bg-gray-50/50 dark:bg-gray-800/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-teal-700">
                      기관 {index + 1}
                    </span>
                    {agencies.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeAgency(index)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        data-testid={`button-remove-agency-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">기관명</Label>
                      <Select
                        value={agency.name}
                        onValueChange={(value) => updateAgency(index, "name", value)}
                      >
                        <SelectTrigger 
                          className="text-sm"
                          data-testid={`select-agency-name-${index}`}
                        >
                          <SelectValue placeholder="기관 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {AGENCY_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">예상 한도 (만원 단위)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="예: 20000"
                          value={agency.amount}
                          onChange={(e) => handleAmountChange(index, e.target.value)}
                          className="text-sm"
                          data-testid={`input-agency-amount-${index}`}
                        />
                      </div>
                      {agency.amount && (
                        <span className="text-xs text-teal-600 font-medium">
                          {formatAmountDisplay(agency.amount)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-proposal">
            취소
          </Button>
          <Button
            onClick={handleGenerate}
            className="bg-teal-700 hover:bg-teal-800 text-white"
            data-testid="button-generate-proposal"
          >
            <FileText className="w-4 h-4 mr-2" />
            제안서 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
