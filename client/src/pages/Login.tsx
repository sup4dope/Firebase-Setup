import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Building2, AlertCircle, Quote } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';

// Fallback 한국어 명언 목록
const FALLBACK_QUOTES = [
  { quote: "성공은 최종이 아니며, 실패는 치명적이지 않다. 계속하는 용기가 중요하다.", author: "윈스턴 처칠" },
  { quote: "미래를 예측하는 가장 좋은 방법은 그것을 창조하는 것이다.", author: "피터 드러커" },
  { quote: "천 리 길도 한 걸음부터 시작된다.", author: "노자" },
  { quote: "당신이 할 수 있다고 믿든, 할 수 없다고 믿든, 당신이 옳다.", author: "헨리 포드" },
  { quote: "위대한 일을 하는 유일한 방법은 당신이 하는 일을 사랑하는 것이다.", author: "스티브 잡스" },
  { quote: "오늘 할 수 있는 일을 내일로 미루지 마라.", author: "벤자민 프랭클린" },
  { quote: "배움에는 왕도가 없다.", author: "유클리드" },
  { quote: "실패는 성공의 어머니이다.", author: "토마스 에디슨" },
];

interface DailyQuote {
  quote: string;
  author: string;
  date: string;
}

// localStorage 캐시 키
const QUOTE_CACHE_KEY = 'daily_quote_cache';

// 오늘 날짜 문자열 (YYYY-MM-DD)
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

// 캐시된 명언 가져오기
function getCachedQuote(): DailyQuote | null {
  try {
    const cached = localStorage.getItem(QUOTE_CACHE_KEY);
    if (cached) {
      const parsed: DailyQuote = JSON.parse(cached);
      if (parsed.date === getTodayString()) {
        return parsed;
      }
    }
  } catch {
    // 캐시 파싱 실패 시 무시
  }
  return null;
}

// 명언 캐시 저장
function setCachedQuote(quote: string, author: string): void {
  const data: DailyQuote = {
    quote,
    author,
    date: getTodayString(),
  };
  localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(data));
}

// MyMemory 무료 번역 API 사용
async function translateToKorean(text: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ko`
    );
    if (!response.ok) throw new Error('Translation failed');
    const data = await response.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    }
    throw new Error('Invalid translation response');
  } catch {
    throw new Error('Translation failed');
  }
}

// ZenQuotes API에서 오늘의 명언 가져오기
async function fetchDailyQuote(): Promise<{ quote: string; author: string }> {
  try {
    // ZenQuotes API는 CORS 제한이 있으므로 프록시 사용
    const response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://zenquotes.io/api/today'));
    if (!response.ok) throw new Error('API request failed');
    
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const { q: quote, a: author } = data[0];
      
      // 영어 명언을 한국어로 번역
      const translatedQuote = await translateToKorean(quote);
      const translatedAuthor = await translateToKorean(author);
      
      return {
        quote: translatedQuote,
        author: translatedAuthor,
      };
    }
    throw new Error('Invalid API response');
  } catch {
    throw new Error('Failed to fetch quote');
  }
}

// 랜덤 fallback 명언 가져오기
function getRandomFallbackQuote(): { quote: string; author: string } {
  const randomIndex = Math.floor(Math.random() * FALLBACK_QUOTES.length);
  return FALLBACK_QUOTES[randomIndex];
}

export default function Login() {
  const { signInWithGoogle, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  
  // 명언 상태
  const [dailyQuote, setDailyQuote] = useState<{ quote: string; author: string } | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);

  // 명언 로드
  useEffect(() => {
    async function loadQuote() {
      setIsLoadingQuote(true);
      
      // 1. 캐시 확인
      const cached = getCachedQuote();
      if (cached) {
        setDailyQuote({ quote: cached.quote, author: cached.author });
        setIsLoadingQuote(false);
        return;
      }
      
      // 2. API에서 가져오기
      try {
        const fetched = await fetchDailyQuote();
        setDailyQuote(fetched);
        setCachedQuote(fetched.quote, fetched.author);
      } catch {
        // 3. 실패 시 fallback 사용
        const fallback = getRandomFallbackQuote();
        setDailyQuote(fallback);
        // fallback도 캐시해서 하루 동안 같은 명언 유지
        setCachedQuote(fallback.quote, fallback.author);
      }
      
      setIsLoadingQuote(false);
    }
    
    loadQuote();
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Login failed:', err);
      
      // Handle specific Firebase errors
      if (err?.code === 'auth/unauthorized-domain') {
        setError('이 도메인이 Firebase에 등록되지 않았습니다. Firebase Console > Authentication > Settings > Authorized domains에서 현재 도메인을 추가해주세요.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setError('로그인 팝업이 닫혔습니다. 다시 시도해주세요.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 팝업 차단을 해제하고 다시 시도해주세요.');
      } else {
        setError(`로그인 실패: ${err?.message || '알 수 없는 오류'}`);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold">경영지원그륩 이음 CRM</CardTitle>
            <CardDescription className="text-base">Management Support Group Yieum CRM</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 오늘의 명언 섹션 */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            {isLoadingQuote ? (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">오늘의 영감을 불러오는 중...</span>
              </div>
            ) : dailyQuote ? (
              <>
                <div className="flex items-start gap-2">
                  <Quote className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground italic leading-relaxed">
                    {dailyQuote.quote}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  - {dailyQuote.author} -
                </p>
              </>
            ) : null}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>로그인 오류</AlertTitle>
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}
          
          <Button
            className="w-full gap-3"
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={loading || isSigningIn}
            data-testid="button-google-login"
          >
            {(loading || isSigningIn) ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <SiGoogle className="w-5 h-5" />
                Google 계정으로 로그인
              </>
            )}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            로그인 시 서비스 이용약관에 동의하는 것으로 간주됩니다
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
