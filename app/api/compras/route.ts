import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function serviceClient() {
  return createServiceClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireSuperAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const anonClient = createServiceClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await serviceClient().from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'super_admin') return null
  return user
}

// GET — list purchases (super_admin sees all, others see own patient's)
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const anonClient = createServiceClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await anonClient.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })

  const admin = serviceClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()

  let query = admin
    .from('compras')
    .select('id, patient_id, medicine_id, medicine_name, purchased_at, quantity, price_usd, exchange_rate, price_bsf, notes, created_at')
    .order('purchased_at', { ascending: false })

  if (profile?.role !== 'super_admin') {
    // get authorized patient ids
    const { data: relationships } = await admin.from('care_relationships').select('patient_id').eq('caregiver_id', user.id)
    const patientIds = [user.id, ...(relationships ?? []).map(r => r.patient_id)]
    query = query.in('patient_id', patientIds)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ compras: data ?? [] })
}

// POST — register a purchase (super_admin only), auto-updates medicine stock
export async function POST(request: Request) {
  const user = await requireSuperAdmin(request)
  if (!user) return NextResponse.json({ error: 'Solo super_admin puede registrar compras' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const patientId    = typeof body.patient_id    === 'string' ? body.patient_id    : ''
  const medicineId   = typeof body.medicine_id   === 'string' ? body.medicine_id   : null
  const medicineName = typeof body.medicine_name === 'string' ? body.medicine_name.trim() : ''
  const purchasedAt  = typeof body.purchased_at  === 'string' ? body.purchased_at  : ''
  const quantity     = Number(body.quantity)
  const priceUsd     = Number(body.price_usd)
  const exchangeRate = Number(body.exchange_rate)
  const notes        = typeof body.notes         === 'string' ? body.notes.trim() : null
  const manualStock  = body.manual_stock !== undefined ? Number(body.manual_stock) : null

  if (!patientId || !medicineName || !purchasedAt || quantity <= 0 || priceUsd < 0 || exchangeRate <= 0) {
    return NextResponse.json({ error: 'Faltan campos obligatorios o valores inválidos' }, { status: 400 })
  }

  const priceBsf = parseFloat((priceUsd * exchangeRate).toFixed(2))
  const admin = serviceClient()

  // Insert purchase record
  const { data: compra, error: insertError } = await admin.from('compras').insert({
    patient_id:    patientId,
    medicine_id:   medicineId,
    medicine_name: medicineName,
    purchased_at:  purchasedAt,
    quantity,
    price_usd:     priceUsd,
    exchange_rate: exchangeRate,
    price_bsf:     priceBsf,
    notes,
  }).select().single()

  if (insertError || !compra) return NextResponse.json({ error: insertError?.message ?? 'No se pudo registrar la compra' }, { status: 500 })

  // Auto-update medicine stock if medicine_id provided
  if (medicineId) {
    if (manualStock !== null && !isNaN(manualStock) && manualStock >= 0) {
      // Manual override — set stock to explicit value
      await admin.from('medicines').update({ stock: manualStock }).eq('id', medicineId)
    } else {
      // Auto — fetch current stock and add quantity
      const { data: medicine } = await admin.from('medicines').select('stock').eq('id', medicineId).maybeSingle()
      if (medicine) {
        const newStock = Math.max(0, Number(medicine.stock)) + quantity
        await admin.from('medicines').update({ stock: newStock }).eq('id', medicineId)
      }
    }
  }

  return NextResponse.json({ ok: true, compra })
}

// DELETE — remove a purchase (super_admin only)
export async function DELETE(request: Request) {
  const user = await requireSuperAdmin(request)
  if (!user) return NextResponse.json({ error: 'Solo super_admin puede eliminar compras' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  const admin = serviceClient()

  // 1. Obtener datos antes de borrar para saber cuánto restar
  const { data: compra } = await admin.from('compras').select('medicine_id, quantity').eq('id', id).maybeSingle()

  // 2. Eliminar compra
  const { error } = await admin.from('compras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 3. Restar stock del inventario
  if (compra && compra.medicine_id) {
    const { data: medicine } = await admin.from('medicines').select('stock').eq('id', compra.medicine_id).maybeSingle()
    if (medicine) {
      const newStock = Math.max(0, Number(medicine.stock) - Number(compra.quantity))
      await admin.from('medicines').update({ stock: newStock }).eq('id', compra.medicine_id)
    }
  }

  return NextResponse.json({ ok: true })
}

// PATCH — edit a purchase record (super_admin only)
export async function PATCH(request: Request) {
  const user = await requireSuperAdmin(request)
  if (!user) return NextResponse.json({ error: 'Solo super_admin puede editar compras' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const id            = typeof body.id            === 'string' ? body.id            : ''
  const medicineName  = typeof body.medicine_name === 'string' ? body.medicine_name.trim() : ''
  const purchasedAt   = typeof body.purchased_at  === 'string' ? body.purchased_at  : ''
  const quantity      = Number(body.quantity)
  const priceUsd      = Number(body.price_usd)
  const exchangeRate  = Number(body.exchange_rate)
  const notes         = typeof body.notes         === 'string' ? body.notes.trim() || null : null

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  if (!medicineName || !purchasedAt || quantity <= 0 || priceUsd < 0 || exchangeRate <= 0) {
    return NextResponse.json({ error: 'Faltan campos obligatorios o valores inválidos' }, { status: 400 })
  }

  const priceBsf = parseFloat((priceUsd * exchangeRate).toFixed(2))
  const admin = serviceClient()

  // Obtener compra antigua para calcular diferencia (delta) de stock
  const { data: oldCompra } = await admin.from('compras').select('medicine_id, quantity').eq('id', id).maybeSingle()

  const { data, error } = await admin
    .from('compras')
    .update({ medicine_name: medicineName, purchased_at: purchasedAt, quantity, price_usd: priceUsd, exchange_rate: exchangeRate, price_bsf: priceBsf, notes })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'No se pudo actualizar la compra' }, { status: 500 })

  // Auto-ajustar stock si cambió la cantidad
  if (oldCompra && oldCompra.medicine_id && oldCompra.quantity !== quantity) {
    const delta = quantity - Number(oldCompra.quantity)
    const { data: medicine } = await admin.from('medicines').select('stock').eq('id', oldCompra.medicine_id).maybeSingle()
    if (medicine) {
      const newStock = Math.max(0, Number(medicine.stock) + delta)
      await admin.from('medicines').update({ stock: newStock }).eq('id', oldCompra.medicine_id)
    }
  }

  return NextResponse.json({ ok: true, compra: data })
}
