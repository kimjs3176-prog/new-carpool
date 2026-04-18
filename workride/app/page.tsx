'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  supabase, getListings, createListing, sendMatchRequest,
  setMatched, updateRequestStatus,
  type Listing, type MatchRequest,
} from '@/lib/supabase'

/* ─── 상수 ─── */
const DAYS = ['월','화','수','목','금']
const TAGS = ['비흡연','조용한 탑승','대화 OK','음악 OK','반려동물 NO','짐 없음','정시 탑승','에어컨 완비','여성 전용']
const ME = { name:'김진선', dept:'기술혁신팀', rank:'대리', home:'강남구 역삼동', avatar:'😊', trips:12, rating:4.9 }

/* ─── 매칭률 계산 ─── */
function calcMp(l: Listing): number {
  let score = 50
  if (l.from_loc.startsWith(ME.home.split(' ')[0])) score += 30
  if (l.dept === ME.dept) score += 15
  if (l.days.filter(Boolean).length >= 4) score += 5
  return Math.min(score, 99)
}

export default function Home() {
  const [tab, setTab]             = useState<'home'|'board'|'my'>('home')
  const [listings, setListings]   = useState<Listing[]>([])
  const [myListings, setMyListings] = useState<Listing[]>([])
  const [reqs, setReqs]           = useState<MatchRequest[]>([])
  const [sentIds, setSentIds]     = useState<Set<string>>(new Set())
  const [filter, setFilter]       = useState('all')
  const [loading, setLoading]     = useState(false)
  const [myGroup, setMyGroup]     = useState<{name:string,dept:string,avatar:string,role:string}[]|null>(null)
  const [showForm, setShowForm]   = useState<'driver'|'passenger'|null>(null)
  const [detail, setDetail]       = useState<Listing|null>(null)
  const [toastMsg, setToastMsg]   = useState('')
  const [toastVis, setToastVis]   = useState(false)

  /* form state */
  const [fName, setFName]     = useState(ME.name)
  const [fFrom, setFFrom]     = useState(ME.home)
  const [fVia, setFVia]       = useState('')
  const [fDir, setFDir]       = useState('출근')
  const [fTime, setFTime]     = useState('08:30')
  const [fSeats, setFSeats]   = useState(3)
  const [fCost, setFCost]     = useState(2000)
  const [fPeople, setFPeople] = useState(1)
  const [fBudget, setFBudget] = useState(2000)
  const [fDays, setFDays]     = useState([1,1,1,1,1])
  const [fTags, setFTags]     = useState<string[]>([])

  /* ─── 데이터 로드 ─── */
  const loadListings = useCallback(async () => {
    setLoading(true)
    try {
      const area = filter === 'near' ? ME.home.split(' ')[0] : undefined
      const dept = filter === 'dept' ? ME.dept : undefined
      const data = await getListings(filter, dept, area)
      setListings(data.map(l => ({ ...l, mp: calcMp(l) })))
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { loadListings() }, [loadListings])

  /* ─── Realtime 구독 ─── */
  useEffect(() => {
    const ch = supabase
      .channel('listings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => loadListings())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadListings])

  /* ─── 토스트 ─── */
  function toast(msg: string) {
    setToastMsg(msg); setToastVis(true)
    setTimeout(() => setToastVis(false), 2600)
  }

  /* ─── 통계 ─── */
  const driverCnt   = listings.filter(l => l.type === 'driver').length
  const passCnt     = listings.filter(l => l.type === 'passenger').length
  const matchedCnt  = listings.filter(l => l.matched).length
  const availCnt    = listings.filter(l => !l.matched).length
  const topSuggest  = [...listings].filter(l => !l.matched).sort((a,b) => (b.mp||0)-(a.mp||0)).slice(0,3)

  /* ─── 매칭 요청 보내기 ─── */
  async function handleMatch(l: Listing) {
    if (l.matched || sentIds.has(l.id)) return
    try {
      await sendMatchRequest({ listing_id: l.id, requester_name: ME.name, requester_dept: ME.dept })
      setSentIds(prev => new Set([...prev, l.id]))
      toast(`${l.name} ${l.rank}님에게 매칭 요청을 보냈어요 🚗`)
    } catch { toast('요청 전송에 실패했어요. 다시 시도해주세요.') }
  }

  /* ─── 요청 수락 ─── */
  async function acceptMatch(req: MatchRequest) {
    try {
      await updateRequestStatus(req.id, 'accepted')
      await setMatched(req.listing_id)
      const l = listings.find(x => x.id === req.listing_id)
      setMyGroup([
        { name: ME.name,       dept: ME.dept,       avatar: ME.avatar,   role: '동승자' },
        { name: req.requester_name, dept: req.requester_dept, avatar: '🧑‍💼', role: l?.type === 'driver' ? '드라이버' : '동승자' },
      ])
      setReqs(prev => prev.filter(r => r.id !== req.id))
      toast(`${req.requester_name}님과 매칭 완료! 사내 메신저로 연락처를 공유했어요 📱`)
      loadListings()
    } catch { toast('수락 처리에 실패했어요.') }
  }

  async function declineMatch(req: MatchRequest) {
    await updateRequestStatus(req.id, 'declined')
    setReqs(prev => prev.filter(r => r.id !== req.id))
    toast(`${req.requester_name}님의 요청을 거절했어요`)
  }

  /* ─── 등록 ─── */
  async function registerListing() {
    if (!fFrom.trim()) { toast('출발지를 입력해 주세요'); return }
    try {
      const newItem = await createListing({
        type: showForm!, name: fName, dept: ME.dept, rank: ME.rank, avatar: ME.avatar,
        from_loc: fFrom.trim(), via_loc: fVia.trim() || undefined,
        direction: fDir, depart_time: fTime,
        ...(showForm === 'driver' ? { seats: fSeats, cost: fCost } : { people: fPeople, budget: fBudget }),
        days: fDays, tags: fTags, rating: 5.0, review_cnt: 0, matched: false,
      })
      setMyListings(prev => [{ ...newItem, mp: 100 }, ...prev])
      setShowForm(null)
      toast('매칭보드에 등록됐어요! 🚀')
      loadListings()
    } catch { toast('등록에 실패했어요. 다시 시도해주세요.') }
  }

  function openForm(type: 'driver'|'passenger') {
    setShowForm(type); setFName(ME.name); setFFrom(ME.home); setFVia('')
    setFDir('출근'); setFTime('08:30'); setFSeats(3); setFCost(2000)
    setFPeople(1); setFBudget(2000); setFDays([1,1,1,1,1]); setFTags([])
  }

  function toggleDay(i: number) { setFDays(d => d.map((v,j) => j===i ? (v?0:1) : v)) }
  function toggleTag(t: string) { setFTags(ts => ts.includes(t) ? ts.filter(x=>x!==t) : [...ts, t]) }

  /* ─── 버튼 클래스 ─── */
  function btnCls(l: Listing) { return l.matched ? 'act-btn gray' : sentIds.has(l.id) ? 'act-btn gray' : l.type==='driver' ? 'act-btn blue' : 'act-btn green' }
  function btnTxt(l: Listing) { return l.matched ? '✅ 매칭완료' : sentIds.has(l.id) ? '⏳ 요청 전송됨' : l.type==='driver' ? '🚗 탑승 요청' : '🙋 동승 요청' }

  /* ─── 카드 렌더 ─── */
  function ListingCard({ l, onDetail }: { l: Listing, onDetail: () => void }) {
    return (
      <div className={`lcard ${l.type}${l.matched?' matched':''}`} onClick={onDetail}>
        <div className="lc-head">
          <div className={`lc-av ${l.type}`}>{l.avatar}</div>
          <div style={{flex:1}}>
            <div className="lc-name">
              {l.name} ✅
              {l.dept===ME.dept && <span className="badge orange">같은 부서</span>}
            </div>
            <div className="lc-sub">{l.dept} · {l.rank} · ★{l.rating} ({l.review_cnt})</div>
          </div>
          <span className={`badge ${l.type==='driver'?'blue':'green'}`}>{l.type==='driver'?'드라이버':'동승자'}</span>
        </div>
        <div className="route-box">
          <div className="ri"><div className="rdot s"/><div className="rtxt">{l.from_loc}{l.via_loc&&` → ${l.via_loc}`}</div></div>
          <div className="rline"/>
          <div className="ri"><div className="rdot e"/><div className="rtxt">본사 ({l.direction})</div></div>
        </div>
        <div className="meta-row">
          <div className="chip">⏰ {l.depart_time.slice(0,5)}</div>
          {l.type==='driver'
            ? <><div className="chip">👥 {l.seats}석</div><div className="chip">💰 {l.cost?.toLocaleString()}원</div></>
            : <><div className="chip">👤 {l.people}명</div><div className="chip">💰 최대 {l.budget?.toLocaleString()}원</div></>}
          <div className="chip">🎯 {l.mp??calcMp(l)}%</div>
        </div>
        <div className="days-row">{DAYS.map((d,i)=><div key={d} className={`dd ${l.days[i]?'on':'off'}`}>{d}</div>)}</div>
        {l.tags.length>0 && <div className="tags-row">{l.tags.map(t=><span key={t} className="tag">{t}</span>)}</div>}
        <button className={btnCls(l)} onClick={e=>{e.stopPropagation();handleMatch(l)}}>{btnTxt(l)}</button>
      </div>
    )
  }

  return (
    <div className="app">
      {/* TOAST */}
      <div className={`toast${toastVis?' show':''}`}>{toastMsg}</div>

      {/* HOME */}
      <div className={`tab-content screen${tab==='home'?' active':''}`} id="tab-home" style={{display:tab==='home'?'block':'none'}}>
        <div className="header">
          <div className="header-row">
            <div><div className="header-title">WorkRide 🚗</div><div className="header-sub">{ME.dept} · {ME.rank}</div></div>
            <button className="header-btn" onClick={()=>setTab('my')}>👤</button>
          </div>
        </div>
        <div className="banner">
          <div className="banner-name">{ME.name} {ME.rank}님</div>
          <div className="banner-msg">오늘도 함께 출근해요 🙌</div>
          <div className="today-box">
            <div>
              <div className="today-label">매칭 가능한 동료</div>
              <div className="today-val"><span style={{color:'#93C5FD'}}>{availCnt}</span>명이 기다리고 있어요</div>
            </div>
            <div className="today-pills"><div className="pill">월~금</div><div className="pill">출근</div></div>
          </div>
        </div>
        <div className="section">
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-num">{driverCnt}</div><div className="stat-lbl">드라이버</div></div>
            <div className="stat-card"><div className="stat-num">{passCnt}</div><div className="stat-lbl">동승자</div></div>
            <div className="stat-card"><div className="stat-num">{matchedCnt}</div><div className="stat-lbl">매칭완료</div></div>
          </div>
        </div>
        <div className="divider"/>
        <div className="section">
          <div className="sec-title">빠른 등록</div>
          <div className="quick-row">
            <button className="quick-card" onClick={()=>openForm('driver')}>
              <div className="qc-bar" style={{background:'var(--blue)'}}/>
              <span className="qc-icon">🚗</span><div className="qc-label">드라이버 등록</div><div className="qc-sub">동승자 모집하기</div>
            </button>
            <button className="quick-card" onClick={()=>openForm('passenger')}>
              <div className="qc-bar" style={{background:'var(--green)'}}/>
              <span className="qc-icon">🙋</span><div className="qc-label">동승자 등록</div><div className="qc-sub">드라이버 찾기</div>
            </button>
          </div>
        </div>
        <div className="divider"/>
        <div className="section">
          <div className="sec-title">
            추천 동료 카풀
            <button className="sec-more" onClick={()=>setTab('board')}>전체보기</button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {topSuggest.map(l => (
              <div key={l.id} className="sug-card" onClick={()=>setDetail(l)}>
                <div className="sug-av">{l.avatar}</div>
                <div className="sug-info">
                  <div className="sug-name">{l.name} <span className={`badge ${l.type==='driver'?'blue':'green'}`}>{l.type==='driver'?'드라이버':'동승자'}</span>{l.dept===ME.dept&&<span className="badge orange">같은 부서</span>}</div>
                  <div className="sug-dept">{l.dept} · {l.rank}</div>
                  <div className="sug-route">📍 {l.from_loc} → 본사 · {l.depart_time.slice(0,5)}</div>
                </div>
                <div className="sug-right"><div className="match-pct">{l.mp??calcMp(l)}%</div><div className="match-lbl">매칭률</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOARD */}
      <div style={{display:tab==='board'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header">
          <div className="header-row">
            <div><div className="header-title">매칭 보드</div><div className="header-sub">사내 카풀 전체 목록</div></div>
          </div>
        </div>
        <div style={{flex:1,overflow:'auto',paddingBottom:84,scrollbarWidth:'none'}}>
          <div className="filter-bar">
            {[['all','전체'],['driver','🚗 드라이버'],['passenger','🙋 동승자'],['dept','🏢 같은 부서'],['near','📍 근처 출발']].map(([f,label]) => (
              <button key={f} className={`filter-btn${filter===f?' active':''}`} onClick={()=>setFilter(f)}>{label}</button>
            ))}
          </div>
          <div className={`card-list${loading?' loading':''}`}>
            {listings.length === 0 && !loading
              ? <div className="empty"><div className="empty-icon">🔍</div><div className="empty-title">조건에 맞는 카풀이 없어요</div><div className="empty-desc">필터를 변경하거나<br/>직접 등록해 보세요</div></div>
              : listings.map(l => <ListingCard key={l.id} l={l} onDetail={()=>setDetail(l)}/>)}
          </div>
        </div>
      </div>

      {/* MY */}
      <div style={{display:tab==='my'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header">
          <div className="header-row">
            <div><div className="header-title">내 카풀</div><div className="header-sub">프로필 · 그룹 · 요청</div></div>
          </div>
        </div>
        <div style={{flex:1,overflow:'auto',paddingBottom:84,scrollbarWidth:'none'}}>
          <div className="profile-banner">
            <div className="pb-top">
              <div className="pb-emoji">{ME.avatar}</div>
              <div><div className="pb-name">{ME.name} {ME.rank}</div><div className="pb-meta">{ME.dept}</div><div className="pb-cert">✅ 사내 인증 완료</div></div>
            </div>
            <div className="pb-stats">
              <div className="pb-stat"><div className="pb-stat-num">{ME.trips}</div><div className="pb-stat-lbl">탑승 횟수</div></div>
              <div className="pb-stat"><div className="pb-stat-num">{ME.rating}</div><div className="pb-stat-lbl">나의 평점</div></div>
            </div>
          </div>

          {myGroup
            ? <div className="group-card">
                <div className="group-head"><div className="group-title">🚗 나의 카풀 그룹</div><span className="badge blue">정기 카풀</span></div>
                {myGroup.map((m,i) => (
                  <div key={i} className="g-member">
                    <div className="g-av">{m.avatar}</div>
                    <div><div className="g-name">{m.name}</div><div className="g-sub">{m.dept} · {m.role}</div></div>
                    <div style={{marginLeft:'auto'}}><span className={`badge ${m.role==='드라이버'?'blue':'green'}`}>{m.role}</span></div>
                  </div>
                ))}
              </div>
            : <div style={{margin:'14px 20px 0'}}><div className="info-bar">🤝 매칭이 완료되면 정기 카풀 그룹이 만들어져요</div></div>}

          <div className="section" style={{paddingTop:16}}>
            <div className="sec-title">받은 매칭 요청{reqs.length>0&&` ${reqs.length}건`}</div>
            {reqs.length===0
              ? <p style={{fontSize:13,color:'var(--gray-400)',marginBottom:16}}>받은 요청이 없어요</p>
              : reqs.map(r => (
                  <div key={r.id} className="notif-card">
                    <div className="notif-head">
                      <div className="notif-av">🧑‍💼</div>
                      <div><div className="notif-name">{r.requester_name} ✅</div><div className="notif-sub">{r.requester_dept} · 매칭 요청</div></div>
                    </div>
                    <div className="notif-btns">
                      <button className="btn-ok" onClick={()=>acceptMatch(r)}>수락하기</button>
                      <button className="btn-no" onClick={()=>declineMatch(r)}>거절</button>
                    </div>
                  </div>
                ))}
            <div className="sec-title" style={{marginTop:8}}>내가 등록한 카풀</div>
            {myListings.length===0
              ? <div className="empty" style={{padding:'28px 0'}}><div className="empty-icon">🗒️</div><div className="empty-title">등록한 카풀이 없어요</div><div className="empty-desc">홈에서 드라이버 또는<br/>동승자로 등록해 보세요</div></div>
              : myListings.map(l => (
                  <div key={l.id} className={`lcard ${l.type}`} style={{marginBottom:12}}>
                    <div className="lc-head">
                      <div className={`lc-av ${l.type}`}>{l.avatar}</div>
                      <div style={{flex:1}}>
                        <div className="lc-name">{l.name} <span style={{fontSize:11,color:'var(--blue)'}}>(나)</span></div>
                        <div className="lc-sub">{l.depart_time.slice(0,5)} · {DAYS.filter((_,i)=>l.days[i]).join('·')}</div>
                      </div>
                      <span className={`badge ${l.type==='driver'?'blue':'green'}`}>{l.type==='driver'?'드라이버':'동승자'}</span>
                    </div>
                    <div className="route-box">
                      <div className="ri"><div className="rdot s"/><div className="rtxt">{l.from_loc}</div></div>
                      <div className="rline"/>
                      <div className="ri"><div className="rdot e"/><div className="rtxt">본사 ({l.direction})</div></div>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </div>

      {/* NAV */}
      <nav className="bottom-nav">
        <button className={`nav-item${tab==='home'?' active':''}`} onClick={()=>setTab('home')}><span className="nav-icon">🏠</span><span className="nav-label">홈</span></button>
        <button className={`nav-item${tab==='board'?' active':''}`} onClick={()=>setTab('board')}><span className="nav-icon">📋</span><span className="nav-label">매칭보드</span></button>
        <button className={`nav-item${tab==='my'?' active':''}`} onClick={()=>setTab('my')}><div className={`nav-dot${reqs.length>0?' show':''}`}/><span className="nav-icon">👤</span><span className="nav-label">내 카풀</span></button>
      </nav>

      {/* FORM MODAL */}
      {showForm && (
        <div className="overlay" onClick={()=>setShowForm(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="m-handle"/>
            <div className="m-title">{showForm==='driver'?'🚗 드라이버 등록':'🙋 동승자 등록'}</div>
            <div className="frow" style={{marginBottom:16}}>
              <div className="fg" style={{margin:0}}><label>이름</label><input className="fi" value={fName} onChange={e=>setFName(e.target.value)}/></div>
              <div className="fg" style={{margin:0}}><label>부서</label><input className="fi" value={ME.dept} readOnly style={{background:'var(--gray-50)',color:'var(--gray-600)'}}/></div>
            </div>
            <div className="frow" style={{marginBottom:16}}>
              <div className="fg" style={{margin:0}}><label>운행 방향</label><select className="fs" value={fDir} onChange={e=>setFDir(e.target.value)}><option>출근</option><option>퇴근</option><option>출·퇴근 모두</option></select></div>
              <div className="fg" style={{margin:0}}><label>출발 시간</label><input className="fi" type="time" value={fTime} onChange={e=>setFTime(e.target.value)}/></div>
            </div>
            <div className="fg"><label>출발지</label><input className="fi" value={fFrom} onChange={e=>setFFrom(e.target.value)} placeholder="예) 강남구 역삼동"/></div>
            <div className="fg"><label>경유지 <span style={{color:'var(--gray-400)',fontWeight:400}}>(선택)</span></label><input className="fi" value={fVia} onChange={e=>setFVia(e.target.value)} placeholder="예) 서초구 잠원동 근처"/></div>
            {showForm==='driver'
              ? <div className="frow" style={{marginBottom:16}}>
                  <div className="fg" style={{margin:0}}><label>탑승 가능 인원</label><input className="fi" type="number" min={1} max={4} value={fSeats} onChange={e=>setFSeats(+e.target.value)}/></div>
                  <div className="fg" style={{margin:0}}><label>1인 분담금 (원)</label><input className="fi" type="number" value={fCost} onChange={e=>setFCost(+e.target.value)}/></div>
                </div>
              : <div className="frow" style={{marginBottom:16}}>
                  <div className="fg" style={{margin:0}}><label>탑승 인원</label><input className="fi" type="number" min={1} max={4} value={fPeople} onChange={e=>setFPeople(+e.target.value)}/></div>
                  <div className="fg" style={{margin:0}}><label>최대 예산 (원)</label><input className="fi" type="number" value={fBudget} onChange={e=>setFBudget(+e.target.value)}/></div>
                </div>}
            <div className="fg"><label>반복 요일</label><div className="day-sel">{DAYS.map((d,i)=><button key={d} className={`day-btn${fDays[i]?' on':''}`} onClick={()=>toggleDay(i)}>{d}</button>)}</div></div>
            <div className="fg"><label>태그</label><div className="tag-sel">{TAGS.map(t=><button key={t} className={`tag-opt${fTags.includes(t)?' on':''}`} onClick={()=>toggleTag(t)}>{t}</button>)}</div></div>
            <button className="sub-btn" style={{background:showForm==='driver'?'linear-gradient(135deg,#1B4FC4,#3182F6)':'linear-gradient(135deg,#039955,#05C072)'}} onClick={registerListing}>매칭보드에 등록하기</button>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detail && (
        <div className="overlay" onClick={()=>setDetail(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="m-handle"/>
            <div className="lc-head" style={{marginBottom:18}}>
              <div className={`lc-av ${detail.type}`} style={{width:54,height:54,fontSize:26,borderRadius:16}}>{detail.avatar}</div>
              <div style={{flex:1}}>
                <div className="lc-name" style={{fontSize:17}}>{detail.name} ✅{detail.dept===ME.dept&&<span className="badge orange">같은 부서</span>}</div>
                <div className="lc-sub" style={{marginTop:3}}>{detail.dept} · {detail.rank}</div>
                <div style={{fontSize:12,color:'#F5A623',marginTop:3}}>{'★'.repeat(Math.floor(detail.rating))} <span style={{color:'var(--gray-800)',fontWeight:600}}>{detail.rating} · 후기 {detail.review_cnt}개</span></div>
              </div>
              <span className={`badge ${detail.type==='driver'?'blue':'green'}`}>{detail.type==='driver'?'드라이버':'동승자'}</span>
            </div>
            <div style={{background:'var(--gray-50)',borderRadius:16,padding:16,marginBottom:14}}>
              <div style={{fontSize:12,color:'var(--gray-400)',fontWeight:600,marginBottom:10}}>이동 경로</div>
              <div className="ri" style={{marginBottom:8}}><div className="rdot s"/><div className="rtxt" style={{fontSize:14,fontWeight:600}}>{detail.from_loc}</div></div>
              {detail.via_loc&&<><div style={{width:1,height:10,background:'var(--gray-200)',margin:'0 0 8px 3px'}}/><div className="ri" style={{marginBottom:8}}><div style={{width:7,height:7,borderRadius:'50%',background:'#F5A623',flexShrink:0}}/><div className="rtxt" style={{fontSize:13}}>경유 {detail.via_loc}</div></div></>}
              <div style={{width:1,height:10,background:'var(--gray-200)',margin:'0 0 8px 3px'}}/><div className="ri"><div className="rdot e"/><div className="rtxt" style={{fontSize:14,fontWeight:600}}>본사 ({detail.direction})</div></div>
            </div>
            <div className="dg">
              <div className="dc"><div className="dc-lbl">출발 시간</div><div className="dc-val">{detail.depart_time.slice(0,5)}</div></div>
              <div className="dc"><div className="dc-lbl">운행 방향</div><div className="dc-val">{detail.direction}</div></div>
              <div className="dc"><div className="dc-lbl">{detail.type==='driver'?'탑승가능':'탑승인원'}</div><div className="dc-val">{detail.type==='driver'?`${detail.seats}명`:`${detail.people}명`}</div></div>
              <div className="dc"><div className="dc-lbl">{detail.type==='driver'?'분담금(1인)':'최대 예산'}</div><div className="dc-val">{detail.type==='driver'?`${detail.cost?.toLocaleString()}원`:`${detail.budget?.toLocaleString()}원`}</div></div>
            </div>
            <div style={{marginBottom:14}}><div style={{fontSize:12,color:'var(--gray-400)',fontWeight:600,marginBottom:8}}>운행 요일</div><div className="days-row">{DAYS.map((d,i)=><div key={d} className={`dd ${detail.days[i]?'on':'off'}`}>{d}</div>)}</div></div>
            {detail.tags.length>0&&<div style={{marginBottom:16}}><div style={{fontSize:12,color:'var(--gray-400)',fontWeight:600,marginBottom:8}}>태그</div><div className="tags-row">{detail.tags.map(t=><span key={t} className="tag">{t}</span>)}</div></div>}
            <div style={{background:'var(--blue-soft)',borderRadius:12,padding:'12px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:22}}>🎯</span>
              <div><div style={{fontSize:13,fontWeight:700,color:'var(--blue)'}}>경로 매칭률 {detail.mp??calcMp(detail)}%</div><div style={{fontSize:11,color:'var(--blue)',opacity:.7,marginTop:2}}>출발지·요일·시간 기준 자동 계산</div></div>
            </div>
            <button className={btnCls(detail)} onClick={()=>{if(!detail.matched&&!sentIds.has(detail.id)){handleMatch(detail);setDetail(null)}}}>
              {detail.matched?'✅ 이미 매칭된 카풀이에요':sentIds.has(detail.id)?'⏳ 요청을 보냈어요':detail.type==='driver'?'🚗 탑승 요청하기':'🙋 동승 요청하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
