'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  supabase, getListings, createListing, sendMatchRequest,
  setMatched, updateRequestStatus, updateProfileTrips,
  signUp, signIn, signOut, getProfile,
  type Listing, type MatchRequest, type Profile,
} from '../lib/supabase'

const DAYS=['월','화','수','목','금']
const TAGS=['비흡연','조용한 탑승','대화 OK','음악 OK','반려동물 NO','짐 없음','정시 탑승','에어컨 완비','여성 전용']
const DEPTS=['기술혁신팀','경영기획팀','마케팅팀','재무팀','인사팀','연구개발팀','영업팀','IT인프라팀','생산팀','품질팀']
const RANKS=['인턴','사원','주임','대리','과장','차장','부장','팀장']
const AVATARS=['😊','👨‍💼','👩‍💼','🧑‍💻','👩‍💻','🧑‍🔬','👩‍🎓','🧑‍🔧','👨‍🎨','🧑‍🚀']

function today(){return new Date().toISOString().split('T')[0]}
function fmtDate(d:string){
  if(!d)return ''
  const dt=new Date(d+'T00:00:00')
  const diff=Math.round((dt.getTime()-new Date(today()+'T00:00:00').getTime())/86400000)
  const lbl=diff===0?'오늘':diff===1?'내일':diff===-1?'어제':null
  return `${d.slice(5).replace('-','/')}${lbl?` (${lbl})`:''}`
}
function calcMp(l:Listing,me:Profile|null):number{
  if(!me)return 50
  let s=50
  if(l.from_loc.startsWith(me.home_area.split(' ')[0]))s+=30
  if(l.dept===me.dept)s+=15
  if(l.days.filter(Boolean).length>=4)s+=5
  return Math.min(s,99)
}

export default function App(){
  const[authMode,setAuthMode]=useState<'login'|'signup'>('login')
  const[uid,setUid]=useState<string|null>(null)
  const[profile,setProfile]=useState<Profile|null>(null)
  const[authLoading,setAuthLoading]=useState(true)

  const[lEmail,setLEmail]=useState('')
  const[lPw,setLPw]=useState('')
  const[lErr,setLErr]=useState('')
  const[lLoading,setLLoading]=useState(false)

  const[rEmail,setREmail]=useState('')
  const[rPw,setRPw]=useState('')
  const[rName,setRName]=useState('')
  const[rDept,setRDept]=useState(DEPTS[0])
  const[rRank,setRRank]=useState('대리')
  const[rHome,setRHome]=useState('')
  const[rAvatar,setRAvatar]=useState('😊')
  const[rErr,setRErr]=useState('')
  const[rLoading,setRLoading]=useState(false)

  const[tab,setTab]=useState<'home'|'board'|'my'>('home')
  const[listings,setListings]=useState<Listing[]>([])
  const[myListings,setMyListings]=useState<Listing[]>([])
  const[reqs,setReqs]=useState<MatchRequest[]>([])
  const[sentIds,setSentIds]=useState<Set<string>>(new Set())
  const[filter,setFilter]=useState('all')
  const[loading,setLoading]=useState(false)
  const[myGroup,setMyGroup]=useState<{name:string,dept:string,avatar:string,role:string}[]|null>(null)
  const[showForm,setShowForm]=useState<'driver'|'passenger'|null>(null)
  const[detail,setDetail]=useState<Listing|null>(null)
  const[toastMsg,setToastMsg]=useState('')
  const[toastVis,setToastVis]=useState(false)

  const[fFrom,setFFrom]=useState('')
  const[fVia,setFVia]=useState('')
  const[fDir,setFDir]=useState('출근')
  const[fDate,setFDate]=useState(today())
  const[fTime,setFTime]=useState('08:30')
  const[fSeats,setFSeats]=useState(3)
  const[fCost,setFCost]=useState(2000)
  const[fPeople,setFPeople]=useState(1)
  const[fBudget,setFBudget]=useState(2000)
  const[fDays,setFDays]=useState([1,1,1,1,1])
  const[fTags,setFTags]=useState<string[]>([])
  const[fSubmitting,setFSubmitting]=useState(false)

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session?.user){setUid(session.user.id);getProfile(session.user.id).then(p=>{setProfile(p);setAuthLoading(false)})}
      else setAuthLoading(false)
    })
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_ev,session)=>{
      if(session?.user){setUid(session.user.id);getProfile(session.user.id).then(setProfile)}
      else{setUid(null);setProfile(null)}
    })
    return()=>subscription.unsubscribe()
  },[])

  function toast(msg:string){setToastMsg(msg);setToastVis(true);setTimeout(()=>setToastVis(false),2600)}

  async function handleLogin(){
    setLErr('');setLLoading(true)
    try{await signIn(lEmail.trim(),lPw)}
    catch{setLErr('이메일 또는 비밀번호가 올바르지 않아요')}
    finally{setLLoading(false)}
  }

  async function handleSignUp(){
    if(!rName.trim()){setRErr('이름을 입력해 주세요');return}
    if(!rHome.trim()){setRErr('거주 지역을 입력해 주세요');return}
    if(!rEmail.includes('@')){setRErr('올바른 이메일을 입력해 주세요');return}
    if(rPw.length<6){setRErr('비밀번호는 6자 이상이어야 해요');return}
    setRErr('');setRLoading(true)
    try{
      await signUp(rEmail.trim(),rPw,{name:rName.trim(),dept:rDept,rank:rRank,home_area:rHome.trim(),avatar:rAvatar})
      toast('가입 완료! 환영해요 🎉')
    }catch(e:unknown){
      setRErr(e instanceof Error&&e.message.includes('already')?'이미 가입된 이메일이에요':'가입에 실패했어요')
    }finally{setRLoading(false)}
  }

  async function handleSignOut(){
    await signOut();setUid(null);setProfile(null)
    setListings([]);setMyListings([]);setReqs([]);setMyGroup(null);setTab('home')
    toast('로그아웃 됐어요')
  }

  const loadListings=useCallback(async()=>{
    if(!profile)return
    setLoading(true)
    try{
      const area=filter==='near'?profile.home_area.split(' ')[0]:undefined
      const dept=filter==='dept'?profile.dept:undefined
      const data=await getListings(filter,dept,area)
      const withMp=data.map(l=>({...l,mp:calcMp(l,profile)}))
      setListings(withMp)
      if(uid)setMyListings(withMp.filter(l=>l.user_id===uid))
    }finally{setLoading(false)}
  },[filter,profile,uid])

  useEffect(()=>{if(profile)loadListings()},[loadListings,profile])

  useEffect(()=>{
    if(!uid)return
    const ch=supabase.channel('listings-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'listings'},()=>loadListings())
      .subscribe()
    return()=>{supabase.removeChannel(ch)}
  },[uid,loadListings])

  async function handleMatch(l:Listing){
    if(!profile||!uid||l.matched||sentIds.has(l.id))return
    if(l.user_id===uid){toast('내가 등록한 카풀이에요');return}
    try{
      await sendMatchRequest({listing_id:l.id,requester_id:uid,requester_name:profile.name,requester_dept:profile.dept})
      setSentIds(prev=>new Set(Array.from(prev).concat(l.id)))
      toast(`${l.name} ${l.rank}님에게 매칭 요청을 보냈어요 🚗`)
    }catch{toast('이미 요청을 보냈거나 오류가 발생했어요')}
  }

  async function acceptMatch(req:MatchRequest){
    try{
      await updateRequestStatus(req.id,'accepted')
      await setMatched(req.listing_id)
      const l=listings.find(x=>x.id===req.listing_id)
      setMyGroup([
        {name:profile!.name,dept:profile!.dept,avatar:profile!.avatar,role:l?.type==='driver'?'드라이버':'동승자'},
        {name:req.requester_name,dept:req.requester_dept,avatar:'🧑‍💼',role:l?.type==='driver'?'동승자':'드라이버'},
      ])
      setReqs(prev=>prev.filter(r=>r.id!==req.id))
      if(profile&&uid)updateProfileTrips(uid,profile.trips+1)
      toast(`${req.requester_name}님과 매칭 완료! 📱`)
      loadListings()
    }catch{toast('수락 처리에 실패했어요')}
  }
  async function declineMatch(req:MatchRequest){
    await updateRequestStatus(req.id,'declined')
    setReqs(prev=>prev.filter(r=>r.id!==req.id))
    toast(`${req.requester_name}님의 요청을 거절했어요`)
  }

  function openForm(type:'driver'|'passenger'){
    setShowForm(type);setFFrom(profile?.home_area??'');setFVia('')
    setFDir('출근');setFDate(today());setFTime('08:30')
    setFSeats(3);setFCost(2000);setFPeople(1);setFBudget(2000)
    setFDays([1,1,1,1,1]);setFTags([])
  }

  async function registerListing(){
    if(!fFrom.trim()){toast('출발지를 입력해 주세요');return}
    if(!fDate){toast('날짜를 선택해 주세요');return}
    if(!profile||!uid)return
    setFSubmitting(true)
    try{
      const newItem=await createListing({
        type:showForm!,user_id:uid,name:profile.name,dept:profile.dept,rank:profile.rank,avatar:profile.avatar,
        from_loc:fFrom.trim(),via_loc:fVia.trim()||undefined,direction:fDir,ride_date:fDate,depart_time:fTime,
        ...(showForm==='driver'?{seats:fSeats,cost:fCost}:{people:fPeople,budget:fBudget}),
        days:fDays,tags:fTags,rating:5.0,review_cnt:0,matched:false,
      })
      setMyListings(prev=>[{...newItem,mp:100},...prev])
      setShowForm(null);toast('매칭보드에 등록됐어요! 🚀');loadListings()
    }catch{toast('등록에 실패했어요')}finally{setFSubmitting(false)}
  }

  const driverCnt=listings.filter(l=>l.type==='driver').length
  const passCnt=listings.filter(l=>l.type==='passenger').length
  const matchedCnt=listings.filter(l=>l.matched).length
  const availCnt=listings.filter(l=>!l.matched).length
  const topSuggest=[...listings].filter(l=>!l.matched&&l.user_id!==uid).sort((a,b)=>(b.mp||0)-(a.mp||0)).slice(0,3)

  function btnCls(l:Listing){
    if(l.user_id===uid)return'act-btn red-out'
    if(l.matched)return'act-btn gray'
    if(sentIds.has(l.id))return'act-btn gray'
    return l.type==='driver'?'act-btn blue':'act-btn green'
  }
  function btnTxt(l:Listing){
    if(l.user_id===uid)return'✏️ 내가 등록한 카풀'
    if(l.matched)return'✅ 매칭완료'
    if(sentIds.has(l.id))return'⏳ 요청 전송됨'
    return l.type==='driver'?'🚗 탑승 요청하기':'🙋 동승 요청하기'
  }

  if(authLoading)return(
    <div className="app" style={{display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#1B2D6B,#3182F6)'}}>
      <div style={{textAlign:'center',color:'#fff'}}>
        <div style={{fontSize:48,marginBottom:16}}>🚗</div>
        <div style={{fontSize:20,fontWeight:800}}>WorkRide</div>
        <div style={{marginTop:20,display:'flex',justifyContent:'center'}}><div className="spinner"/></div>
      </div>
    </div>
  )

  if(!uid||!profile)return(
    <div className="app">
      <div className="auth-wrap">
        <div className="auth-hero">
          <div className="auth-logo">
            <div className="auth-logo-icon">🚗</div>
            <div className="auth-logo-text">WorkRide</div>
          </div>
          <div className="auth-headline">
            사내 카풀,<br/>동료와 함께 출퇴근
            <span>회사 이메일로 간편하게 시작해요</span>
          </div>
        </div>
        <div className="auth-body">
          <div className="auth-tabs">
            <button className={`auth-tab${authMode==='login'?' active':''}`} onClick={()=>{setAuthMode('login');setLErr('');setRErr('')}}>로그인</button>
            <button className={`auth-tab${authMode==='signup'?' active':''}`} onClick={()=>{setAuthMode('signup');setLErr('');setRErr('')}}>회원가입</button>
          </div>
          {authMode==='login'?(
            <>
              <div className="fg"><label>이메일</label><input className={`fi${lErr?' err':''}`} type="email" placeholder="company@email.com" value={lEmail} onChange={e=>setLEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()}/></div>
              <div className="fg"><label>비밀번호</label><input className={`fi${lErr?' err':''}`} type="password" placeholder="비밀번호 입력" value={lPw} onChange={e=>setLPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleLogin()}/>{lErr&&<div className="err-msg">{lErr}</div>}</div>
              <button className="auth-btn" onClick={handleLogin} disabled={lLoading}>
                {lLoading?<><div className="spinner"/>로그인 중...</>:'로그인'}
              </button>
              <div className="auth-note">계정이 없으신가요? 위에서 회원가입을 선택해 주세요</div>
            </>
          ):(
            <>
              <div className="fg"><label>이름</label><input className="fi" placeholder="홍길동" value={rName} onChange={e=>setRName(e.target.value)}/></div>
              <div className="frow" style={{marginBottom:14}}>
                <div className="fg" style={{margin:0}}><label>부서</label><select className="fs" value={rDept} onChange={e=>setRDept(e.target.value)}>{DEPTS.map(d=><option key={d}>{d}</option>)}</select></div>
                <div className="fg" style={{margin:0}}><label>직급</label><select className="fs" value={rRank} onChange={e=>setRRank(e.target.value)}>{RANKS.map(r=><option key={r}>{r}</option>)}</select></div>
              </div>
              <div className="fg"><label>거주 지역</label><input className="fi" placeholder="예) 강남구 역삼동" value={rHome} onChange={e=>setRHome(e.target.value)}/></div>
              <div className="fg">
                <label>프로필 이모지</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {AVATARS.map(a=><button key={a} onClick={()=>setRAvatar(a)} style={{width:40,height:40,borderRadius:12,border:`2px solid ${rAvatar===a?'var(--blue)':'var(--gray-200)'}`,background:rAvatar===a?'var(--blue-soft)':'#fff',fontSize:20,cursor:'pointer',transition:'all .15s'}}>{a}</button>)}
                </div>
              </div>
              <div className="fg"><label>이메일</label><input className="fi" type="email" placeholder="company@email.com" value={rEmail} onChange={e=>setREmail(e.target.value)}/></div>
              <div className="fg"><label>비밀번호 <span style={{color:'var(--gray-400)',fontWeight:400}}>(6자 이상)</span></label><input className={`fi${rErr?' err':''}`} type="password" placeholder="비밀번호 설정" value={rPw} onChange={e=>setRPw(e.target.value)}/>{rErr&&<div className="err-msg">{rErr}</div>}</div>
              <button className="auth-btn" style={{background:'linear-gradient(135deg,#039955,#05C072)'}} onClick={handleSignUp} disabled={rLoading}>
                {rLoading?<><div className="spinner"/>가입 중...</>:'가입하고 시작하기'}
              </button>
              <div className="auth-note">사내 카풀 목적으로만 사용됩니다</div>
            </>
          )}
        </div>
      </div>
      <div className={`toast${toastVis?' show':''}`}>{toastMsg}</div>
    </div>
  )

  function LCard({l,onDetail}:{l:Listing;onDetail:()=>void}){
    const isMe=l.user_id===uid
    return(
      <div className={`lcard ${l.type}${l.matched?' matched':''}${isMe?' mine':''}`} onClick={onDetail}>
        <div className="lc-head">
          <div className={`lc-av ${l.type}`}>{l.avatar}</div>
          <div style={{flex:1}}>
            <div className="lc-name">{l.name}{isMe?<span style={{fontSize:11,color:'var(--blue)',fontWeight:600,marginLeft:3}}>(나)</span>:' ✅'}{l.dept===profile?.dept&&<span className="badge orange">같은 부서</span>}</div>
            <div className="lc-sub">{l.dept} · {l.rank}{!isMe&&` · ★${l.rating}`}</div>
          </div>
          <span className={`badge ${l.type==='driver'?'blue':'green'}`}>{l.type==='driver'?'드라이버':'동승자'}</span>
        </div>
        <div className="route-box">
          <div className="ri"><div className="rdot s"/><div className="rtxt">{l.from_loc}{l.via_loc&&` → ${l.via_loc}`}</div></div>
          <div className="rline"/>
          <div className="ri"><div className="rdot e"/><div className="rtxt">본사 ({l.direction})</div></div>
        </div>
        <div className="meta-row">
          <div className="date-chip">📅 {fmtDate(l.ride_date)}</div>
          <div className="chip">⏰ {l.depart_time.slice(0,5)}</div>
          {l.type==='driver'?<><div className="chip">👥 {l.seats}석</div><div className="chip">💰 {l.cost?.toLocaleString()}원</div></>:<><div className="chip">👤 {l.people}명</div><div className="chip">💰 최대 {l.budget?.toLocaleString()}원</div></>}
          {!isMe&&<div className="chip">🎯 {l.mp??calcMp(l,profile)}%</div>}
        </div>
        <div className="days-row">{DAYS.map((d,i)=><div key={d} className={`dd ${l.days[i]?'on':'off'}`}>{d}</div>)}</div>
        {l.tags.length>0&&<div className="tags-row">{l.tags.map(t=><span key={t} className="tag">{t}</span>)}</div>}
        <button className={btnCls(l)} onClick={e=>{e.stopPropagation();if(!isMe)handleMatch(l)}}>{btnTxt(l)}</button>
      </div>
    )
  }

  return(
    <div className="app">
      <div className={`toast${toastVis?' show':''}`}>{toastMsg}</div>

      {/* HOME */}
      <div style={{display:tab==='home'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header">
          <div className="header-row">
            <div><div className="header-title">WorkRide 🚗</div><div className="header-sub">{profile.dept} · {profile.rank}</div></div>
            <div className="header-right"><button className="header-btn" onClick={()=>setTab('my')}>👤</button></div>
          </div>
        </div>
        <div className="screen">
          <div className="banner">
            <div className="banner-name">{profile.name} {profile.rank}님</div>
            <div className="banner-msg">오늘도 함께 출근해요 🙌</div>
            <div className="today-box">
              <div><div className="today-label">매칭 가능한 동료</div><div className="today-val"><span style={{color:'#93C5FD'}}>{availCnt}</span>명이 기다리고 있어요</div></div>
              <div className="today-pills"><div className="pill">{profile.dept.replace('팀','')}</div><div className="pill">출퇴근</div></div>
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
            <div className="sec-title">카풀 등록하기</div>
            <div className="quick-row">
              <button className="quick-card" onClick={()=>openForm('driver')}><div className="qc-bar" style={{background:'var(--blue)'}}/><span className="qc-icon">🚗</span><div className="qc-label">드라이버 등록</div><div className="qc-sub">동승자 모집하기</div></button>
              <button className="quick-card" onClick={()=>openForm('passenger')}><div className="qc-bar" style={{background:'var(--green)'}}/><span className="qc-icon">🙋</span><div className="qc-label">동승자 등록</div><div className="qc-sub">드라이버 찾기</div></button>
            </div>
          </div>
          <div className="divider"/>
          <div className="section">
            <div className="sec-title">추천 동료 카풀<button className="sec-more" onClick={()=>setTab('board')}>전체보기</button></div>
            {topSuggest.length===0
              ?<div style={{textAlign:'center',padding:'20px 0',fontSize:13,color:'var(--gray-400)'}}>매칭 가능한 동료가 없어요<br/>먼저 등록해 보세요!</div>
              :<div style={{display:'flex',flexDirection:'column',gap:10}}>
                {topSuggest.map(l=>(
                  <div key={l.id} className="sug-card" onClick={()=>setDetail(l)}>
                    <div className="sug-av">{l.avatar}</div>
                    <div className="sug-info">
                      <div className="sug-name">{l.name}<span className={`badge ${l.type==='driver'?'blue':'green'}`}>{l.type==='driver'?'드라이버':'동승자'}</span>{l.dept===profile.dept&&<span className="badge orange">같은 부서</span>}</div>
                      <div className="sug-dept">{l.dept} · {l.rank}</div>
                      <div className="sug-route">📅 {fmtDate(l.ride_date)} · ⏰ {l.depart_time.slice(0,5)} · 📍 {l.from_loc}</div>
                    </div>
                    <div className="sug-right"><div className="match-pct">{l.mp??calcMp(l,profile)}%</div><div className="match-lbl">매칭률</div></div>
                  </div>
                ))}
              </div>}
          </div>
        </div>
      </div>

      {/* BOARD */}
      <div style={{display:tab==='board'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header"><div className="header-row"><div><div className="header-title">매칭 보드</div><div className="header-sub">사내 카풀 전체 목록</div></div></div></div>
        <div style={{flex:1,overflow:'auto',paddingBottom:84,scrollbarWidth:'none'}}>
          <div className="filter-bar">
            {([['all','전체'],['driver','🚗 드라이버'],['passenger','🙋 동승자'],['dept','🏢 같은 부서'],['near','📍 근처 출발']] as [string,string][]).map(([f,label])=>(
              <button key={f} className={`filter-btn${filter===f?' active':''}`} onClick={()=>setFilter(f)}>{label}</button>
            ))}
          </div>
          <div className="card-list" style={{opacity:loading?.9:1}}>
            {listings.length===0&&!loading
              ?<div className="empty"><div className="empty-icon">🔍</div><div className="empty-title">조건에 맞는 카풀이 없어요</div><div className="empty-desc">필터를 변경하거나<br/>직접 등록해 보세요</div></div>
              :listings.map(l=><LCard key={l.id} l={l} onDetail={()=>setDetail(l)}/>)}
          </div>
        </div>
      </div>

      {/* MY */}
      <div style={{display:tab==='my'?'flex':'none',flexDirection:'column',flex:1,overflow:'hidden'}}>
        <div className="header">
          <div className="header-row">
            <div><div className="header-title">내 카풀</div><div className="header-sub">프로필 · 그룹 · 요청</div></div>
            <button className="header-logout" onClick={handleSignOut}>🚪</button>
          </div>
        </div>
        <div style={{flex:1,overflow:'auto',paddingBottom:84,scrollbarWidth:'none'}}>
          <div className="profile-banner">
            <div className="pb-top">
              <div className="pb-emoji">{profile.avatar}</div>
              <div><div className="pb-name">{profile.name} {profile.rank}</div><div className="pb-meta">{profile.dept} · {profile.home_area}</div><div className="pb-cert">✅ 사내 인증 완료</div></div>
            </div>
            <div className="pb-stats">
              <div className="pb-stat"><div className="pb-stat-num">{profile.trips}</div><div className="pb-stat-lbl">탑승 횟수</div></div>
              <div className="pb-stat"><div className="pb-stat-num">{profile.rating.toFixed(1)}</div><div className="pb-stat-lbl">나의 평점</div></div>
            </div>
          </div>
          {myGroup
            ?<div className="group-card"><div className="group-head"><div className="group-title">🚗 나의 카풀 그룹</div><span className="badge blue">정기 카풀</span></div>{myGroup.map((m,i)=><div key={i} className="g-member"><div className="g-av">{m.avatar}</div><div><div className="g-name">{m.name}</div><div className="g-sub">{m.dept} · {m.role}</div></div><div style={{marginLeft:'auto'}}><span className={`badge ${m.role==='드라이버'?'blue':'green'}`}>{m.role}</span></div></div>)}</div>
            :<div style={{margin:'14px 20px 0'}}><div className="info-bar">🤝 매칭이 완료되면 정기 카풀 그룹이 생겨요</div></div>}
          <div className="section" style={{paddingTop:16}}>
            <div className="sec-title">받은 매칭 요청{reqs.length>0&&<span className="badge red" style={{marginLeft:6}}>{reqs.length}</span>}</div>
            {reqs.length===0
              ?<p style={{fontSize:13,color:'var(--gray-400)',marginBottom:16}}>받은 요청이 없어요</p>
              :reqs.map(r=>(
                <div key={r.id} className="notif-card">
                  <div className="notif-head"><div className="notif-av">🧑‍💼</div><div><div className="notif-name">{r.requester_name} ✅</div><div className="notif-sub">{r.requester_dept} · {new Date(r.created_at).toLocaleTimeString('ko',{hour:'2-digit',minute:'2-digit'})} 요청</div></div></div>
                  <div className="notif-btns"><button className="btn-ok" onClick={()=>acceptMatch(r)}>수락하기</button><button className="btn-no" onClick={()=>declineMatch(r)}>거절</button></div>
                </div>
              ))}
            <div className="sec-title" style={{marginTop:4}}>내가 등록한 카풀</div>
            {myListings.length===0
              ?<div className="empty" style={{padding:'24px 0'}}><div className="empty-icon">🗒️</div><div className="empty-title">등록한 카풀이 없어요</div><div className="empty-desc">홈에서 드라이버 또는<br/>동승자로 등록해 보세요</div></div>
              :<div style={{display:'flex',flexDirection:'column',gap:12}}>
                {myListings.map(l=>(
                  <div key={l.id} className={`lcard ${l.type} mine`}>
                    <div className="lc-head"><div className={`lc-av ${l.type}`}>{l.avatar}</div><div style={{flex:1}}><div className="lc-name">{l.name} <span style={{fontSize:11,color:'var(--blue)',fontWeight:600}}>(나)</span></div><div className="lc-sub">{fmtDate(l.ride_date)} · {l.depart_time.slice(0,5)} · {l.direction}</div></div>{l.matched?<span className="badge green">매칭완료</span>:<span className={`badge ${l.type==='driver'?'blue':'green'}`}>{l.type==='driver'?'드라이버':'동승자'}</span>}</div>
                    <div className="route-box"><div className="ri"><div className="rdot s"/><div className="rtxt">{l.from_loc}</div></div><div className="rline"/><div className="ri"><div className="rdot e"/><div className="rtxt">본사</div></div></div>
                    <div className="days-row">{DAYS.map((d,i)=><div key={d} className={`dd ${l.days[i]?'on':'off'}`}>{d}</div>)}</div>
                  </div>
                ))}
              </div>}
          </div>
        </div>
      </div>

      <nav className="bottom-nav">
        <button className={`nav-item${tab==='home'?' active':''}`} onClick={()=>setTab('home')}><span className="nav-icon">🏠</span><span className="nav-label">홈</span></button>
        <button className={`nav-item${tab==='board'?' active':''}`} onClick={()=>setTab('board')}><span className="nav-icon">📋</span><span className="nav-label">매칭보드</span></button>
        <button className={`nav-item${tab==='my'?' active':''}`} onClick={()=>setTab('my')}><div className={`nav-dot${reqs.length>0?' show':''}`}/><span className="nav-icon">👤</span><span className="nav-label">내 카풀</span></button>
      </nav>

      {/* 등록 폼 */}
      {showForm&&(
        <div className="overlay" onClick={()=>setShowForm(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="m-handle"/>
            <div className="m-title">{showForm==='driver'?'🚗 드라이버 등록':'🙋 동승자 등록'}</div>
            <div className="frow" style={{marginBottom:14}}>
              <div className="fg" style={{margin:0}}><label>이름</label><input className="fi" value={profile.name} readOnly style={{background:'var(--gray-50)',color:'var(--gray-600)'}}/></div>
              <div className="fg" style={{margin:0}}><label>부서</label><input className="fi" value={profile.dept} readOnly style={{background:'var(--gray-50)',color:'var(--gray-600)'}}/></div>
            </div>
            <div className="frow" style={{marginBottom:14}}>
              <div className="fg" style={{margin:0}}><label>운행 방향</label><select className="fs" value={fDir} onChange={e=>setFDir(e.target.value)}><option>출근</option><option>퇴근</option><option>출·퇴근 모두</option></select></div>
              <div className="fg" style={{margin:0}}><label>운행 날짜</label><input className="fi" type="date" value={fDate} min={today()} onChange={e=>setFDate(e.target.value)}/></div>
            </div>
            <div className="fg"><label>출발 시간</label><input className="fi" type="time" value={fTime} onChange={e=>setFTime(e.target.value)}/></div>
            <div className="fg"><label>출발지 (거주 구역)</label><input className="fi" value={fFrom} onChange={e=>setFFrom(e.target.value)} placeholder="예) 강남구 역삼동"/></div>
            <div className="fg"><label>경유지 <span style={{color:'var(--gray-400)',fontWeight:400}}>(선택)</span></label><input className="fi" value={fVia} onChange={e=>setFVia(e.target.value)} placeholder="예) 서초구 잠원동 근처"/></div>
            {showForm==='driver'
              ?<div className="frow" style={{marginBottom:14}}><div className="fg" style={{margin:0}}><label>탑승 가능 인원</label><input className="fi" type="number" min={1} max={4} value={fSeats} onChange={e=>setFSeats(+e.target.value)}/></div><div className="fg" style={{margin:0}}><label>1인 분담금 (원)</label><input className="fi" type="number" value={fCost} onChange={e=>setFCost(+e.target.value)}/></div></div>
              :<div className="frow" style={{marginBottom:14}}><div className="fg" style={{margin:0}}><label>탑승 인원</label><input className="fi" type="number" min={1} max={4} value={fPeople} onChange={e=>setFPeople(+e.target.value)}/></div><div className="fg" style={{margin:0}}><label>최대 예산 (원)</label><input className="fi" type="number" value={fBudget} onChange={e=>setFBudget(+e.target.value)}/></div></div>}
            <div className="fg"><label>반복 요일</label><div className="day-sel">{DAYS.map((d,i)=><button key={d} className={`day-btn${fDays[i]?' on':''}`} onClick={()=>setFDays(prev=>prev.map((v,j)=>j===i?(v?0:1):v))}>{d}</button>)}</div></div>
            <div className="fg"><label>태그</label><div className="tag-sel">{TAGS.map(t=><button key={t} className={`tag-opt${fTags.includes(t)?' on':''}`} onClick={()=>setFTags(ts=>ts.includes(t)?ts.filter(x=>x!==t):[...ts,t])}>{t}</button>)}</div></div>
            <button className="sub-btn" style={{background:showForm==='driver'?'linear-gradient(135deg,#1B4FC4,#3182F6)':'linear-gradient(135deg,#039955,#05C072)'}} onClick={registerListing} disabled={fSubmitting}>
              {fSubmitting?<><div className="spinner"/>등록 중...</>:'매칭보드에 등록하기'}
            </button>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {detail&&(
        <div className="overlay" onClick={()=>setDetail(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="m-handle"/>
            <div className="lc-head" style={{marginBottom:18}}>
              <div className={`lc-av ${detail.type}`} style={{width:54,height:54,fontSize:26,borderRadius:16}}>{detail.avatar}</div>
              <div style={{flex:1}}>
                <div className="lc-name" style={{fontSize:17}}>{detail.name}{detail.user_id===uid?<span style={{fontSize:11,color:'var(--blue)',fontWeight:600,marginLeft:3}}>(나)</span>:' ✅'}{detail.dept===profile.dept&&<span className="badge orange">같은 부서</span>}</div>
                <div className="lc-sub" style={{marginTop:3}}>{detail.dept} · {detail.rank}</div>
                {detail.user_id!==uid&&<div style={{fontSize:12,color:'#F5A623',marginTop:3}}>{'★'.repeat(Math.floor(detail.rating))} <span style={{color:'var(--gray-800)',fontWeight:600}}>{detail.rating} · 후기 {detail.review_cnt}개</span></div>}
              </div>
              <span className={`badge ${detail.type==='driver'?'blue':'green'}`}>{detail.type==='driver'?'드라이버':'동승자'}</span>
            </div>
            <div style={{background:'var(--gray-50)',borderRadius:16,padding:16,marginBottom:14}}>
              <div style={{fontSize:12,color:'var(--gray-400)',fontWeight:600,marginBottom:10}}>이동 경로</div>
              <div className="ri" style={{marginBottom:8}}><div className="rdot s"/><div className="rtxt" style={{fontSize:14,fontWeight:600}}>{detail.from_loc}</div></div>
              {detail.via_loc&&<><div style={{width:1,height:10,background:'var(--gray-200)',margin:'0 0 8px 3px'}}/><div className="ri" style={{marginBottom:8}}><div className="rdot v"/><div className="rtxt" style={{fontSize:13}}>경유 {detail.via_loc}</div></div></>}
              <div style={{width:1,height:10,background:'var(--gray-200)',margin:'0 0 8px 3px'}}/><div className="ri"><div className="rdot e"/><div className="rtxt" style={{fontSize:14,fontWeight:600}}>본사 ({detail.direction})</div></div>
            </div>
            <div className="dg">
              <div className="dc"><div className="dc-lbl">운행 날짜</div><div className="dc-val" style={{fontSize:13}}>{fmtDate(detail.ride_date)}</div></div>
              <div className="dc"><div className="dc-lbl">출발 시간</div><div className="dc-val">{detail.depart_time.slice(0,5)}</div></div>
              <div className="dc"><div className="dc-lbl">{detail.type==='driver'?'탑승가능':'탑승인원'}</div><div className="dc-val">{detail.type==='driver'?`${detail.seats}명`:`${detail.people}명`}</div></div>
              <div className="dc"><div className="dc-lbl">{detail.type==='driver'?'분담금(1인)':'최대 예산'}</div><div className="dc-val">{detail.type==='driver'?`${detail.cost?.toLocaleString()}원`:`${detail.budget?.toLocaleString()}원`}</div></div>
            </div>
            <div style={{marginBottom:14}}><div style={{fontSize:12,color:'var(--gray-400)',fontWeight:600,marginBottom:8}}>운행 요일</div><div className="days-row">{DAYS.map((d,i)=><div key={d} className={`dd ${detail.days[i]?'on':'off'}`}>{d}</div>)}</div></div>
            {detail.tags.length>0&&<div style={{marginBottom:14}}><div style={{fontSize:12,color:'var(--gray-400)',fontWeight:600,marginBottom:8}}>태그</div><div className="tags-row">{detail.tags.map(t=><span key={t} className="tag">{t}</span>)}</div></div>}
            {detail.user_id!==uid&&<div style={{background:'var(--blue-soft)',borderRadius:12,padding:'12px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:22}}>🎯</span><div><div style={{fontSize:13,fontWeight:700,color:'var(--blue)'}}>경로 매칭률 {detail.mp??calcMp(detail,profile)}%</div><div style={{fontSize:11,color:'var(--blue)',opacity:.7,marginTop:2}}>출발지·부서·요일 기준 자동 계산</div></div></div>}
            <button className={btnCls(detail)} onClick={()=>{if(detail.user_id!==uid&&!detail.matched&&!sentIds.has(detail.id)){handleMatch(detail);setDetail(null)}}}>
              {detail.user_id===uid?'✏️ 내가 등록한 카풀이에요':detail.matched?'✅ 이미 매칭된 카풀이에요':sentIds.has(detail.id)?'⏳ 요청을 보냈어요':detail.type==='driver'?'🚗 탑승 요청하기':'🙋 동승 요청하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
