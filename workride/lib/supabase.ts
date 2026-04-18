import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnon)

// ─── 타입 ───────────────────────────────────
export type ListingType = 'driver' | 'passenger'

export interface Listing {
  id:          string
  type:        ListingType
  name:        string
  dept:        string
  rank:        string
  avatar:      string
  from_loc:    string
  via_loc?:    string
  direction:   string
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
  mp?:         number   // 프론트에서 계산하는 매칭률
}

export interface MatchRequest {
  id:              string
  listing_id:      string
  requester_name:  string
  requester_dept:  string
  status:          'pending' | 'accepted' | 'declined'
  created_at:      string
}

// ─── API 함수 ────────────────────────────────
export async function getListings(filter?: string, myDept?: string, myArea?: string) {
  let q = supabase.from('listings').select('*').order('created_at', { ascending: false })
  if (filter === 'driver')    q = q.eq('type', 'driver')
  if (filter === 'passenger') q = q.eq('type', 'passenger')
  if (filter === 'dept' && myDept) q = q.eq('dept', myDept)
  if (filter === 'near' && myArea) q = q.ilike('from_loc', `${myArea}%`)
  const { data, error } = await q
  if (error) throw error
  return data as Listing[]
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

export async function sendMatchRequest(req: Omit<MatchRequest, 'id' | 'status' | 'created_at'>) {
  const { data, error } = await supabase.from('match_requests').insert({ ...req, status: 'pending' }).select().single()
  if (error) throw error
  return data as MatchRequest
}

export async function getMatchRequests(listingId: string) {
  const { data, error } = await supabase
    .from('match_requests').select('*').eq('listing_id', listingId).eq('status', 'pending')
  if (error) throw error
  return data as MatchRequest[]
}

export async function updateRequestStatus(id: string, status: 'accepted' | 'declined') {
  const { error } = await supabase.from('match_requests').update({ status }).eq('id', id)
  if (error) throw error
}
