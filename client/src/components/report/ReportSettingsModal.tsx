import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, FileText } from "lucide-react";
import type { AgencyInfo } from "./types";

interface ReportSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: { requiredFunding: string; agencies: AgencyInfo[] }) => void;
}

export function ReportSettingsModal({ isOpen, onClose, onGenerate }: ReportSettingsModalProps) {
  const [requiredFunding, setRequiredFunding] = useState("");
  const [agencies, setAgencies] = useState<AgencyInfo[]>([
    { name: "", limit: "", rate: "", period: "", monthlyPayment: "" },
  ]);

  const addAgency = () => {
    if (agencies.length < 3) {
      setAgencies([...agencies, { name: "", limit: "", rate: "", period: "", monthlyPayment: "" }]);
    }
  };

  const removeAgency = (index: number) => {
    setAgencies(agencies.filter((_, i) => i !== index));
  };

  const updateAgency = (index: number, field: keyof AgencyInfo, value: string) => {
    const updated = [...agencies];
    updated[index] = { ...updated[index], [field]: value };
    setAgencies(updated);
  };

  const handleGenerate = () => {
    const validAgencies = agencies.filter(a => a.name.trim() !== "");
    onGenerate({ requiredFunding, agencies: validAgencies });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="w-5 h-5" />
            제안서 설정
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="requiredFunding" className="text-sm font-medium">
              희망 조달 금액
            </Label>
            <Input
              id="requiredFunding"
              placeholder="예: 5억원"
              value={requiredFunding}
              onChange={(e) => setRequiredFunding(e.target.value)}
              data-testid="input-required-funding"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">집행 기관 정보 (최대 3곳)</Label>
              {agencies.length < 3 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAgency}
                  data-testid="button-add-agency"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  기관 추가
                </Button>
              )}
            </div>

            {agencies.map((agency, index) => (
              <div
                key={index}
                className="p-4 border rounded-lg space-y-3 bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    기관 {index + 1}
                  </span>
                  {agencies.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAgency(index)}
                      data-testid={`button-remove-agency-${index}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">기관명</Label>
                    <Input
                      placeholder="예: 중소기업진흥공단"
                      value={agency.name}
                      onChange={(e) => updateAgency(index, "name", e.target.value)}
                      data-testid={`input-agency-name-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">한도</Label>
                    <Input
                      placeholder="예: 3억원"
                      value={agency.limit}
                      onChange={(e) => updateAgency(index, "limit", e.target.value)}
                      data-testid={`input-agency-limit-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">금리</Label>
                    <Input
                      placeholder="예: 3.5%"
                      value={agency.rate}
                      onChange={(e) => updateAgency(index, "rate", e.target.value)}
                      data-testid={`input-agency-rate-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">약정기간</Label>
                    <Input
                      placeholder="예: 5년"
                      value={agency.period}
                      onChange={(e) => updateAgency(index, "period", e.target.value)}
                      data-testid={`input-agency-period-${index}`}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">예상 월 납입금</Label>
                    <Input
                      placeholder="예: 550만원"
                      value={agency.monthlyPayment}
                      onChange={(e) => updateAgency(index, "monthlyPayment", e.target.value)}
                      data-testid={`input-agency-payment-${index}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-report">
            취소
          </Button>
          <Button onClick={handleGenerate} data-testid="button-generate-report">
            <FileText className="w-4 h-4 mr-2" />
            제안서 생성
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
