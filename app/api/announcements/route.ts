import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function adminClient() {
  return createServiceClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function identity(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const auth = createServiceClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user } } = await auth.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await adminClient().from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
  return { user, profile }
}

export async function GET(request: Request) {
  const current = await identity(request)
  if (!current) return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 })
  const db = adminClient()
  const query = db.from('patient_announcements').select('id, patient_id, title, body, purchase_date, estimated_amount, created_at, updated_at').order('created_at', { ascending: false })
  let result
  if (current.profile?.role === 'super_admin') {
    result = await query
  } else {
    const { data: relationships, error: relationshipError } = await db.from('care_relationships').select('patient_id').eq('caregiver_id', current.user.id)
    if (relationshipError) return NextResponse.json({ error: relationshipError.message }, { status: 500 })
    const patientIds = [current.user.id, ...(relationships ?? []).map((relationship) => relationship.patient_id)]
    result = await query.in('patient_id', patientIds)
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ announcements: result.data ?? [] })
}

export async function POST(request: Request) {
  const current = await identity(request)
  if (!current || current.profile?.role !== 'super_admin') return NextResponse.json({ error: 'Solo el super administrador puede publicar información' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  const patientId = typeof body.patientId === 'string' ? body.patientId : ''
  const title = typeof body.title === 'string' ? body.title.trim() : 'Información general'
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(patientId) || !text || text.length > 5000 || title.length > 160) return NextResponse.json({ error: 'Paciente, título y observación son obligatorios' }, { status: 400 })
  const { data, error } = await adminClient().from('patient_announcements').insert({ patient_id: patientId, title: title || 'Información general', body: text, purchase_date: typeof body.purchaseDate === 'string' && body.purchaseDate ? body.purchaseDate : null, estimated_amount: typeof body.estimatedAmount === 'number' ? body.estimatedAmount : null, created_by: current.user.id }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ announcement: data })
}

export async function DELETE(request: Request) {
  const current = await identity(request)
  if (!current || current.profile?.role !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Aviso inválido' }, { status: 400 })
  const { error } = await adminClient().from('patient_announcements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
