import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  type User as FirebaseUser 
} from 'firebase/auth';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';
import { updateLoginHistory } from '@/lib/firestore';
import type { User, UserRole, LoginHistory } from '@shared/types';

// IP 주소 가져오기 함수
const fetchClientIP = async (): Promise<string> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || 'Unknown';
  } catch {
    return 'Unknown';
  }
};

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  userDocId: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isStaff: boolean;
  isTeamLeader: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

// 2시간 비활동 시 자동 로그아웃 (밀리초)
const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000; // 2시간

export function AuthProvider({ children }: AuthProviderProps) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const userDocIdRef = useRef<string | null>(null);
  const statusUnsubscribeRef = useRef<(() => void) | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 퇴직자 로그아웃 처리 함수
  const handleRetiredLogout = async () => {
    window.alert("접속 권한이 없습니다. (퇴사 처리된 계정입니다)");
    await firebaseSignOut(auth);
    setUser(null);
    window.location.href = '/login';
  };

  // 비활동 자동 로그아웃 처리 함수
  const handleInactivityLogout = async () => {
    window.alert("2시간 동안 활동이 없어 자동 로그아웃됩니다.");
    await firebaseSignOut(auth);
    setUser(null);
    window.location.href = '/login';
  };

  // 비활동 타이머 리셋
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // 로그인 상태일 때만 타이머 설정
    if (firebaseUser) {
      inactivityTimerRef.current = setTimeout(() => {
        handleInactivityLogout();
      }, INACTIVITY_TIMEOUT);
    }
  };

  // 비활동 감지 이벤트 리스너 설정
  useEffect(() => {
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    // 로그인 상태일 때만 리스너 등록
    if (firebaseUser) {
      activityEvents.forEach(event => {
        window.addEventListener(event, handleActivity, { passive: true });
      });
      // 초기 타이머 설정
      resetInactivityTimer();
    }

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [firebaseUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      
      // 이전 상태 리스너 정리
      if (statusUnsubscribeRef.current) {
        statusUnsubscribeRef.current();
        statusUnsubscribeRef.current = null;
      }
      
      if (fbUser) {
        // Custom Claims를 포함한 새 토큰 강제 발급
        // Firebase는 토큰을 캐시하므로, 서버에서 설정한 custom claims를 받으려면 강제 갱신 필요
        try {
          await fbUser.getIdToken(true); // true = forceRefresh
          console.log('✅ Firebase 토큰 강제 갱신 완료');
          
          // 토큰에 포함된 claims 확인 (디버그용)
          const tokenResult = await fbUser.getIdTokenResult();
          console.log('🔑 토큰 claims:', JSON.stringify(tokenResult.claims));
          console.log('🔑 role claim:', tokenResult.claims.role);
        } catch (e) {
          console.error('토큰 갱신 실패:', e);
        }
        
        // 문서 ID는 Firebase Auth UID와 동일
        const userDocId = fbUser.uid;
        userDocIdRef.current = userDocId;
        
        // UID로 직접 사용자 문서 조회 (getDoc 사용)
        const userDocRef = doc(db, 'users', userDocId);
        const userDocSnap = await getDoc(userDocRef);
        
        // 문서가 없으면 이메일로 fallback 조회 (마이그레이션 전 호환성)
        let userData: User | null = null;
        let actualDocId = userDocId;
        
        if (!userDocSnap.exists()) {
          // 이메일로 조회 시도 (마이그레이션 전 데이터 호환)
          const userEmail = fbUser.email;
          if (!userEmail) {
            window.alert("이메일 정보를 가져올 수 없습니다. 다시 로그인해 주세요.");
            await firebaseSignOut(auth);
            setUser(null);
            setLoading(false);
            return;
          }
          
          const emailQuery = query(collection(db, 'users'), where('email', '==', userEmail));
          const emailSnapshot = await getDocs(emailQuery);
          
          if (emailSnapshot.empty) {
            window.alert("등록된 승인 사용자가 아닙니다. 관리자에게 문의하세요.");
            await firebaseSignOut(auth);
            setUser(null);
            setLoading(false);
            window.location.href = '/login';
            return;
          }
          
          userData = emailSnapshot.docs[0].data() as User;
          actualDocId = emailSnapshot.docs[0].id;
          userDocIdRef.current = actualDocId;
        } else {
          userData = userDocSnap.data() as User;
        }
        
        // 퇴직자 체크: status가 '퇴사'인 경우 접근 차단
        if (userData.status === '퇴사') {
          await handleRetiredLogout();
          setLoading(false);
          return;
        }
        
        // uid가 아직 설정되지 않았거나 다르면 업데이트
        if (!userData.uid || userData.uid !== fbUser.uid) {
          await updateDoc(doc(db, 'users', actualDocId), {
            uid: fbUser.uid,
            name: fbUser.displayName || userData.name,
          });
          userData.uid = fbUser.uid;
          userData.name = fbUser.displayName || userData.name;
        }
        
        // 로그인 이력 기록 (실제 로그인 시에만 - 새로고침 제외)
        const sessionLoginKey = `login_recorded_${fbUser.uid}`;
        const alreadyRecorded = sessionStorage.getItem(sessionLoginKey);
        
        if (!alreadyRecorded) {
          try {
            const clientIP = await fetchClientIP();
            const existingHistory: LoginHistory[] = (userData.login_history || []).map(h => ({
              ...h,
              logged_at: h.logged_at instanceof Timestamp 
                ? (h.logged_at as Timestamp).toDate() 
                : new Date(h.logged_at as unknown as string),
            }));
            await updateLoginHistory(actualDocId, clientIP, existingHistory);
            userData.current_ip = clientIP;
            sessionStorage.setItem(sessionLoginKey, 'true');
          } catch (e) {
            console.error('Failed to update login history:', e);
          }
        } else {
          try {
            const clientIP = await fetchClientIP();
            userData.current_ip = clientIP;
          } catch (e) {
            console.error('Failed to fetch IP:', e);
          }
        }
        
        setUser(userData);
        
        // 실시간 상태 감시: 관리자가 퇴사 처리하면 즉시 로그아웃
        const watchDocRef = doc(db, 'users', actualDocId);
        statusUnsubscribeRef.current = onSnapshot(watchDocRef, (snapshot) => {
          if (snapshot.exists()) {
            const updatedData = snapshot.data() as User;
            if (updatedData.status === '퇴사') {
              handleRetiredLogout();
            } else {
              setUser(updatedData);
            }
          }
        });
      } else {
        setUser(null);
        userDocIdRef.current = null;
      }
      
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (statusUnsubscribeRef.current) {
        statusUnsubscribeRef.current();
      }
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const refreshUser = async () => {
    if (!firebaseUser || !userDocIdRef.current) return;
    try {
      const userDocRef = doc(db, 'users', userDocIdRef.current);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const userData = docSnap.data() as User;
        setUser(userData);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const isStaff = user?.role === 'staff';
  const isTeamLeader = user?.role === 'team_leader';
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        userDocId: userDocIdRef.current,
        loading,
        signInWithGoogle,
        signOut,
        refreshUser,
        isStaff,
        isTeamLeader,
        isSuperAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
