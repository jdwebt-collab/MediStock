import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function serviceClient() {
  return createServiceClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

function validEmail(value: unknown) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validName(value: unknown) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 120
}

async function requireUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const client = createServiceClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user } } = await client.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await serviceClient().from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
  return { user, profile }
}

async function requireAdmin(request: Request) {
  const identity = await requireUser(request)
  return identity?.profile?.role === 'super_admin' ? identity.user : null
}

export async function GET(request: Request) {
  const identity = await requireUser(request)
  if (!identity) return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 })
  const admin = serviceClient()
  if (identity.profile?.role !== 'super_admin') {
    const { data: relationships, error: relationshipError } = await admin.from('care_relationships').select('patient_id').eq('caregiver_id', identity.user.id)
    if (relationshipError) return NextResponse.json({ error: `No se pudieron cargar las relaciones: ${relationshipError.message}` }, { status: 500 })
    const patientIds = [identity.user.id, ...(relationships ?? []).map((relationship) => relationship.patient_id)]
    const [{ data: medicines, error }, { data: patients, error: patientsError }, { data: announcements, error: announcementsError }] = await Promise.all([
      admin.from('medicines').select('id, patient_id, name, brand, dose, stock, daily_doses, unit, essential').in('patient_id', patientIds).order('name'),
      admin.from('profiles').select('id, full_name, role').in('id', patientIds),
      admin.from('patient_announcements').select('id, patient_id, title, body, purchase_date, estimated_amount, created_at').in('patient_id', patientIds).order('created_at', { ascending: false }),
    ])
    if (error || patientsError || announcementsError) return NextResponse.json({ error: `No se pudo cargar la información familiar: ${error?.message ?? patientsError?.message ?? announcementsError?.message}` }, { status: 500 })
    return NextResponse.json({ profile: identity.profile, medicines: medicines ?? [], patients: patients ?? [], announcements: announcements ?? [], patientIds })
  }
  const { data, error } = await admin.from('profiles').select('id, full_name, role, created_at').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'No se pudieron cargar los usuarios' }, { status: 500 })
  const users = await Promise.all((data ?? []).map(async (profile) => {
    const { data: authData } = await admin.auth.admin.getUserById(profile.id)
    return { ...profile, email: authData.user?.email ?? '' }
  }))
  const { data: medicines, error: medicinesError } = await admin
    .from('medicines')
    .select('id, patient_id, name, brand, dose, stock, daily_doses, unit, essential')
    .order('name')
  if (medicinesError) return NextResponse.json({ error: 'No se pudo cargar el inventario administrativo' }, { status: 500 })
  return NextResponse.json({ profile: identity.profile, users, medicines: medicines ?? [] })
}

export async function POST(request: Request) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const role = ['patient', 'family', 'caregiver'].includes(String(body.role)) ? String(body.role) : 'family'
  if (!validEmail(email) || !validName(fullName) || password.length < 8 || password.length > 128) return NextResponse.json({ error: 'Nombre, correo válido y una clave de 8 a 128 caracteres son obligatorios' }, { status: 400 })
  const admin = serviceClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, role } })
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'No se pudo crear el usuario' }, { status: 400 })
  await admin.from('profiles').upsert({ id: data.user.id, full_name: fullName, role })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  if (typeof body.medicineId === 'string') {
    const stock = Number(body.stock)
    const dailyDoses = Number(body.dailyDoses)
    if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(dailyDoses) || dailyDoses <= 0) return NextResponse.json({ error: 'Stock y dosis diarias deben ser válidos' }, { status: 400 })
    const admin = serviceClient()
    const { data, error } = await admin.from('medicines').update({ stock: Math.floor(stock), daily_doses: dailyDoses }).eq('id', body.medicineId).select('id, patient_id, name, brand, dose, stock, daily_doses, unit, essential').single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'No se pudo actualizar el medicamento' }, { status: 500 })
    return NextResponse.json({ ok: true, medicine: data })
  }
  const id = typeof body.id === 'string' ? body.id : ''
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const role = ['patient', 'family', 'caregiver'].includes(String(body.role)) ? String(body.role) : 'family'
  if (!/^[0-9a-f-]{36}$/i.test(id) || !validName(fullName)) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  const admin = serviceClient()
  const { data: targetProfile, error: targetError } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
  if (targetError || !targetProfile) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  const targetIsSuperAdmin = targetProfile.role === 'super_admin'
  const updates: { email?: string; password?: string; email_confirm?: boolean; user_metadata?: Record<string, string> } = { user_metadata: { full_name: fullName, role: targetIsSuperAdmin ? 'super_admin' : role } }
  if (body.email !== undefined) {
    if (!validEmail(body.email)) return NextResponse.json({ error: 'Correo inválido' }, { status: 400 })
    updates.email = String(body.email).trim().toLowerCase()
    updates.email_confirm = true
  }
  if (body.password) { if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) return NextResponse.json({ error: 'La clave debe tener entre 8 y 128 caracteres' }, { status: 400 }); updates.password = body.password }
  const { data: authUpdated, error: authError } = await admin.auth.admin.updateUserById(id, updates)
  if (authError || !authUpdated.user) return NextResponse.json({ error: authError?.message ?? 'Supabase no confirmó la actualización del usuario' }, { status: 400 })
  const savedRole = targetIsSuperAdmin ? 'super_admin' : role
  const { data: updatedProfile, error } = await admin.from('profiles').upsert({ id, full_name: fullName, role: savedRole, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select('id, full_name, role').single()
  if (error || !updatedProfile) return NextResponse.json({ error: error?.message ?? 'Supabase no devolvió el perfil actualizado' }, { status: 500 })
  const { data: updatedAuth } = await admin.auth.admin.getUserById(id)
  if (!updatedAuth.user) return NextResponse.json({ error: 'El perfil cambió, pero no se pudo verificar Auth' }, { status: 500 })
  return NextResponse.json({ ok: true, verified: { profile: updatedProfile, email: updatedAuth.user.email, name: updatedAuth.user.user_metadata?.full_name ?? '' }, user: { ...updatedProfile, email: updatedAuth.user.email } })
}

export async function DELETE(request: Request) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  const id = typeof body.id === 'string' ? body.id : ''
  const actor = await requireAdmin(request)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !actor || id === actor.id) return NextResponse.json({ error: 'No se puede eliminar este usuario' }, { status: 400 })
  const admin = serviceClient()
  const { data: target } = await admin.from('profiles').select('role').eq('id', id).maybeSingle()
  if (target?.role === 'super_admin') return NextResponse.json({ error: 'No se puede eliminar a otro super administrador' }, { status: 403 })
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: 'No se pudo eliminar el usuario' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
