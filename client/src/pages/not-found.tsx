import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-3 items-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            요청하신 페이지가 존재하지 않거나 이동되었습니다.
          </p>

          <Button asChild className="w-full mt-6" data-testid="button-go-home">
            <Link href="/">
              <Home className="w-4 h-4 mr-2" />
              대시보드로 이동
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
