import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  type User as FirebaseUser 
} from 'firebase/auth';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db, googleProvider, authFetch } from '@/lib/firebase';
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
        try {
          await fbUser.getIdToken(true);
          console.log('✅ Firebase 토큰 강제 갱신 완료');
          
          const tokenResult = await fbUser.getIdTokenResult();
          console.log('🔑 토큰 claims:', JSON.stringify(tokenResult.claims));
          console.log('🔑 role claim:', tokenResult.claims.role);
          
          // Custom Claims가 없으면 서버에서 자동 설정 (Firestore 접근 전에 수행)
          if (!tokenResult.claims.role) {
            console.log('🔧 Custom Claims 자동 설정 시도...');
            try {
              const response = await authFetch('/api/auth/init-claims', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              });
              
              if (response.ok) {
                const result = await response.json();
                console.log('✅ Custom Claims 자동 설정 완료:', result);
                await fbUser.getIdToken(true);
                const newTokenResult = await fbUser.getIdTokenResult();
                console.log('🔑 갱신된 role claim:', newTokenResult.claims.role);
              } else {
                const errText = await response.text();
                console.error('❌ Custom Claims 설정 실패:', errText);
                
                if (response.status === 404) {
                  window.alert("등록된 승인 사용자가 아닙니다. 관리자에게 문의하세요.");
                  await firebaseSignOut(auth);
                  setUser(null);
                  setLoading(false);
                  window.location.href = '/login';
                  return;
                }
              }
            } catch (claimsError) {
              console.error('❌ Custom Claims 자동 설정 오류:', claimsError);
            }
          }
        } catch (e) {
          console.error('토큰 갱신 실패:', e);
        }
        
        // 문서 ID는 Firebase Auth UID와 동일
        const userDocId = fbUser.uid;
        userDocIdRef.current = userDocId;
        
        // UID로 직접 사용자 문서 조회 (getDoc 사용)
        const userDocRef = doc(db, 'users', userDocId);
        let userDocSnap;
        try {
          userDocSnap = await getDoc(userDocRef);
        } catch (docError) {
          console.warn('⚠️ UID 기반 문서 조회 실패, 이메일로 fallback:', docError);
          userDocSnap = null;
        }
        
        // 문서가 없으면 이메일로 fallback 조회
        let userData: User | null = null;
        let actualDocId = userDocId;
        
        if (!userDocSnap || !userDocSnap.exists()) {
          const userEmail = fbUser.email;
          if (!userEmail) {
            window.alert("이메일 정보를 가져올 수 없습니다. 다시 로그인해 주세요.");
            await firebaseSignOut(auth);
            setUser(null);
            setLoading(false);
            return;
          }
          
          let emailSnapshot;
          try {
            const emailQuery = query(collection(db, 'users'), where('email', '==', userEmail));
            emailSnapshot = await getDocs(emailQuery);
          } catch (emailError) {
            console.error('❌ 이메일 기반 조회도 실패:', emailError);
            window.alert("권한 설정 중 오류가 발생했습니다. 다시 로그인해 주세요.");
            await firebaseSignOut(auth);
            setUser(null);
            setLoading(false);
            window.location.href = '/login';
            return;
          }
          
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
        
        // Claims와 Firestore 데이터 불일치 시 자동 갱신
        const currentClaims = (await fbUser.getIdTokenResult()).claims;
        if (userData.role && (currentClaims.role !== userData.role || currentClaims.team_id !== (userData.team_id || ''))) {
          console.log(`🔄 Claims 불일치 감지 - Claims: role=${currentClaims.role}, team_id=${currentClaims.team_id} / Firestore: role=${userData.role}, team_id=${userData.team_id}`);
          try {
            const syncRes = await authFetch('/api/auth/init-claims', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            if (syncRes.ok) {
              await fbUser.getIdToken(true);
              console.log('✅ Claims 자동 동기화 완료');
            }
          } catch (syncErr) {
            console.error('⚠️ Claims 자동 동기화 실패:', syncErr);
          }
        }

        // 퇴직자 체크
        if (userData.status === '퇴사') {
          await handleRetiredLogout();
          setLoading(false);
          return;
        }
        
        // uid 바인딩
        if (!userData.uid || userData.uid !== fbUser.uid) {
          try {
            await updateDoc(doc(db, 'users', actualDocId), {
              uid: fbUser.uid,
              name: fbUser.displayName || userData.name,
            });
            userData.uid = fbUser.uid;
            userData.name = fbUser.displayName || userData.name;
          } catch (bindError) {
            console.error('⚠️ UID 바인딩 실패 (서버에서 처리됨):', bindError);
          }
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
