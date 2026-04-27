'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  supabase, getListings, createListing, sendMatchRequest,
  setMatched, updateRequestStatus, updateProfileTrips,
  signUp, signIn, signOut, getProfile,
  addPaw, removePaw, getMyPaws,
  type Listing, type MatchRequest, type Profile,
} from '../lib/supabase'

/* ─── 상수 ─── */
const DAYS    = ['월','화','수','목','금']
const TAGS    = ['비흡연','조용한 탑승','대화 OK','음악 OK','반려동물 NO','짐 없음','정시 탑승','에어컨 완비','여성 전용']
const AVATARS = ['😊','👨‍💼','👩‍💼','🧑‍💻','👩‍💻','🧑‍🔬','👩‍🎓','🧑‍🔧','👨‍🎨','🧑‍🚀']
const DEST    = '농진원'   // 도착지 고정

/* ─── 유틸 ─── */
function today() { return new Date().toISOString().split('T')[0] }

function fmtDate(d: string) {
  if (!d) return ''
  const dt   = new Date(d + 'T00:00:00')
  const diff = Math.round((dt.getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000)
  const lbl  = diff === 0 ? '오늘' : diff === 1 ? '내일' : diff === -1 ? '어제' : null
  return `${d.slice(5).replace('-', '/')}${lbl ? ` (${lbl})` : ''}`
}

function calcMp(l: Listing, me: Profile | null): number {
  if (!me) return 50
  let s = 50
  if (l.from_loc.includes(me.home_area.split(' ')[0])) s += 30
  if (l.dept === me.dept) s += 15
  if (l.days.filter(Boolean).length >= 4) s += 5
  return Math.min(s, 99)
}

/* ─── 컴포넌트 ─── */
export default function App() {
  /* 인증 */
  const [authMode,    setAuthMode]    = useState<'login'|'signup'>('login')
  const [uid,         setUid]         = useState<string|null>(null)
  const [profile,     setProfile]     = useState<Profile|null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  /* 로그인 폼 */
  const [lEmail,   setLEmail]   = useState('')
  const [lPw,      setLPw]      = useState('')
  const [lErr,     setLErr]     = useState('')
  const [lLoading, setLLoading] = useState(false)

  /* 가입 폼 */
  const [rEmail,   setREmail]   = useState('')
  const [rPw,      setRPw]      = useState('')
  const [rName,    setRName]    = useState('')
  const [rDept,    setRDept]    = useState('')      // 자유 입력
  const [rHome,    setRHome]    = useState('')
  const [rAvatar,  setRAvatar]  = useState('😊')
  const [rErr,     setRErr]     = useState('')
  const [rLoading, setRLoading] = useState(false)

  /* 개인정보 동의 */
  const [rTerms,   setRTerms]   = useState(false)
  const [rPrivacy, setRPrivacy] = useState(false)
  const [showTermsModal,   setShowTermsModal]   = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)

  /* 앱 상태 */
  const [tab,      setTab]      = useState<'home'|'board'|'my'|'paw'>('home')
  const [listings, setListings] = useState<Listing[]>([])
  const [myListings, setMyListings] = useState<Listing[]>([])
  const [reqs,     setReqs]     = useState<MatchRequest[]>([])
  const [sentIds,  setSentIds]  = useState<Set<string>>(new Set())
  const [pawedIds, setPawedIds] = useState<Set<string>>(new Set())
  const [filter,   setFilter]   = useState('all')
  const [loading,  setLoading]  = useState(false)
  const [myGroup,  setMyGroup]  = useState<{name:string,dept:string,avatar:string,role:string}[]|null>(null)
  const [showForm, setShowForm] = useState<'driver'|'passenger'|null>(null)
  const [detail,   setDetail]   = useState<Listing|null>(null)
  const [toastMsg, setToastMsg] = useState('')
  const [toastVis, setToastVis] = useState(false)

  /* 등록 폼 */
  const [fFrom,       setFFrom]       = useState('')
  const [fVia,        setFVia]        = useState('')
  const [fDir,        setFDir]        = useState('출근')
  const [fDate,       setFDate]       = useState(today())
  const [fTime,       setFTime]       = useState('08:00')
  const [fSeats,      setFSeats]      = useState(3)
  const [fCost,       setFCost]       = useState(2000)
  const [fPeople,     setFPeople]     = useState(1)
  const [fBudget,     setFBudget]     = useState(2000)
  const [fDays,         setFDays]         = useState([1,1,1,1,1])
  const [fTags,         setFTags]         = useState<string[]>([])
  const [fScheduleType,   setFScheduleType]   = useState<'single'|'repeat'|'2bu'|'5bu'>('single')
  const [fRepeatEnd,      setFRepeatEnd]      = useState('')
  const [fRotationGroup,  setFRotationGroup]  = useState('')
  const [fSubmitting,   setFSubmitting]   = useState(false)

  /* ─── 인증 초기화 ─── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUid(session.user.id)
        getProfile(session.user.id).then(p => { setProfile(p); setAuthLoading(false) })
      } else { setAuthLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (session?.user) { setUid(session.user.id); getProfile(session.user.id).then(setProfile) }
      else { setUid(null); setProfile(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  /* ─── 토스트 ─── */
  function toast(msg: string) {
    setToastMsg(msg); setToastVis(true)
    setTimeout(() => setToastVis(false), 2600)
  }

  /* ─── 로그인 ─── */
  async function handleLogin() {
    setLErr(''); setLLoading(true)
    try { await signIn(lEmail.trim(), lPw) }
    catch { setLErr('이메일 또는 비밀번호가 올바르지 않아요') }
    finally { setLLoading(false) }
  }

  /* ─── 가입 ─── */
  async function handleSignUp() {
    if (!rName.trim())        { setRErr('이름을 입력해 주세요'); return }
    if (!rDept.trim())        { setRErr('소속 부서를 입력해 주세요'); return }
    if (!rHome.trim())        { setRErr('거주 지역을 입력해 주세요'); return }
    if (!rEmail.includes('@')){ setRErr('올바른 이메일을 입력해 주세요'); return }
    if (rPw.length < 6)       { setRErr('비밀번호는 6자 이상이어야 해요'); return }
    if (!rTerms || !rPrivacy) { setRErr('서비스 이용약관 및 개인정보 수집·이용에 동의해 주세요'); return }
    setRErr(''); setRLoading(true)
    try {
      const result = await signUp(rEmail.trim(), rPw, {
        name: rName.trim(), dept: rDept.trim(),
        home_area: rHome.trim(), avatar: rAvatar,
      })
      // session이 없으면 이메일 인증 필요, 있으면 바로 로그인
      if (!result.session) {
        setAuthMode('login')
        setLEmail(rEmail.trim())
        toast('📧 가입 완료! 이메일 인증 후 로그인해 주세요')
      } else {
        toast('가입 완료! KOAT 카풀에 오신 것을 환영해요 🎉')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('already') || msg.includes('already registered')) {
        setRErr('이미 가입된 이메일이에요')
      } else if (msg.includes('invalid') || msg.includes('Invalid')) {
        setRErr('올바른 이메일 형식이 아니에요')
      } else if (msg.includes('Password')) {
        setRErr('비밀번호는 6자 이상이어야 해요')
      } else {
        setRErr('가입에 실패했어요. 잠시 후 다시 시도해 주세요')
        console.error('Signup error:', e)
      }
    } finally { setRLoading(false) }
  }

  /* ─── 로그아웃 ─── */
  async function handleSignOut() {
    await signOut()
    setUid(null); setProfile(null)
    setListings([]); setMyListings([]); setReqs([])
    setSentIds(new Set()); setPawedIds(new Set()); setMyGroup(null); setTab('home')
    toast('로그아웃 됐어요')
  }

  /* ─── 카풀 로드 ─── */
  const loadListings = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      const area = filter === 'near' ? profile.home_area.split(' ')[0] : undefined
      const dept = filter === 'dept' ? profile.dept : undefined
      const data = await getListings(filter, dept, area)
      const withMp = data.map(l => ({ ...l, mp: calcMp(l, profile) }))
      setListings(withMp)
      if (uid) setMyListings(withMp.filter(l => l.user_id === uid))
    } finally { setLoading(false) }
  }, [filter, profile, uid])

  useEffect(() => { if (profile) loadListings() }, [loadListings, profile])

  /* ─── PAW 로드 ─── */
  useEffect(() => {
    if (!uid) return
    getMyPaws(uid).then(ids => setPawedIds(new Set(ids))).catch(() => {})
  }, [uid])

  /* Realtime */
  useEffect(() => {
    if (!uid) return
    const ch = supabase.channel('listings-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => loadListings())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [uid, loadListings])

  /* ─── PAW 토글 ─── */
  async function togglePaw(e: React.MouseEvent, l: Listing) {
    e.stopPropagation()
    if (!uid) return
    try {
      if (pawedIds.has(l.id)) {
        await removePaw(uid, l.id)
        setPawedIds(prev => { const s = new Set(prev); s.delete(l.id); return s })
      } else {
        await addPaw(uid, l.id)
        setPawedIds(prev => new Set([...prev, l.id]))
        toast('찜 목록에 추가했어요 🐾')
      }
    } catch { toast('오류가 발생했어요') }
  }

  /* ─── 매칭 요청 ─── */
  async function handleMatch(l: Listing) {
    if (!profile || !uid || l.matched || sentIds.has(l.id)) return
    if (l.user_id === uid) { toast('내가 등록한 카풀이에요'); return }
    try {
      await sendMatchRequest({ listing_id: l.id, requester_id: uid, requester_name: profile.name, requester_dept: profile.dept })
      setSentIds(prev => new Set(Array.from(prev).concat(l.id)))
      toast(`${l.name}님에게 매칭 요청을 보냈어요 🚗`)
    } catch { toast('이미 요청을 보냈거나 오류가 발생했어요') }
  }

  async function acceptMatch(req: MatchRequest) {
    try {
      await updateRequestStatus(req.id, 'accepted')
      await setMatched(req.listing_id)
      const l = listings.find(x => x.id === req.listing_id)
      setMyGroup([
        { name: profile!.name, dept: profile!.dept, avatar: profile!.avatar, role: l?.type === 'driver' ? '드라이버' : '동승자' },
        { name: req.requester_name, dept: req.requester_dept, avatar: '🧑‍💼', role: l?.type === 'driver' ? '동승자' : '드라이버' },
      ])
      setReqs(prev => prev.filter(r => r.id !== req.id))
      if (profile && uid) updateProfileTrips(uid, profile.trips + 1)
      toast(`${req.requester_name}님과 매칭 완료! 📱`)
      loadListings()
    } catch { toast('수락 처리에 실패했어요') }
  }

  async function declineMatch(req: MatchRequest) {
    await updateRequestStatus(req.id, 'declined')
    setReqs(prev => prev.filter(r => r.id !== req.id))
    toast(`${req.requester_name}님의 요청을 거절했어요`)
  }

  /* ─── 카풀 등록 폼 ─── */
  function openForm(type: 'driver' | 'passenger') {
    setShowForm(type)
    setFFrom(profile?.home_area ?? '')
    setFVia(''); setFDir('출근'); setFDate(today()); setFTime('08:00')
    setFSeats(3); setFCost(2000); setFPeople(1); setFBudget(2000)
    setFDays([1,1,1,1,1]); setFTags([])
    // 동승자는 항상 개별 일정만
    setFScheduleType(type === 'passenger' ? 'single' : 'single')
    setFRepeatEnd(''); setFRotationGroup('')
  }

  async function registerListing() {
    if (!fFrom.trim()) { toast('출발지를 입력해 주세요'); return }
    if (fScheduleType === 'single' && !fDate) { toast('날짜를 선택해 주세요'); return }
    if (fScheduleType === 'repeat' && !fDays.some(Boolean)) { toast('운행 요일을 하나 이상 선택해 주세요'); return }
    if ((fScheduleType === '2bu' || fScheduleType === '5bu') && !fRotationGroup) { toast('운행 그룹을 선택해 주세요'); return }
    if (!profile || !uid) return
    setFSubmitting(true)
    try {
      const newItem = await createListing({
        type: showForm!, user_id: uid,
        name: profile.name, dept: profile.dept, avatar: profile.avatar,
        from_loc: fFrom.trim(), via_loc: fVia.trim() || undefined,
        direction: fDir, depart_time: fTime,
        schedule_type: fScheduleType,
        ride_date: fScheduleType === 'single' ? fDate : undefined,
        repeat_end_date: fScheduleType === 'repeat' && fRepeatEnd ? fRepeatEnd : undefined,
        days: fScheduleType === 'repeat' ? fDays : [0,0,0,0,0],
        rotation_group: (fScheduleType === '2bu' || fScheduleType === '5bu') ? fRotationGroup : undefined,
        ...(showForm === 'driver' ? { seats: fSeats, cost: fCost } : { people: fPeople, budget: fBudget }),
        tags: fTags,
        rating: 5.0, review_cnt: 0, matched: false,
      })
      setMyListings(prev => [{ ...newItem, mp: 100 }, ...prev])
      setShowForm(null)
      toast('매칭보드에 등록됐어요! 🚀')
      loadListings()
    } catch { toast('등록에 실패했어요') }
    finally { setFSubmitting(false) }
  }

  /* ─── 파생 값 ─── */
  const driverCnt  = listings.filter(l => l.type === 'driver').length
  const passCnt    = listings.filter(l => l.type === 'passenger').length
  const matchedCnt = listings.filter(l => l.matched).length
  const availCnt   = listings.filter(l => !l.matched).length
  const topSuggest = [...listings]
    .filter(l => !l.matched && l.user_id !== uid)
    .sort((a, b) => (b.mp || 0) - (a.mp || 0))
    .slice(0, 3)
  const pawedListings = listings.filter(l => pawedIds.has(l.id))

  function btnCls(l: Listing) {
    if (l.user_id === uid) return 'act-btn mine-btn'
    if (l.matched)         return 'act-btn gray'
    if (sentIds.has(l.id)) return 'act-btn gray'
    return l.type === 'driver' ? 'act-btn blue' : 'act-btn green'
  }
  function btnTxt(l: Listing) {
    if (l.user_id === uid) return '✏️ 내가 등록한 카풀'
    if (l.matched)         return '✅ 매칭완료'
    if (sentIds.has(l.id)) return '⏳ 요청 전송됨'
    return l.type === 'driver' ? '🚗 탑승 요청하기' : '🙋 동승 요청하기'
  }

  /* ══ 로딩 스플래시 ══ */
  if (authLoading) return (
    <div className="app">
      <div className="splash">
        <div className="splash-inner">
          <div className="splash-logo">🚗</div>
          <div className="splash-name">KOAT CarPool</div>
          <div className="splash-sub">한국농업기술진흥원 사내 카풀</div>
          <div className="splash-spin"><div className="spinner"/></div>
        </div>
      </div>
    </div>
  )

  /* ══ 인증 화면 ══ */
  if (!uid || !profile) return (
    <div className="app">
      <div className="auth-wrap">
        <div className="auth-hero">
          <div className="auth-hero-deco">🚗</div>
          <div className="auth-logo">
            <div className="auth-logo-badge">
              <span className="auth-logo-icon">🌾</span>
              <span className="auth-logo-text">KOAT</span>
              <span className="auth-logo-divider"/>
              <span className="auth-logo-sub">CarPool</span>
            </div>
          </div>
          <div className="auth-headline">
            동료와 함께<br/><em>출퇴근</em>하세요
            <span>한국농업기술진흥원 임직원 전용<br/>사내 카풀 매칭 서비스</span>
          </div>
        </div>

        <div className="auth-body">
          <div className="auth-tabs">
            <button className={`auth-tab${authMode==='login'?' active':''}`}
              onClick={() => { setAuthMode('login'); setLErr(''); setRErr('') }}>로그인</button>
            <button className={`auth-tab${authMode==='signup'?' active':''}`}
              onClick={() => { setAuthMode('signup'); setLErr(''); setRErr('') }}>회원가입</button>
          </div>

          {authMode === 'login' ? (
            <>
              <div className="fg">
                <label>이메일</label>
                <input className={`fi${lErr?' err':''}`} type="email" placeholder="koat@koat.or.kr"
                  value={lEmail} onChange={e => setLEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}/>
              </div>
              <div className="fg">
                <label>비밀번호</label>
                <input className={`fi${lErr?' err':''}`} type="password" placeholder="비밀번호 입력"
                  value={lPw} onChange={e => setLPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}/>
                {lErr && <div className="err-msg">⚠ {lErr}</div>}
              </div>
              <button className="auth-btn" onClick={handleLogin} disabled={lLoading}>
                {lLoading ? <><div className="spinner"/>로그인 중...</> : '로그인'}
              </button>
              <div className="auth-note">계정이 없으신가요? 위의 회원가입 탭에서 시작하세요</div>
            </>
          ) : (
            <>
              <div className="fg">
                <label>이름</label>
                <input className="fi" placeholder="홍길동" value={rName} onChange={e => setRName(e.target.value)}/>
              </div>
              <div className="fg">
                <label>소속 부서</label>
                <input className="fi" placeholder="예) 기술사업화팀" value={rDept} onChange={e => setRDept(e.target.value)}/>
              </div>
              <div className="fg">
                <label>거주 지역 <span className="opt">(출발 구역)</span></label>
                <input className="fi" placeholder="예) 익산역 인근" value={rHome} onChange={e => setRHome(e.target.value)}/>
              </div>
              <div className="fg">
                <label>프로필 이모지</label>
                <div className="avatar-grid">
                  {AVATARS.map(a => (
                    <button key={a} className={`avatar-btn${rAvatar===a?' sel':''}`} onClick={() => setRAvatar(a)}>{a}</button>
                  ))}
                </div>
              </div>
              <div className="fg">
                <label>이메일</label>
                <input className="fi" type="email" placeholder="koat@koat.or.kr" value={rEmail} onChange={e => setREmail(e.target.value)}/>
              </div>
              <div className="fg">
                <label>비밀번호 <span className="opt">6자 이상</span></label>
                <input className={`fi${rErr?' err':''}`} type="password" placeholder="비밀번호 설정"
                  value={rPw} onChange={e => setRPw(e.target.value)}/>
              </div>

              {/* ── 약관 동의 ── */}
              <div className="consent-box">
                <div className="consent-title">약관 동의</div>
                <label className="consent-item consent-all-row">
                  <span className="consent-check" onClick={() => { setRTerms(!rTerms || !rPrivacy ? true : false); setRPrivacy(!rTerms || !rPrivacy ? true : false) }}>
                    {rTerms && rPrivacy ? '☑' : '☐'}
                  </span>
                  <span className="consent-text consent-all-text">전체 동의</span>
                </label>
                <div className="consent-divider"/>
                <label className="consent-item">
                  <span className="consent-check" onClick={() => setRTerms(v => !v)}>{rTerms ? '☑' : '☐'}</span>
                  <span className="consent-text">[필수] 서비스 이용약관</span>
                  <button type="button" className="consent-view-btn" onClick={() => setShowTermsModal(true)}>보기</button>
                </label>
                <label className="consent-item">
                  <span className="consent-check" onClick={() => setRPrivacy(v => !v)}>{rPrivacy ? '☑' : '☐'}</span>
                  <span className="consent-text">[필수] 개인정보 수집·이용</span>
                  <button type="button" className="consent-view-btn" onClick={() => setShowPrivacyModal(true)}>보기</button>
                </label>
              </div>

              {rErr && <div className="err-msg" style={{marginBottom:10}}>⚠ {rErr}</div>}
              <button className="auth-btn green-btn" onClick={handleSignUp} disabled={rLoading}>
                {rLoading ? <><div className="spinner"/>가입 중...</> : '가입하고 시작하기'}
              </button>
              <div className="auth-note">KOAT 임직원 전용 서비스입니다<br/>사내 카풀 목적으로만 사용됩니다</div>
            </>
          )}
        </div>
      </div>
      {/* 이용약관 모달 */}
      {showTermsModal && (
        <div className="overlay" onClick={() => setShowTermsModal(false)}>
          <div className="modal policy-modal" onClick={e => e.stopPropagation()}>
            <div className="m-handle"/>
            <div className="policy-title">서비스 이용약관</div>
            <div className="policy-content">
              <p><strong>제1조 (목적)</strong><br/>본 약관은 한국농업기술진흥원이 제공하는 KOAT CarPool 서비스의 이용조건 및 절차에 관한 사항을 규정합니다.</p>
              <p><strong>제2조 (서비스 이용 대상)</strong><br/>본 서비스는 한국농업기술진흥원 재직 임직원에 한하여 이용 가능합니다. 퇴직 또는 계약 종료 시 계정이 비활성화됩니다.</p>
              <p><strong>제3조 (이용자의 의무)</strong><br/>이용자는 카풀 등록 및 매칭 과정에서 허위 정보를 제공하지 않아야 하며, 다른 이용자에게 불쾌감을 주는 행위를 하여서는 아니 됩니다.</p>
              <p><strong>제4조 (면책조항)</strong><br/>카풀 이용 중 발생하는 사고에 대해 기관은 법적 책임을 지지 않습니다. 이용자 간 자율적 합의에 의해 카풀이 운영됩니다.</p>
            </div>
            <button className="auth-btn" style={{marginTop:8}} onClick={() => { setRTerms(true); setShowTermsModal(false) }}>동의하고 닫기</button>
          </div>
        </div>
      )}

      {/* 개인정보 처리방침 모달 */}
      {showPrivacyModal && (
        <div className="overlay" onClick={() => setShowPrivacyModal(false)}>
          <div className="modal policy-modal" onClick={e => e.stopPropagation()}>
            <div className="m-handle"/>
            <div className="policy-title">개인정보 수집·이용 동의</div>
            <div className="policy-content">
              <p><strong>수집 항목</strong><br/>이름, 소속 부서, 거주 지역, 이메일 주소, 출퇴근 경로 정보</p>
              <p><strong>수집·이용 목적</strong><br/>사내 카풀 매칭 서비스 제공, 매칭 결과 안내, 부적절한 이용 방지</p>
              <p><strong>보유 및 이용 기간</strong><br/>재직 기간 동안 보유하며, 퇴직 후 30일 이내에 파기합니다.</p>
              <p><strong>제3자 제공</strong><br/>수집된 개인정보는 카풀 매칭 상대방(이름, 부서, 출발지)에게만 제공되며, 외부에 제공되지 않습니다.</p>
              <p><strong>동의 거부 권리</strong><br/>개인정보 수집·이용에 동의하지 않을 경우 서비스 이용이 제한됩니다.</p>
            </div>
            <button className="auth-btn green-btn" style={{marginTop:8}} onClick={() => { setRPrivacy(true); setShowPrivacyModal(false) }}>동의하고 닫기</button>
          </div>
        </div>
      )}

      <div className={`toast${toastVis?' show':''}`}>{toastMsg}</div>
    </div>
  )

  /* ══ 카드 컴포넌트 ══ */
  function LCard({ l, onDetail }: { l: Listing; onDetail: () => void }) {
    const isMe = l.user_id === uid
    const isPawed = pawedIds.has(l.id)
    return (
      <div className={`lcard ${l.type}${l.matched?' matched':''}${isMe?' mine':''}`} onClick={onDetail}>
        <div className="lc-head">
          <div className={`lc-av ${l.type}`}>{l.avatar}</div>
          <div style={{flex:1}}>
            <div className="lc-name">
              {l.name}
              {isMe
                ? <span style={{fontSize:11,color:'var(--blue)',fontWeight:600}}>(나)</span>
                : <span style={{fontSize:12,color:'var(--gray-400)'}}>✅</span>}
              {l.dept === profile?.dept && <span className="badge amber">같은 부서</span>}
            </div>
            <div className="lc-sub">{l.dept}{!isMe && ` · ★${l.rating}`}</div>
          </div>
          {!isMe && (
            <button className={`paw-btn${isPawed?' pawed':''}`}
              onClick={e => togglePaw(e, l)} title={isPawed ? '찜 해제' : '찜하기'}>
              🐾
            </button>
          )}
          <span className={`badge ${l.type==='driver'?'blue':'green'}`}>
            {l.type==='driver'?'드라이버':'동승자'}
          </span>
        </div>

        <div className="route-box">
          <div className="ri">
            <div className="rdot s"/>
            <div className="rtxt">{l.from_loc}{l.via_loc && ` → ${l.via_loc}`}</div>
          </div>
          <div className="rline"/>
          <div className="ri">
            <div className="rdot e"/>
            <div className="rtxt">{DEST} ({l.direction})</div>
          </div>
        </div>

        {/* 일정 유형별 표시 */}
        {l.schedule_type === 'single' ? (
          <div className="schedule-single-row">
            <div className="date-chip-lg">
              <span className="sch-icon">📅</span>
              <span className="sch-date">{fmtDate(l.ride_date ?? '')}</span>
              <span className="sch-badge-s">개별</span>
            </div>
            <div className="chip">⏰ {l.depart_time.slice(0,5)}</div>
          </div>
        ) : l.schedule_type === 'repeat' ? (
          <div className="schedule-repeat-row">
            <div className="repeat-label-row">
              <span className="sch-icon-r">🔄</span>
              <span className="sch-badge-r">정기반복</span>
              {l.repeat_end_date && <span className="sch-until">~ {fmtDate(l.repeat_end_date)}</span>}
            </div>
            <div className="days-row" style={{margin:0}}>
              {DAYS.map((d,i) => <div key={d} className={`dd ${l.days[i]?'on':'off'}`}>{d}</div>)}
            </div>
            <div className="chip" style={{marginTop:8}}>⏰ {l.depart_time.slice(0,5)}</div>
          </div>
        ) : l.schedule_type === '2bu' ? (
          <div className="schedule-rotation-row rotation-2bu">
            <div className="rotation-label-row">
              <span className="rot-icon">🔢</span>
              <span className="rot-badge rot-badge-2bu">2부제</span>
              <span className="rot-group-name">
                {l.rotation_group === 'odd' ? '홀수일 운행 (1·3·5·7·9일)' : '짝수일 운행 (2·4·6·8·10일)'}
              </span>
            </div>
            <div className="chip" style={{marginTop:6}}>⏰ {l.depart_time.slice(0,5)}</div>
          </div>
        ) : (
          <div className="schedule-rotation-row rotation-5bu">
            <div className="rotation-label-row">
              <span className="rot-icon">🔢</span>
              <span className="rot-badge rot-badge-5bu">5부제</span>
              <span className="rot-group-name">
                {{'1':'1·6조','2':'2·7조','3':'3·8조','4':'4·9조','5':'5·0조'}[l.rotation_group ?? ''] ?? l.rotation_group}
              </span>
            </div>
            <div className="chip" style={{marginTop:6}}>⏰ {l.depart_time.slice(0,5)}</div>
          </div>
        )}

        <div className="meta-row" style={{marginTop:8}}>
          {l.type==='driver'
            ? <><div className="chip">👥 {l.seats}석</div><div className="chip">💰 {l.cost?.toLocaleString()}원</div></>
            : <><div className="chip">👤 {l.people}명</div><div className="chip">💰 최대 {l.budget?.toLocaleString()}원</div></>}
          {!isMe && <div className="chip">🎯 {l.mp ?? calcMp(l, profile)}%</div>}
        </div>

        {l.tags.length > 0 && (
          <div className="tags-row">{l.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
        )}

        <button className={btnCls(l)} onClick={e => { e.stopPropagation(); if (!isMe) handleMatch(l) }}>
          {btnTxt(l)}
        </button>
      </div>
    )
  }

  /* ══ 메인 앱 ══ */
  return (
    <div className="app">
      <div className={`toast${toastVis?' show':''}`}>{toastMsg}</div>

      {/* ── SIDE NAV (desktop) ── */}
      <nav className="side-nav">
        <div className="side-logo">
          <div className="side-logo-mark">🌾</div>
          <div>
            <div className="side-logo-title">KOAT CarPool</div>
            <div className="side-logo-sub">사내 카풀 매칭</div>
          </div>
        </div>
        <div className="side-nav-items">
          {([
            { id:'home' as const, icon:'🏠', label:'홈', badge:0 },
            { id:'board' as const, icon:'📋', label:'매칭보드', badge:0 },
            { id:'paw' as const, icon:'🐾', label:'찜한 카풀', badge: pawedIds.size },
            { id:'my' as const, icon:'👤', label:'내 카풀', badge: reqs.length },
          ]).map(item => (
            <button key={item.id} className={`side-nav-item${tab===item.id?' active':''}`}
              onClick={() => setTab(item.id)}>
              <span className="side-nav-icon">{item.icon}</span>
              <span className="side-nav-label">{item.label}</span>
              {item.badge > 0 && <span className="side-nav-badge">{item.badge}</span>}
            </button>
          ))}
        </div>
        <div className="side-profile">
          <div className="side-profile-av">{profile.avatar}</div>
          <div style={{flex:1,minWidth:0}}>
            <div className="side-profile-name">{profile.name}</div>
            <div className="side-profile-dept">{profile.dept}</div>
          </div>
          <button className="side-logout-btn" onClick={handleSignOut} title="로그아웃">🚪</button>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <div className="main-content">

      {/* ── HOME ── */}
      <div style={{display:tab==='home'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header">
          <div className="header-row">
            <div className="header-logo">
              <div className="header-logo-mark">🌾</div>
              <div>
                <div className="header-title">KOAT CarPool</div>
                <div className="header-subtitle">사내 카풀 매칭</div>
              </div>
            </div>
            <div className="header-right">
              <button className="header-btn" onClick={() => setTab('my')}>👤</button>
            </div>
          </div>
        </div>

        <div className="screen">
          <div className="banner">
            <div className="banner-car">🚗</div>
            <div className="banner-tag">🌾 KOAT 임직원 전용</div>
            <div className="banner-name">{profile.name}님, 안녕하세요</div>
            <div className="banner-msg">오늘도 함께<br/>출퇴근해요 🙌</div>
            <div className="today-box">
              <div>
                <div className="today-label">지금 매칭 가능한 동료</div>
                <div className="today-val">
                  <span style={{color:'#93C5FD',fontWeight:800}}>{availCnt}</span>
                  <span style={{fontWeight:500,fontSize:13}}> 명</span>
                </div>
              </div>
              <div className="today-pills">
                <div className="pill">{profile.dept}</div>
                <div className="pill">익산 ↔ {DEST}</div>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-num" style={{color:'var(--blue)'}}>{driverCnt}</div>
                <div className="stat-lbl">🚗 드라이버</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{color:'var(--green)'}}>{passCnt}</div>
                <div className="stat-lbl">🙋 동승자</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{color:'var(--amber)'}}>{matchedCnt}</div>
                <div className="stat-lbl">✅ 매칭완료</div>
              </div>
            </div>
          </div>

          <div className="divider"/>

          <div className="section">
            <div className="sec-title">카풀 등록</div>
            <div className="quick-row">
              <button className="quick-card" onClick={() => openForm('driver')}>
                <div className="qc-bar" style={{background:'linear-gradient(90deg,#1D4ED8,#60A5FA)'}}/>
                <span className="qc-icon">🚗</span>
                <div className="qc-label">드라이버 등록</div>
                <div className="qc-sub">동승자 모집하기</div>
              </button>
              <button className="quick-card" onClick={() => openForm('passenger')}>
                <div className="qc-bar" style={{background:'linear-gradient(90deg,#047857,#34D399)'}}/>
                <span className="qc-icon">🙋</span>
                <div className="qc-label">동승자 등록</div>
                <div className="qc-sub">드라이버 찾기</div>
              </button>
            </div>
          </div>

          <div className="divider"/>

          <div className="section">
            <div className="sec-title">
              추천 동료 카풀
              <button className="sec-more" onClick={() => setTab('board')}>전체보기 →</button>
            </div>
            {topSuggest.length === 0
              ? <div style={{textAlign:'center',padding:'24px 0',color:'var(--gray-400)',fontSize:13}}>
                  매칭 가능한 동료가 없어요<br/>먼저 카풀을 등록해 보세요!
                </div>
              : <div className="sug-list">
                  {topSuggest.map(l => (
                    <div key={l.id} className="sug-card" onClick={() => setDetail(l)}>
                      <div className={`sug-av ${l.type}`}>{l.avatar}</div>
                      <div className="sug-info">
                        <div className="sug-name">
                          {l.name}
                          <span className={`badge ${l.type==='driver'?'blue':'green'}`}>
                            {l.type==='driver'?'드라이버':'동승자'}
                          </span>
                          {l.dept === profile.dept && <span className="badge amber">같은 부서</span>}
                        </div>
                        <div className="sug-dept">{l.dept}</div>
                        <div className="sug-route">
                          📅 {fmtDate(l.ride_date ?? '')} · ⏰ {l.depart_time.slice(0,5)} · 📍 {l.from_loc}
                        </div>
                      </div>
                      <div className="sug-right">
                        <div className="match-pct">{l.mp ?? calcMp(l, profile)}%</div>
                        <div className="match-lbl">매칭률</div>
                      </div>
                    </div>
                  ))}
                </div>}
          </div>
        </div>
      </div>

      {/* ── BOARD ── */}
      <div style={{display:tab==='board'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header">
          <div className="header-row">
            <div>
              <div className="header-title">매칭 보드</div>
              <div className="header-sub">KOAT 사내 카풀 목록</div>
            </div>
          </div>
        </div>
        <div style={{flex:1,overflow:'auto',paddingBottom:84,scrollbarWidth:'none'}}>
          <div className="filter-bar">
            {([['all','전체'],['driver','🚗 드라이버'],['passenger','🙋 동승자'],['dept','🏢 같은 부서'],['near','📍 근처 출발']] as [string,string][])
              .map(([f,label]) => (
                <button key={f} className={`filter-btn${filter===f?' active':''}`} onClick={() => setFilter(f)}>{label}</button>
              ))}
          </div>
          <div className="card-list" style={{opacity:loading?0.7:1,transition:'opacity .2s'}}>
            {listings.length === 0 && !loading
              ? <div className="empty">
                  <div className="empty-icon">🔍</div>
                  <div className="empty-title">조건에 맞는 카풀이 없어요</div>
                  <div className="empty-desc">필터를 변경하거나<br/>직접 등록해 보세요</div>
                </div>
              : listings.map(l => <LCard key={l.id} l={l} onDetail={() => setDetail(l)}/>)}
          </div>
        </div>
      </div>

      {/* ── MY ── */}
      <div style={{display:tab==='my'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header">
          <div className="header-row">
            <div>
              <div className="header-title">내 카풀</div>
              <div className="header-sub">프로필 · 그룹 · 요청</div>
            </div>
            <button className="header-logout" onClick={handleSignOut} title="로그아웃">🚪</button>
          </div>
        </div>
        <div style={{flex:1,overflow:'auto',paddingBottom:84,scrollbarWidth:'none'}}>
          <div className="profile-banner">
            <div className="pb-top">
              <div className="pb-emoji">{profile.avatar}</div>
              <div>
                <div className="pb-name">{profile.name}</div>
                <div className="pb-meta">{profile.dept} · {profile.home_area}</div>
                <div className="pb-cert">✅ KOAT 임직원 인증</div>
              </div>
            </div>
            <div className="pb-stats">
              <div className="pb-stat">
                <div className="pb-stat-num">{profile.trips}</div>
                <div className="pb-stat-lbl">탑승 횟수</div>
              </div>
              <div className="pb-stat">
                <div className="pb-stat-num">{profile.rating.toFixed(1)}</div>
                <div className="pb-stat-lbl">나의 평점</div>
              </div>
              <div className="pb-stat" style={{cursor:'pointer'}} onClick={() => setTab('paw')}>
                <div className="pb-stat-num" style={{color:'#F59E0B'}}>{pawedIds.size}</div>
                <div className="pb-stat-lbl">🐾 찜한 카풀</div>
              </div>
            </div>
          </div>

          {myGroup
            ? <div className="group-card">
                <div className="group-head">
                  <div className="group-title">🚗 나의 카풀 그룹</div>
                  <span className="badge blue">정기 카풀</span>
                </div>
                {myGroup.map((m, i) => (
                  <div key={i} className="g-member">
                    <div className="g-av">{m.avatar}</div>
                    <div>
                      <div className="g-name">{m.name}</div>
                      <div className="g-sub">{m.dept} · {m.role}</div>
                    </div>
                    <div style={{marginLeft:'auto'}}>
                      <span className={`badge ${m.role==='드라이버'?'blue':'green'}`}>{m.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            : <div style={{margin:'14px 20px 0'}}>
                <div className="info-bar">🤝 매칭이 완료되면 정기 카풀 그룹이 생겨요</div>
              </div>}

          <div className="section" style={{paddingTop:16}}>
            <div className="sec-title">
              받은 매칭 요청
              {reqs.length > 0 && <span className="badge red" style={{marginLeft:6}}>{reqs.length}</span>}
            </div>
            {reqs.length === 0
              ? <p style={{fontSize:13,color:'var(--gray-400)',marginBottom:16,lineHeight:1.7}}>받은 요청이 없어요</p>
              : reqs.map(r => (
                  <div key={r.id} className="notif-card">
                    <div className="notif-head">
                      <div className="notif-av">🧑‍💼</div>
                      <div>
                        <div className="notif-name">{r.requester_name} ✅</div>
                        <div className="notif-sub">
                          {r.requester_dept} · {new Date(r.created_at).toLocaleTimeString('ko', {hour:'2-digit',minute:'2-digit'})} 요청
                        </div>
                      </div>
                    </div>
                    <div className="notif-btns">
                      <button className="btn-ok" onClick={() => acceptMatch(r)}>수락하기</button>
                      <button className="btn-no" onClick={() => declineMatch(r)}>거절</button>
                    </div>
                  </div>
                ))}

            <div className="sec-title" style={{marginTop:4}}>내가 등록한 카풀</div>
            {myListings.length === 0
              ? <div className="empty" style={{padding:'24px 0'}}>
                  <div className="empty-icon">🗒️</div>
                  <div className="empty-title">등록한 카풀이 없어요</div>
                  <div className="empty-desc">홈에서 드라이버 또는<br/>동승자로 등록해 보세요</div>
                </div>
              : <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {myListings.map(l => (
                    <div key={l.id} className={`lcard ${l.type} mine`}>
                      <div className="lc-head">
                        <div className={`lc-av ${l.type}`}>{l.avatar}</div>
                        <div style={{flex:1}}>
                          <div className="lc-name">
                            {l.name}
                            <span style={{fontSize:11,color:'var(--blue)',fontWeight:600}}>(나)</span>
                          </div>
                          <div className="lc-sub">{fmtDate(l.ride_date ?? '')} · {l.depart_time.slice(0,5)} · {l.direction}</div>
                        </div>
                        {l.matched
                          ? <span className="badge green">매칭완료</span>
                          : <span className={`badge ${l.type==='driver'?'blue':'green'}`}>{l.type==='driver'?'드라이버':'동승자'}</span>}
                      </div>
                      <div className="route-box">
                        <div className="ri"><div className="rdot s"/><div className="rtxt">{l.from_loc}</div></div>
                        <div className="rline"/>
                        <div className="ri"><div className="rdot e"/><div className="rtxt">{DEST}</div></div>
                      </div>
                      <div className="days-row">
                        {DAYS.map((d,i) => <div key={d} className={`dd ${l.days[i]?'on':'off'}`}>{d}</div>)}
                      </div>
                    </div>
                  ))}
                </div>}
          </div>
        </div>
      </div>

      {/* ── PAW 탭 ── */}
      <div style={{display:tab==='paw'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header">
          <div className="header-row">
            <div>
              <div className="header-title">찜한 카풀 🐾</div>
              <div className="header-sub">관심 있는 카풀 목록</div>
            </div>
          </div>
        </div>
        <div style={{flex:1,overflow:'auto',paddingBottom:84,scrollbarWidth:'none' as const}}>
          <div className="card-list">
            {pawedListings.length === 0
              ? <div className="empty">
                  <div className="empty-icon">🐾</div>
                  <div className="empty-title">찜한 카풀이 없어요</div>
                  <div className="empty-desc">매칭보드에서 🐾 버튼으로<br/>관심 카풀을 저장해 보세요</div>
                </div>
              : pawedListings.map(l => <LCard key={l.id} l={l} onDetail={() => setDetail(l)}/>)}
          </div>
        </div>
      </div>

      </div>{/* ── end main-content ── */}

      {/* ── BOTTOM NAV ── */}
      <nav className="bottom-nav">
        <button className={`nav-item${tab==='home'?' active':''}`} onClick={() => setTab('home')}>
          <span className="nav-icon">🏠</span><span className="nav-label">홈</span>
        </button>
        <button className={`nav-item${tab==='board'?' active':''}`} onClick={() => setTab('board')}>
          <span className="nav-icon">📋</span><span className="nav-label">매칭보드</span>
        </button>
        <button className={`nav-item${tab==='paw'?' active':''}`} onClick={() => setTab('paw')}>
          <div className={`nav-dot${pawedIds.size>0?' show':''}`} style={{background:'#F59E0B'}}/>
          <span className="nav-icon">🐾</span><span className="nav-label">찜</span>
        </button>
        <button className={`nav-item${tab==='my'?' active':''}`} onClick={() => setTab('my')}>
          <div className={`nav-dot${reqs.length>0?' show':''}`}/>
          <span className="nav-icon">👤</span><span className="nav-label">내 카풀</span>
        </button>
      </nav>

      {/* ── 등록 폼 모달 ── */}
      {showForm && (
        <div className="overlay" onClick={() => setShowForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="m-handle"/>

            {/* 헤더 */}
            <div className="form-header">
              <div className="form-header-icon" style={{background: showForm==='driver'?'var(--blue-soft)':'var(--green-soft)', border: `1.5px solid ${showForm==='driver'?'var(--blue-mid)':'#A7F3D0'}`}}>
                {showForm==='driver' ? '🚗' : '🙋'}
              </div>
              <div>
                <div className="form-header-title">{showForm==='driver' ? '드라이버 등록' : '동승자 등록'}</div>
                <div className="form-header-sub">{profile.name} · {profile.dept}</div>
              </div>
            </div>

            {/* ★ 일정 유형 선택 — 드라이버 4종 / 동승자 개별 고정 ★ */}
            {showForm === 'driver' ? (
              <>
                {/* 드라이버: 2×2 그리드 */}
                <div className="sch-type-grid">
                  {([
                    { id:'single', icon:'📅', label:'개별 일정', desc:'특정 날짜 1회', cls:'sch-active' },
                    { id:'repeat', icon:'🔄', label:'반복 일정', desc:'요일 정기 운행', cls:'sch-active sch-active-r' },
                    { id:'2bu',    icon:'🔢', label:'2부제',    desc:'홀수/짝수일 교대', cls:'sch-active sch-active-2bu' },
                    { id:'5bu',    icon:'🔢', label:'5부제',    desc:'번호판 끝자리별', cls:'sch-active sch-active-5bu' },
                  ] as const).map(btn => (
                    <button
                      key={btn.id}
                      className={`sch-type-btn${fScheduleType===btn.id ? ' '+btn.cls : ''}`}
                      onClick={() => { setFScheduleType(btn.id); setFRotationGroup(''); }}
                    >
                      <span className="sch-type-icon">{btn.icon}</span>
                      <span className="sch-type-label">{btn.label}</span>
                      <span className="sch-type-desc">{btn.desc}</span>
                    </button>
                  ))}
                </div>

                {/* 개별 패널 */}
                {fScheduleType === 'single' && (
                  <div className="sch-panel sch-panel-single">
                    <div className="sch-panel-header"><span>📅</span> 운행 날짜 선택</div>
                    <input className="fi date-input-lg" type="date" value={fDate} min={today()} onChange={e=>setFDate(e.target.value)}/>
                    {fDate && <div className="date-preview">{fmtDate(fDate)} 하루만 운행해요</div>}
                  </div>
                )}

                {/* 반복 패널 */}
                {fScheduleType === 'repeat' && (
                  <div className="sch-panel sch-panel-repeat">
                    <div className="sch-panel-header"><span>🔄</span> 운행 요일 선택</div>
                    <div className="day-sel-lg">
                      {DAYS.map((d,i) => (
                        <button key={d} className={`day-btn-lg${fDays[i]?' day-on':''}`}
                          onClick={()=>setFDays(prev=>prev.map((v,j)=>j===i?(v?0:1):v))}>
                          <span className="day-name">{d}</span>
                          <span className="day-full">{['월요일','화요일','수요일','목요일','금요일'][i]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="fg" style={{marginTop:14,marginBottom:0}}>
                      <label>반복 종료일 <span className="opt">미설정 시 계속 반복</span></label>
                      <input className="fi" type="date" value={fRepeatEnd} min={today()} onChange={e=>setFRepeatEnd(e.target.value)}/>
                    </div>
                    {fDays.some(Boolean) && (
                      <div className="repeat-preview">
                        매주 {DAYS.filter((_,i)=>fDays[i]).join('·')}요일 운행
                        {fRepeatEnd?` · ${fmtDate(fRepeatEnd)} 까지`:' · 종료일 미정'}
                      </div>
                    )}
                  </div>
                )}

                {/* 2부제 패널 */}
                {fScheduleType === '2bu' && (
                  <div className="sch-panel sch-panel-2bu">
                    <div className="sch-panel-header"><span>🔢</span> 운행 그룹 선택 (2부제)</div>
                    <div className="rotation-btn-wrap">
                      {([
                        { v:'odd',  label:'홀수일', sub:'1·3·5·7·9일', emoji:'①' },
                        { v:'even', label:'짝수일', sub:'2·4·6·8·10일', emoji:'②' },
                      ]).map(g => (
                        <button key={g.v} className={`rotation-btn${fRotationGroup===g.v?' rot-on-2bu':''}`}
                          onClick={()=>setFRotationGroup(g.v)}>
                          <span className="rot-btn-emoji">{g.emoji}</span>
                          <span className="rot-btn-label">{g.label}</span>
                          <span className="rot-btn-sub">{g.sub}</span>
                        </button>
                      ))}
                    </div>
                    {fRotationGroup && (
                      <div className="rotation-preview rotation-preview-2bu">
                        {fRotationGroup==='odd'?'홀수일':'짝수일'} 운행 · 매달 교대
                      </div>
                    )}
                  </div>
                )}

                {/* 5부제 패널 */}
                {fScheduleType === '5bu' && (
                  <div className="sch-panel sch-panel-5bu">
                    <div className="sch-panel-header"><span>🔢</span> 운행 그룹 선택 (5부제)</div>
                    <div className="rotation-btn-wrap rotation-5-wrap">
                      {([
                        { v:'1', label:'1·6조', sub:'끝자리 1 또는 6' },
                        { v:'2', label:'2·7조', sub:'끝자리 2 또는 7' },
                        { v:'3', label:'3·8조', sub:'끝자리 3 또는 8' },
                        { v:'4', label:'4·9조', sub:'끝자리 4 또는 9' },
                        { v:'5', label:'5·0조', sub:'끝자리 5 또는 0' },
                      ]).map(g => (
                        <button key={g.v} className={`rotation-btn rotation-btn-5${fRotationGroup===g.v?' rot-on-5bu':''}`}
                          onClick={()=>setFRotationGroup(g.v)}>
                          <span className="rot-btn-label">{g.label}</span>
                          <span className="rot-btn-sub">{g.sub}</span>
                        </button>
                      ))}
                    </div>
                    {fRotationGroup && (
                      <div className="rotation-preview rotation-preview-5bu">
                        {({'1':'1·6조','2':'2·7조','3':'3·8조','4':'4·9조','5':'5·0조'}[fRotationGroup])} 운행
                        · 번호판 끝자리 기준
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* 동승자: 개별 일정 고정 */
              <div className="sch-panel sch-panel-single">
                <div className="sch-panel-header"><span>📅</span> 탑승 날짜 선택</div>
                <input className="fi date-input-lg" type="date" value={fDate} min={today()} onChange={e=>setFDate(e.target.value)}/>
                {fDate && <div className="date-preview">{fmtDate(fDate)} 탑승 예정</div>}
              </div>
            )}

            {/* 공통 필드 */}
            <div className="form-divider"/>

            <div className="frow" style={{marginBottom:14}}>
              <div className="fg" style={{margin:0}}>
                <label>운행 방향</label>
                <select className="fs" value={fDir} onChange={e => setFDir(e.target.value)}>
                  <option>출근</option>
                  <option>퇴근</option>
                  <option>출·퇴근 모두</option>
                </select>
              </div>
              <div className="fg" style={{margin:0}}>
                <label>출발 시간</label>
                <input className="fi" type="time" value={fTime} onChange={e => setFTime(e.target.value)}/>
              </div>
            </div>

            <div className="fg">
              <label>출발지</label>
              <input className="fi" value={fFrom} onChange={e => setFFrom(e.target.value)} placeholder="예) 익산역"/>
            </div>

            <div className="fg">
              <label>경유지 <span className="opt">(선택)</span></label>
              <input className="fi" value={fVia} onChange={e => setFVia(e.target.value)} placeholder="예) 신동 주공 앞"/>
            </div>

            {showForm === 'driver'
              ? <div className="frow" style={{marginBottom:14}}>
                  <div className="fg" style={{margin:0}}>
                    <label>탑승 가능 인원</label>
                    <input className="fi" type="number" min={1} max={4} value={fSeats} onChange={e => setFSeats(+e.target.value)}/>
                  </div>
                  <div className="fg" style={{margin:0}}>
                    <label>1인 분담금 (원)</label>
                    <input className="fi" type="number" step={500} value={fCost} onChange={e => setFCost(+e.target.value)}/>
                  </div>
                </div>
              : <div className="frow" style={{marginBottom:14}}>
                  <div className="fg" style={{margin:0}}>
                    <label>탑승 인원</label>
                    <input className="fi" type="number" min={1} max={4} value={fPeople} onChange={e => setFPeople(+e.target.value)}/>
                  </div>
                  <div className="fg" style={{margin:0}}>
                    <label>최대 예산 (원)</label>
                    <input className="fi" type="number" step={500} value={fBudget} onChange={e => setFBudget(+e.target.value)}/>
                  </div>
                </div>}

            <div className="fg">
              <label>태그</label>
              <div className="tag-sel">
                {TAGS.map(t => (
                  <button key={t} className={`tag-opt${fTags.includes(t)?' on':''}`}
                    onClick={() => setFTags(ts => ts.includes(t) ? ts.filter(x => x!==t) : [...ts, t])}>{t}
                  </button>
                ))}
              </div>
            </div>

            <button className="sub-btn"
              style={{background: showForm==='driver' ? 'linear-gradient(135deg,#1D4ED8,#2563EB)' : 'linear-gradient(135deg,#047857,#059669)'}}
              onClick={registerListing} disabled={fSubmitting}>
              {fSubmitting ? <><div className="spinner"/>등록 중...</> : '매칭보드에 등록하기'}
            </button>
          </div>
        </div>
      )}

      {/* ── 상세 모달 ── */}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="m-handle"/>

            <div className="lc-head" style={{marginBottom:18}}>
              <div className={`lc-av ${detail.type}`} style={{width:54,height:54,fontSize:26,borderRadius:16}}>
                {detail.avatar}
              </div>
              <div style={{flex:1}}>
                <div className="lc-name" style={{fontSize:17}}>
                  {detail.name}
                  {detail.user_id===uid
                    ? <span style={{fontSize:11,color:'var(--blue)',fontWeight:600,marginLeft:3}}>(나)</span>
                    : <span style={{fontSize:12,color:'var(--gray-400)'}}>✅</span>}
                  {detail.dept===profile.dept && <span className="badge amber">같은 부서</span>}
                </div>
                <div className="lc-sub" style={{marginTop:3}}>{detail.dept}</div>
                {detail.user_id !== uid && (
                  <div style={{fontSize:12,color:'var(--amber)',marginTop:3}}>
                    {'★'.repeat(Math.floor(detail.rating))}
                    <span style={{color:'var(--gray-700)',fontWeight:600,marginLeft:4}}>
                      {detail.rating} · 후기 {detail.review_cnt}개
                    </span>
                  </div>
                )}
              </div>
              <span className={`badge ${detail.type==='driver'?'blue':'green'}`}>
                {detail.type==='driver'?'드라이버':'동승자'}
              </span>
            </div>

            {/* 경로 */}
            <div style={{background:'var(--gray-50)',borderRadius:14,padding:16,marginBottom:14,border:'1px solid var(--gray-100)'}}>
              <div style={{fontSize:12,color:'var(--gray-400)',fontWeight:600,marginBottom:10}}>이동 경로</div>
              <div className="ri" style={{marginBottom:8}}>
                <div className="rdot s"/>
                <div className="rtxt" style={{fontSize:14,fontWeight:600}}>{detail.from_loc}</div>
              </div>
              {detail.via_loc && (
                <>
                  <div style={{width:1,height:10,background:'var(--gray-200)',margin:'0 0 8px 3px'}}/>
                  <div className="ri" style={{marginBottom:8}}>
                    <div className="rdot v"/>
                    <div className="rtxt" style={{fontSize:13}}>경유 {detail.via_loc}</div>
                  </div>
                </>
              )}
              <div style={{width:1,height:10,background:'var(--gray-200)',margin:'0 0 8px 3px'}}/>
              <div className="ri">
                <div className="rdot e"/>
                <div className="rtxt" style={{fontSize:14,fontWeight:600}}>{DEST} ({detail.direction})</div>
              </div>
            </div>

            {/* 일정 유형 뱃지 */}
            <div style={{marginBottom:14}}>
              {detail.schedule_type === 'single' ? (
                <div className="detail-sch-single">
                  <span style={{fontSize:20}}>📅</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--blue)'}}>개별 일정 · {fmtDate(detail.ride_date ?? '')}</div>
                    <div style={{fontSize:12,color:'var(--gray-400)',marginTop:2}}>특정 날짜 1회 운행</div>
                  </div>
                </div>
              ) : detail.schedule_type === 'repeat' ? (
                <div className="detail-sch-repeat">
                  <div className="detail-sch-repeat-head">
                    <span style={{fontSize:20}}>🔄</span>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:'#7C3AED'}}>정기 반복 일정</div>
                      <div style={{fontSize:12,color:'var(--gray-400)',marginTop:2}}>
                        매주 {DAYS.filter((_,i) => detail.days[i]).join('·')}요일
                        {detail.repeat_end_date ? ` · ${fmtDate(detail.repeat_end_date)} 까지` : ' · 종료일 미정'}
                      </div>
                    </div>
                  </div>
                  <div className="days-row" style={{margin:0}}>
                    {DAYS.map((d,i) => <div key={d} className={`dd ${detail.days[i]?'on':'off'}`}>{d}</div>)}
                  </div>
                </div>
              ) : detail.schedule_type === '2bu' ? (
                <div className="detail-sch-2bu">
                  <span style={{fontSize:20}}>🔢</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'#D97706'}}>2부제 운행</div>
                    <div style={{fontSize:13,fontWeight:600,color:'#92400E',marginTop:3}}>
                      {detail.rotation_group === 'odd' ? '홀수일 (1·3·5·7·9일)' : '짝수일 (2·4·6·8·10일)'}
                    </div>
                    <div style={{fontSize:11,color:'var(--gray-400)',marginTop:2}}>날짜 끝자리 기준 교대 운행</div>
                  </div>
                </div>
              ) : (
                <div className="detail-sch-5bu">
                  <span style={{fontSize:20}}>🔢</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'#0F766E'}}>5부제 운행</div>
                    <div style={{fontSize:13,fontWeight:600,color:'#134E4A',marginTop:3}}>
                      {({'1':'1·6조','2':'2·7조','3':'3·8조','4':'4·9조','5':'5·0조'}[detail.rotation_group ?? ''] ?? detail.rotation_group)}
                      &nbsp;· 번호판 끝자리 기준
                    </div>
                    <div style={{fontSize:11,color:'var(--gray-400)',marginTop:2}}>해당 끝자리 차량만 운행 가능</div>
                  </div>
                </div>
              )}
            </div>

            {/* 정보 그리드 */}
            <div className="dg">
              <div className="dc">
                <div className="dc-lbl">출발 시간</div>
                <div className="dc-val">{detail.depart_time.slice(0,5)}</div>
              </div>
              <div className="dc">
                <div className="dc-lbl">운행 방향</div>
                <div className="dc-val">{detail.direction}</div>
              </div>
              <div className="dc">
                <div className="dc-lbl">{detail.type==='driver'?'탑승가능':'탑승인원'}</div>
                <div className="dc-val">{detail.type==='driver' ? `${detail.seats}명` : `${detail.people}명`}</div>
              </div>
              <div className="dc">
                <div className="dc-lbl">{detail.type==='driver'?'분담금(1인)':'최대 예산'}</div>
                <div className="dc-val">
                  {detail.type==='driver' ? `${detail.cost?.toLocaleString()}원` : `${detail.budget?.toLocaleString()}원`}
                </div>
              </div>
            </div>

            {/* 태그 */}
            {detail.tags.length > 0 && (
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,color:'var(--gray-400)',fontWeight:600,marginBottom:8}}>태그</div>
                <div className="tags-row">{detail.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
              </div>
            )}

            {/* 매칭률 */}
            {detail.user_id !== uid && (
              <div className="mp-box">
                <span style={{fontSize:24}}>🎯</span>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--blue)'}}>
                    경로 매칭률 {detail.mp ?? calcMp(detail, profile)}%
                  </div>
                  <div style={{fontSize:11,color:'var(--blue)',opacity:.7,marginTop:2}}>
                    출발지 · 부서 · 요일 기준 자동 계산
                  </div>
                </div>
              </div>
            )}

            <button className={btnCls(detail)} onClick={() => {
              if (detail.user_id !== uid && !detail.matched && !sentIds.has(detail.id)) {
                handleMatch(detail); setDetail(null)
              }
            }}>
              {detail.user_id === uid ? '✏️ 내가 등록한 카풀이에요'
                : detail.matched ? '✅ 이미 매칭된 카풀이에요'
                : sentIds.has(detail.id) ? '⏳ 요청을 보냈어요'
                : detail.type === 'driver' ? '🚗 탑승 요청하기' : '🙋 동승 요청하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
