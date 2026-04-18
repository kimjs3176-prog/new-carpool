import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnon)

// ─── 타입 ─────────────────────────────────────
export type ListingType = 'driver' | 'passenger'

export interface Profile {
  id:         string
  name:       string
  dept:       string
  rank:       string
  home_area:  string
  avatar:     string
  trips:      number
  rating:     number
  created_at: string
}

export interface Listing {
  id:          string
  type:        ListingType
  user_id?:    string
  name:        string
  dept:        string
  rank:        string
  avatar:      string
  from_loc:    string
  via_loc?:    string
  direction:   string
  ride_date:   string
  depart_time: string
  seats?:      number
  cost?:       number
  people?:     number
  budget?:     number
  days:        number[]
  tags:        string[]
  rating:      number
  review_cnt:  number
  matched:     boolean
  created_at:  string
  mp?:         number
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

// ─── 인증 ──────────────────────────────────────
export async function signUp(
  email: string, password: string,
  profile: Omit<Profile, 'id' | 'trips' | 'rating' | 'created_at'>
) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  const uid = data.user!.id
  const { error: pe } = await supabase.from('profiles').insert({ id: uid, ...profile })
  if (pe) throw pe
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

// ─── 카풀 목록 ──────────────────────────────────
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

export async function createListing(
  listing: Omit<Listing, 'id' | 'created_at' | 'mp'>
) {
  const { data, error } = await supabase.from('listings').insert(listing).select().single()
  if (error) throw error
  return data as Listing
}

export async function setMatched(id: string) {
  const { error } = await supabase.from('listings').update({ matched: true }).eq('id', id)
  if (error) throw error
}

export async function sendMatchRequest(
  req: Omit<MatchRequest, 'id' | 'status' | 'created_at'>
) {
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
