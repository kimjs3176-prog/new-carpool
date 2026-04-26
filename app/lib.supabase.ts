import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnon)

export type ListingType = 'driver' | 'passenger'

export interface Profile {
  id:         string
  name:       string
  dept:       string
  rank?:      string
  home_area:  string
  avatar:     string
  trips:      number
  rating:     number
  created_at: string
}

export interface Listing {
  id:              string
  type:            ListingType
  user_id?:        string
  name:            string
  dept:            string
  rank?:           string
  avatar:          string
  from_loc:        string
  via_loc?:        string
  direction:       string
  schedule_type:    'single' | 'repeat' | '2bu' | '5bu'  // 개별|반복|2부제|5부제
  ride_date?:       string   // 개별: YYYY-MM-DD
  repeat_end_date?: string   // 반복: 종료일 (선택)
  rotation_group?:  string   // 2부제: 'odd'|'even' / 5부제: '1'~'5'
  depart_time:     string
  seats?:          number
  cost?:           number
  people?:         number
  budget?:         number
  days:            number[]              // 반복: 요일 [월~금]
  tags:            string[]
  rating:          number
  review_cnt:      number
  matched:         boolean
  created_at:      string
  mp?:             number
}

export interface MatchRequest {
  id:              string
  listing_id:      string
  requester_id?:   string
  requester_name:  string
  requester_dept:  string
  status:          'pending' | 'accepted' | 'declined'
  created_at:      string
}

// ── 인증 ──────────────────────────────────────
export async function signUp(
  email: string,
  password: string,
  profile: { name: string; dept: string; home_area: string; avatar: string }
) {
  // user_metadata에 프로필 정보도 함께 저장 (트리거 백업용)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: profile },
  })
  if (error) throw error

  const uid = data.user?.id
  if (!uid) throw new Error('가입 처리 중 오류가 발생했어요')

  // 프로필 직접 INSERT (RLS: WITH CHECK(true) 이므로 세션 없어도 가능)
  const { error: pe } = await supabase.from('profiles').insert({
    id: uid, rank: '', ...profile,
  })

  // 이미 트리거로 생성됐거나 중복인 경우 무시
  if (pe && !pe.message?.includes('duplicate') && pe.code !== '23505') {
    throw pe
  }

  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
  return data
}

// ── 카풀 목록 ──────────────────────────────────
export async function getListings(filter?: string, myDept?: string, myArea?: string) {
  let q = supabase.from('listings').select('*').order('ride_date').order('depart_time')
  if (filter === 'driver')    q = q.eq('type', 'driver')
  if (filter === 'passenger') q = q.eq('type', 'passenger')
  if (filter === 'dept' && myDept) q = q.eq('dept', myDept)
  if (filter === 'near' && myArea) q = q.ilike('from_loc', `${myArea}%`)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Listing[]
}

export async function createListing(listing: Omit<Listing, 'id' | 'created_at' | 'mp'>) {
  const { data, error } = await supabase.from('listings').insert(listing).select().single()
  if (error) throw error
  return data as Listing
}

export async function setMatched(id: string) {
  const { error } = await supabase.from('listings').update({ matched: true }).eq('id', id)
  if (error) throw error
}

// ── 매칭 요청 ──────────────────────────────────
export async function sendMatchRequest(req: Omit<MatchRequest, 'id' | 'status' | 'created_at'>) {
  const { data, error } = await supabase
    .from('match_requests').insert({ ...req, status: 'pending' }).select().single()
  if (error) throw error
  return data as MatchRequest
}

export async function getMyMatchRequests(listingIds: string[]) {
  if (!listingIds.length) return []
  const { data, error } = await supabase
    .from('match_requests').select('*')
    .in('listing_id', listingIds).eq('status', 'pending')
  if (error) throw error
  return (data ?? []) as MatchRequest[]
}

export async function updateRequestStatus(id: string, status: 'accepted' | 'declined') {
  const { error } = await supabase.from('match_requests').update({ status }).eq('id', id)
  if (error) throw error
}

export async function updateProfileTrips(uid: string, trips: number) {
  await supabase.from('profiles').update({ trips }).eq('id', uid)
}
