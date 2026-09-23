'use client'

import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, Bell, Download, FileSpreadsheet, KeyRound, LogOut, Mail, Package, Pill, Search, ShieldCheck, Users } from 'lucide-react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'

type Medicine = { id: string; patient_id: string; name: string; brand: string | null; dose: string; stock: number; daily_doses: number; unit: string; essential: boolean; updated_at?: string }
type Profile = { full_name: string; role: string }
type Announcement = { id: string; patient_id: string; title: string; body: string; purchase_date: string | null; estimated_amount: number | null; created_at: string }
type Compra = { id: string; patient_id: string; medicine_id: string | null; medicine_name: string; purchased_at: string; quantity: number; price_usd: number; exchange_rate: number; price_bsf: number; notes: string | null; created_at: string }

const treatment = [
  ['Trayenta', '5 mg', 87, true], ['Metoprolol', '50 mg (½)', 225, true], ['Amlodipino', '5 mg', 131, true],
  ['Dapagliflozina', '10 mg', 95, true], ['Aspirina', '81 mg', 131, false], ['Hidroclorotiazida', '12,5 mg (½)', 139, false],
] as const

function getExhaustionDate(estimatedStock: number, dailyDoses: number) {
  const daysLeft = estimatedStock / Math.max(Number(dailyDoses), 0.01)
  const date = new Date()
  date.setDate(date.getDate() + Math.floor(daysLeft))
  return date
}

function getEstimatedStock(medicine: Medicine) {
  if (!medicine.updated_at) return Number(medicine.stock)
  const msPassed = Date.now() - new Date(medicine.updated_at).getTime()
  const daysPassed = Math.floor(Math.max(0, msPassed) / (1000 * 60 * 60 * 24))
  const estimated = Number(medicine.stock) - (daysPassed * Number(medicine.daily_doses))
  return Math.max(0, estimated)
}

function getStatus(medicine: Medicine) {
  const stockToUse = getEstimatedStock(medicine)
  const days = stockToUse / Math.max(Number(medicine.daily_doses), 0.01)
  return days < 60 ? ['Crítico', 'bg-rose-50 text-rose-700'] : days < 90 ? ['Reabastecer', 'bg-amber-50 text-amber-700'] : ['En stock', 'bg-emerald-50 text-emerald-700']
}

export default function Page() {
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'inventory' | 'admin' | 'compras' | 'settings'>('inventory')
  const [compras, setCompras] = useState<Compra[]>([])
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [fullName, setFullName] = useState('')
  const [newPassword, setNewPassword] = useState(''); const [newEmail, setNewEmail] = useState('')
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [patientNames, setPatientNames] = useState<Record<string, string>>({})
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isSignUp, setIsSignUp] = useState(false); const [loading, setLoading] = useState(true); const [message, setMessage] = useState('')

  useEffect(() => setSupabase(createClient()), [])
  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return
      if (data.user) { setUser({ id: data.user.id, email: data.user.email }); setNewEmail(data.user.email ?? ''); await loadData(data.user.id) }
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) { setUser({ id: session.user.id, email: session.user.email }); setNewEmail(session.user.email ?? ''); await loadData(session.user.id) }
      else { setUser(null); setProfile(null); setMedicines([]); setAnnouncements([]); setPatientNames({}) }
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [supabase])

  async function loadAdminUsers() {
    const { data: sessionData } = await supabase?.auth.getSession() ?? { data: { session: null } }
    const response = await fetch('/api/admin/users', { headers: sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : undefined })
    if (response.ok) {
      const result = await response.json()
      setAdminUsers(result.users ?? [])
      if (Array.isArray(result.medicines)) setMedicines(result.medicines as Medicine[])
      setPatientNames(Object.fromEntries((result.users ?? []).map((item: any) => [item.id, item.full_name ?? item.email ?? 'Usuario'])))
    }
  }

  async function loadAnnouncements() {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } }
    const response = await fetch('/api/announcements', { headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : undefined })
    if (response.ok) setAnnouncements((await response.json()).announcements ?? [])
  }

  async function loadCompras() {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } }
    if (!data.session?.access_token) return
    const response = await fetch('/api/compras', { headers: { Authorization: `Bearer ${data.session.access_token}` } })
    if (response.ok) setCompras((await response.json()).compras ?? [])
  }

  async function compraAction(method: string, payload: any) {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } }
    const response = await fetch('/api/compras', { method, headers: { 'Content-Type': 'application/json', ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify(payload) })
    const result = await response.json()
    if (response.ok) {
      setMessage(method === 'POST' ? 'Compra registrada. Stock actualizado.' : 'Compra eliminada.')
      await loadCompras()
      await loadData(user?.id ?? '')
    } else {
      setMessage(result.error ?? 'No se pudo completar la operación.')
    }
    return response.ok
  }

  async function announcementAction(method: string, payload: any) {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } }
    const response = await fetch('/api/announcements', { method, headers: { 'Content-Type': 'application/json', ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify(payload) })
    const result = await response.json()
    if (response.ok) { setMessage(method === 'POST' ? 'Información publicada para los usuarios autorizados.' : 'Información eliminada.'); await loadAnnouncements()
    await loadCompras() }
    else setMessage(result.error ?? 'No se pudo guardar la información.')
    return response.ok
  }

  async function medicineAction(payload: { medicineId: string; stock: number; dailyDoses: number }) {
    const { data: sessionData } = await supabase?.auth.getSession() ?? { data: { session: null } }
    const response = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}) }, body: JSON.stringify(payload) })
    const result = await response.json()
    if (response.ok && result.medicine) { setMedicines((current) => current.map((item) => item.id === result.medicine.id ? result.medicine : item)); setMessage('Inventario actualizado en Supabase.') } else setMessage(result.error ?? 'No se pudo actualizar el inventario.')
    return response.ok
  }

  async function adminUserAction(method: string, payload: any) {
    const { data: sessionData } = await supabase?.auth.getSession() ?? { data: { session: null } }
    const response = await fetch('/api/admin/users', { method, headers: { 'Content-Type': 'application/json', ...(sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}) }, body: JSON.stringify(payload) })
    const result = await response.json()
    setMessage(response.ok ? `Guardado confirmado en Supabase: ${result.verified?.profile?.full_name ?? ''} · ${result.verified?.email ?? ''}` : result.error ?? `No se pudo completar la operación (${response.status}).`)
    if (response.ok) {
      setAdminUsers((current) => current.map((item) => item.id === result.user?.id ? { ...item, ...result.user } : item))
      if (result.user?.id === user?.id) setProfile({ full_name: result.user.full_name, role: result.user.role })
      await loadAdminUsers()
    }
    return response.ok
  }

  async function loadData(userId: string) {
    if (!supabase) return
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) { setMessage('La sesión de Supabase expiró. Vuelve a ingresar.'); return }
    const response = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
    const result = await response.json()
    if (!response.ok) { setMessage(result.error ?? 'No se pudieron cargar los datos de Supabase.'); return }
    const profileData = result.profile ?? (result.users ?? []).find((item: any) => item.id === userId)
    if (profileData) setProfile({ full_name: profileData.full_name ?? '', role: profileData.role })
    await loadAnnouncements()
    const isAdmin = profileData?.role === 'super_admin'
    if (isAdmin) {
      setAdminUsers(result.users ?? [])
      setPatientNames(Object.fromEntries((result.users ?? []).map((item: any) => [item.id, item.full_name ?? item.email ?? 'Usuario'])))
      setMedicines((result.medicines ?? []) as Medicine[])
      return
    }
    if (Array.isArray(result.patients)) setPatientNames(Object.fromEntries(result.patients.map((item: any) => [item.id, item.full_name ?? 'Paciente'])))
    if (Array.isArray(result.announcements)) setAnnouncements(result.announcements as Announcement[])
    let rows = (result.medicines ?? []) as Medicine[]
    if (!isAdmin && profileData?.role === 'patient' && rows.length === 0) {
      const seeded = treatment.map(([name, dose, stock, essential]) => ({ patient_id: userId, name, brand: name, dose, daily_doses: 1, unit: 'tabletas', essential, stock, reorder_days: 90 }))
      const result = await supabase.from('medicines').insert(seeded).select('id, patient_id, name, brand, dose, stock, daily_doses, unit, essential')
      if (!result.error) rows = (result.data ?? []) as Medicine[]
    }
    setMedicines(rows)
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault(); if (!supabase) return; setLoading(true); setMessage('')
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, role: 'patient' }, emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback` } })
      : await supabase.auth.signInWithPassword({ email, password })

    if (result.error) {
      setMessage(result.error.message.includes('rate limit') ? 'Supabase limitó temporalmente los correos. Espera unos minutos o usa un correo de prueba nuevo.' : result.error.message.includes('Invalid') ? 'Correo o clave incorrectos.' : result.error.message.includes('confirm') ? 'Supabase aún exige confirmar este correo. Desactiva “Confirm email” y crea una cuenta nueva.' : result.error.message)
    } else if (isSignUp && !result.data.session) {
      // When email confirmation is disabled, Supabase should return a session.
      // Retrying with the submitted credentials also handles projects where the
      // setting was changed after the signup request was created.
      const retry = await supabase.auth.signInWithPassword({ email, password })
      if (retry.error) setMessage(retry.error.message.includes('confirm') ? 'Supabase aún exige confirmar este correo. Elimina esta cuenta de prueba y créala nuevamente después de desactivar “Confirm email”.' : 'La cuenta fue creada, pero Supabase no inició sesión automáticamente.')
    } else if (isSignUp && result.data.session) {
      setMessage('Cuenta creada correctamente. Ya puedes usar MediStock.')
    }
    setLoading(false)
  }
  async function changePassword(event: FormEvent) { event.preventDefault(); if (!supabase || newPassword.length < 6) return setMessage('La nueva clave debe tener al menos 6 caracteres.'); const { error } = await supabase.auth.updateUser({ password: newPassword }); setMessage(error ? 'No se pudo cambiar la clave.' : 'Clave actualizada correctamente.'); if (!error) setNewPassword('') }
  async function changeEmail(event: FormEvent) { event.preventDefault(); if (!supabase || !newEmail || newEmail === user?.email) return setMessage('Escribe un correo nuevo diferente al actual.'); const { error } = await supabase.auth.updateUser({ email: newEmail }); setMessage(error ? 'No se pudo cambiar el correo.' : 'Solicitud enviada. Revisa el correo actual y el nuevo para confirmar el cambio.'); if (!error) setNewEmail('') }
  async function signOut() { await supabase?.auth.signOut() }
  function exportInventory() {
    const invHeaders = ['Medicamento', 'Marca', 'Dosis', 'Dosis diarias', 'Unidad', 'Stock guardado', 'Estimado hoy', 'Días restantes', 'Estado']
    const invRows = medicines.map((medicine) => {
      const estimated = getEstimatedStock(medicine)
      const days = estimated / Math.max(Number(medicine.daily_doses), 0.01)
      const status = days < 60 ? 'Crítico' : days < 90 ? 'Reabastecer' : 'En stock'
      return [medicine.name, medicine.brand ?? '', medicine.dose, medicine.daily_doses, medicine.unit, medicine.stock, estimated, Math.floor(days), status]
    })
    const comprasHeaders = ['Medicamento', 'Fecha', 'Unidades', 'Precio USD', 'Tasa BCV', 'Precio Bs.S', 'Notas', 'Registrado']
    const comprasRows = compras.map(c => [c.medicine_name, c.purchased_at, c.quantity, c.price_usd, c.exchange_rate, c.price_bsf, c.notes ?? '', new Date(c.created_at).toLocaleDateString('es-ES')])
    const workbook = XLSX.utils.book_new()
    const wsInv = XLSX.utils.aoa_to_sheet([invHeaders, ...invRows])
    wsInv['!cols'] = invHeaders.map((h, i) => ({ wch: Math.max(h.length + 2, ...invRows.map(r => String(r[i] ?? '').length + 2), 12) }))
    wsInv['!autofilter'] = { ref: `A1:I${invRows.length + 1}` }
    wsInv['!freeze'] = { xSplit: 0, ySplit: 1 }
    XLSX.utils.book_append_sheet(workbook, wsInv, 'Inventario')
    if (compras.length > 0) {
      const wsCompras = XLSX.utils.aoa_to_sheet([comprasHeaders, ...comprasRows])
      wsCompras['!cols'] = comprasHeaders.map((h, i) => ({ wch: Math.max(h.length + 2, ...comprasRows.map(r => String(r[i] ?? '').length + 2), 12) }))
      wsCompras['!freeze'] = { xSplit: 0, ySplit: 1 }
      XLSX.utils.book_append_sheet(workbook, wsCompras, 'Compras')
    }
    XLSX.writeFile(workbook, `medistock-backup-${new Date().toISOString().slice(0, 10)}.xlsx`)
    setMessage('Backup completo exportado: Inventario + Compras en Excel.')
  }

  const isAdmin = profile?.role === 'super_admin'



  if (loading && !user) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Cargando MediStock…</main>
  if (!user) return <AuthScreen {...{ email, setEmail, password, setPassword, fullName, setFullName, isSignUp, setIsSignUp, message, loading, handleAuth }} />

  const visible = medicines.filter(m => `${m.name} ${m.brand ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const alerts = medicines.filter(m => getEstimatedStock(m) / Math.max(Number(m.daily_doses), 0.01) < 90)
  
  const needPurchase = medicines
    .map(m => {
      const est = getEstimatedStock(m)
      const days = est / Math.max(Number(m.daily_doses), 0.01)
      return { ...m, est, days }
    })
    .filter(m => m.days < 90)
    .sort((a, b) => a.days - b.days)
  
  const nextPurchaseDate = needPurchase.length > 0 ? getExhaustionDate(needPurchase[0].est, needPurchase[0].daily_doses) : null
  const name = profile?.full_name ?? user.email?.split('@')[0] ?? 'usuario'

  return <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
  <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-teal-600 text-white"><Pill /></div><div><p className="font-bold">MediStock</p><p className="text-xs text-slate-400">Cuidado compartido</p></div></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{name}</p><p className="text-xs text-slate-400">{isAdmin ? 'Super administrador' : profile?.role === 'patient' ? 'Paciente' : 'Familiar autorizado'}</p></div><button onClick={signOut} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><LogOut /> Salir</button></div></div></header>
  {alerts.length > 0 && <section className={alerts.some((medicine) => getEstimatedStock(medicine) / Math.max(Number(medicine.daily_doses), 0.01) < 60) ? 'border-b border-rose-200 bg-rose-50' : 'border-b border-amber-200 bg-amber-50'}><div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3"><div className={alerts.some((medicine) => getEstimatedStock(medicine) / Math.max(Number(medicine.daily_doses), 0.01) < 60) ? 'relative flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm' : 'relative flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm'}><Bell className="size-5" aria-hidden="true" style={{ animation: 'medistock-bell 2.8s ease-in-out infinite' }} /><span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-white ring-2 ring-current" /></div><div className="min-w-0"><p className={alerts.some((medicine) => getEstimatedStock(medicine) / Math.max(Number(medicine.daily_doses), 0.01) < 60) ? 'text-xs font-bold uppercase tracking-[0.14em] text-rose-700' : 'text-xs font-bold uppercase tracking-[0.14em] text-amber-700'}>Medicina necesaria</p><p className={alerts.some((medicine) => getEstimatedStock(medicine) / Math.max(Number(medicine.daily_doses), 0.01) < 60) ? 'text-sm font-semibold text-rose-950' : 'text-sm font-semibold text-amber-950'}>{alerts.length === 1 ? 'Hay 1 medicamento que requiere atención.' : `Hay ${alerts.length} medicamentos que requieren atención.`}</p><p className="text-xs text-rose-800">Revisa el inventario para planificar la próxima compra.</p></div><div className="ml-auto hidden shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-rose-700 sm:block">{alerts.filter((medicine) => getEstimatedStock(medicine) / Math.max(Number(medicine.daily_doses), 0.01) < 60).length > 0 ? 'Prioridad alta' : 'Próxima compra'}</div></div></section>}

  <div className="mx-auto max-w-6xl px-5 py-8">
    <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-600">{isAdmin ? 'Administración' : 'Panel de control'}</p><h1 className="mt-2 text-3xl font-bold">Hola, {name}</h1><p className="mt-2 text-sm text-slate-500">{isAdmin ? 'Vista global de pacientes y tratamientos.' : 'Inventario privado conectado a Supabase.'}</p></div>
    
    {message && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</div>}

    <div className="mb-6 flex gap-4 border-b border-slate-200">
      <button onClick={() => setActiveTab('inventory')} className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Inventario</button>
      {isAdmin && <button onClick={() => setActiveTab('admin')} className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'admin' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Administración</button>}
      {isAdmin && <button onClick={() => setActiveTab('compras')} className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'compras' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Compras</button>}
      <button onClick={() => setActiveTab('settings')} className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'settings' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Configuración</button>
    </div>

    {activeTab === 'inventory' && (
      <div className="animate-in fade-in duration-300">
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3"><Metric icon={<Package />} label="Medicamentos" value={String(medicines.length)} /><Metric icon={<AlertTriangle />} label="Por reabastecer" value={String(alerts.length)} /><Metric icon={isAdmin ? <ShieldCheck /> : <Users />} label={isAdmin ? 'Rol seguro' : 'Acceso familiar'} value={isAdmin ? 'Activo' : 'Protegido'} /></div>
        {needPurchase.length > 0 && nextPurchaseDate && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <h2 className="mb-2 font-bold text-blue-900 flex items-center gap-2">
              <Package className="size-5" /> Sugerencia automática de compra
            </h2>
            <p className="text-sm text-blue-800">
              Según el ritmo de consumo, la próxima compra debe realizarse antes del <strong>{nextPurchaseDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> para los siguientes medicamentos:
            </p>
            <ul className="mt-2 list-inside list-disc text-sm font-semibold text-blue-900">
              {needPurchase.map(m => (
                <li key={m.id}>{m.name} {m.brand ? `(${m.brand})` : ''} - Quedan aprox. {Math.floor(m.days)} días</li>
              ))}
            </ul>
          </div>
        )}
        <Announcements announcements={announcements} patientNames={patientNames} isAdmin={isAdmin} onDelete={announcementAction} />
        <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-teal-100 bg-teal-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-teal-800"><FileSpreadsheet /><h2 className="font-bold">Respaldo del inventario</h2></div><p className="mt-1 text-sm text-teal-700">Descarga el inventario actual en formato compatible con Excel cuando lo necesites.</p></div><button onClick={exportInventory} className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700"><Download /> Exportar Excel</button></section>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Inventario actual</h2><p className="text-sm text-slate-500">Tratamiento y existencias registradas</p></div><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><Search /><span className="sr-only">Buscar medicamento</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar" className="w-full outline-none" /></label></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4">Medicamento</th><th className="p-4">Dosis</th><th className="p-4">Stock guardado</th><th className="p-4 font-bold text-slate-700">Estimado hoy</th><th className="p-4">Días restantes</th><th className="p-4 table-cell">Proyección (+1 Mes)</th><th className="p-4">Estado</th></tr></thead><tbody>{visible.map(m => { const [label, color] = getStatus(m); const estimated = getEstimatedStock(m); return <tr key={m.id} className="border-t border-slate-100"><td className="p-4 font-semibold">{m.name}</td><td className="p-4">{m.dose}</td><td className="p-4 text-slate-400">{m.stock} {m.unit}</td><td className="p-4 font-bold text-slate-700">{estimated} {m.unit}</td><td className="p-4"><span className="block font-bold">{Math.floor(estimated / Math.max(Number(m.daily_doses), 0.01))} días</span><span className="text-xs text-slate-500">Aprox. {getExhaustionDate(estimated, m.daily_doses).toLocaleDateString('es-ES')}</span></td><td className="p-4 table-cell"><span className="block font-semibold">{(estimated + (30 * m.daily_doses)).toFixed(0)} {m.unit}</span><span className="text-xs text-slate-500">Duraría hasta {getExhaustionDate(estimated + (30 * m.daily_doses), m.daily_doses).toLocaleDateString('es-ES')}</span></td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{label}</span></td></tr> })}</tbody></table>{visible.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No hay medicamentos para mostrar.</p>}</div></section>
      </div>
    )}

    {activeTab === 'admin' && isAdmin && (
      <div className="animate-in fade-in duration-300 space-y-6">
        <AdminUsers users={adminUsers} onAction={adminUserAction} />
        <AdminAnnouncements users={adminUsers} announcements={announcements} onAction={announcementAction} />
        <AdminInventory medicines={medicines} patientNames={patientNames} onUpdate={medicineAction} />
      </div>
    )}

    {activeTab === 'compras' && isAdmin && (
      <div className="animate-in fade-in duration-300">
        <ComprasTab medicines={medicines} compras={compras} patientNames={patientNames} onAction={compraAction} />
      </div>
    )}

    {activeTab === 'settings' && (
      <div className="animate-in fade-in duration-300 mt-6 grid gap-6 lg:grid-cols-2">
        <AccountCard icon={<KeyRound />} title="Cambiar clave"><form onSubmit={changePassword} className="flex gap-3"><input required minLength={6} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nueva clave" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-teal-500" /><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Guardar</button></form></AccountCard>
        <AccountCard icon={<Mail />} title="Modificar correo"><p className="mb-3 text-xs text-slate-500">Correo actual: {user.email}</p><form onSubmit={changeEmail} className="flex gap-3"><input required type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Nuevo correo" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-teal-500" /><button className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">Solicitar cambio</button></form><p className="mt-3 text-xs text-slate-400">Supabase pedirá confirmar ambos correos por seguridad.</p></AccountCard>
      </div>
    )}
  </div>
</main>
}

function AdminAnnouncements({ users, announcements, onAction }: { users: any[]; announcements: Announcement[]; onAction: (method: string, payload: any) => Promise<boolean> }) {
  const patients = users.filter((item) => ['patient', 'family', 'caregiver'].includes(item.role))
  const [form, setForm] = useState({ patientId: '', title: 'Información general', body: '', purchaseDate: '', estimatedAmount: '' })
  async function submit(event: FormEvent) { event.preventDefault(); const saved = await onAction('POST', { ...form, estimatedAmount: form.estimatedAmount ? Number(form.estimatedAmount) : null }); if (saved) setForm({ patientId: '', title: 'Información general', body: '', purchaseDate: '', estimatedAmount: '' }) }
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"><div className="mb-4"><h2 className="font-bold">Información general para familiares</h2><p className="text-sm text-slate-600">Publica fechas de compra, precios estimados y observaciones visibles para los usuarios autorizados.</p></div><form onSubmit={submit} className="grid gap-3 rounded-xl border border-amber-100 bg-white p-4 md:grid-cols-2"><select required value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Seleccionar paciente</option>{patients.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input type="number" min="0" step="0.01" value={form.estimatedAmount} onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })} placeholder="Monto estimado" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><textarea required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Ej.: PRÓXIMA COMPRA EL 31/10/26: 1 TRAYENTA..." className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" /><button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white md:col-span-2">Publicar información</button></form></section>
}

function Announcements({ announcements, patientNames, isAdmin, onDelete }: { announcements: Announcement[]; patientNames: Record<string, string>; isAdmin: boolean; onDelete: (method: string, payload: any) => Promise<boolean> }) {
    if (!announcements.length) return null
  return <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="mb-3 flex items-center gap-2"><AlertTriangle className="text-amber-700" /><h2 className="font-bold text-amber-900">Información general</h2></div><div className="space-y-3">{announcements.map((item) => <article key={item.id} className="rounded-xl border border-amber-100 bg-white p-4"><div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold">{item.title}</h3>{isAdmin && <p className="text-xs text-slate-500">Paciente: {patientNames[item.patient_id] ?? item.patient_id}</p>}</div>{isAdmin && <button onClick={() => void onDelete('DELETE', { id: item.id })} className="text-xs font-semibold text-rose-700">Eliminar</button>}</div><p className="mt-2 whitespace-pre-line text-sm text-slate-700">{item.body}</p>{(item.purchase_date || item.estimated_amount !== null) && <p className="mt-3 text-xs font-semibold text-amber-800">{item.purchase_date ? `Próxima compra: ${new Date(`${item.purchase_date}T00:00:00`).toLocaleDateString('es-ES')}` : ''}{item.purchase_date && item.estimated_amount !== null ? ' · ' : ''}{item.estimated_amount !== null ? `Monto estimado: ${item.estimated_amount}` : ''}</p>}</article>)}</div></section>
}

/* function AdminInventory({ medicines, patientNames, onUpdate }: any) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ stock: '', dailyDoses: '' })
  async function save(medicine: Medicine) { const saved = await onUpdate({ medicineId: medicine.id, stock: Number(draft.stock), dailyDoses: Number(draft.dailyDoses) }); if (saved) { setEditing(null); setDraft({ stock: '', dailyDoses: '' }) } }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Inventario global</h2><p className="text-sm text-slate-500">Medicamentos de todos los pacientes y tratamientos. El superadmin puede actualizar existencias.</p></div><span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">{medicines.length} registros</span></div>{medicines.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No hay medicamentos visibles. Verifica las políticas RLS del inventario.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Medicamento</th><th className="px-4 py-3">Dosis</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{medicines.map((medicine) => { const days = Number(medicine.stock) / Math.max(Number(medicine.daily_doses), 0.01); const isEditing = editing === medicine.id; return <tr key={medicine.id}><td className="px-4 py-3 font-medium">{patientNames[medicine.patient_id] ?? 'Paciente no identificado'}</td><td className="px-4 py-3">{medicine.name}<span className="ml-2 text-slate-400">{medicine.brand}</span></td><td className="px-4 py-3">{isEditing ? <input type="number" min="0.01" step="0.01" value={draft.dailyDoses} onChange={(e) => setDraft({ ...draft, dailyDoses: e.target.value })} className="w-20 rounded border px-2 py-1" /> : medicine.dose}</td><td className="px-4 py-3">{isEditing ? <input type="number" min="0" step="1" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} className="w-20 rounded border px-2 py-1" /> : `${medicine.stock} ${medicine.unit}`}</td><td className="px-4 py-3"><span className={days < 60 ? 'font-semibold text-rose-600' : days < 90 ? 'font-semibold text-amber-600' : 'font-semibold text-emerald-600'}>{days < 60 ? 'Crítico' : days < 90 ? 'Reabastecer' : 'En stock'}</span></td><td className="px-4 py-3">{isEditing ? <div className="flex gap-2"><button onClick={() => void save(medicine)} className="font-semibold text-teal-700">Guardar</button><button onClick={() => setEditing(null)} className="text-slate-500">Cancelar</button></div> : <button onClick={() => { setEditing(medicine.id); setDraft({ stock: String(medicine.stock), dailyDoses: String(medicine.daily_doses) }) }} className="font-semibold text-teal-700">Editar stock</button>}</td></tr> })}</tbody></table></div>}</section>
}
*/

function AdminInventory({ medicines, patientNames, onUpdate }: any) {
  const [editing, setEditing] = useState<string | null>(null)
  const [stock, setStock] = useState('')
  const [dailyDoses, setDailyDoses] = useState('')
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Inventario global</h2><p className="mb-4 text-sm text-slate-500">Edita las existencias directamente desde esta tabla.</p><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Medicamento</th><th className="px-4 py-3">Stock guardado</th><th className="px-4 py-3 font-bold">Estimado hoy</th><th className="px-4 py-3">Dosis diarias</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y">{medicines.map((medicine: Medicine) => editing === medicine.id ? <tr key={medicine.id}><td className="px-4 py-3">{patientNames[medicine.patient_id] ?? 'Paciente'}</td><td className="px-4 py-3">{medicine.name}</td><td className="px-4 py-3"><input type="number" min="0" value={stock} onChange={(event) => setStock(event.target.value)} className="w-24 rounded border px-2 py-1" /></td><td className="px-4 py-3 font-bold text-slate-700">--</td><td className="px-4 py-3"><input type="number" min="0.01" step="0.01" value={dailyDoses} onChange={(event) => setDailyDoses(event.target.value)} className="w-24 rounded border px-2 py-1" /></td><td className="px-4 py-3"><button onClick={() => void onUpdate({ medicineId: medicine.id, stock: Number(stock), dailyDoses: Number(dailyDoses) }).then((saved: boolean) => { if (saved) setEditing(null) })} className="font-semibold text-teal-700">Guardar</button></td></tr> : <tr key={medicine.id}><td className="px-4 py-3">{patientNames[medicine.patient_id] ?? 'Paciente'}</td><td className="px-4 py-3">{medicine.name}</td><td className="px-4 py-3 text-slate-400">{medicine.stock} {medicine.unit}</td><td className="px-4 py-3 font-bold text-slate-700">{Math.max(0, Number(medicine.stock) - (Math.floor(Math.max(0, Date.now() - new Date(medicine.updated_at || Date.now()).getTime()) / 86400000) * Number(medicine.daily_doses)))} {medicine.unit}</td><td className="px-4 py-3">{medicine.daily_doses}</td><td className="px-4 py-3"><button onClick={() => { setEditing(medicine.id); setStock(String(medicine.stock)); setDailyDoses(String(medicine.daily_doses)) }} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white">Editar stock</button></td></tr>)}</tbody></table></div></section>
}

function AdminUsers({ users, onAction }: { users: any[]; onAction: (method: string, payload: any) => Promise<boolean> }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'family' })
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); const saved = await onAction(editing ? 'PATCH' : 'POST', editing ? { id: editing, ...form } : form); if (saved) { setNotice('Cambios guardados en Supabase.'); setForm({ fullName: '', email: '', password: '', role: 'family' }); setEditing(null) } }
  return <section className="rounded-2xl border border-teal-100 bg-teal-50 p-5 shadow-sm"><div className="mb-4 flex items-center gap-3"><Users className="text-teal-700" /><div><h2 className="font-bold">Usuarios y familiares</h2><p className="text-sm text-slate-600">El super administrador crea, edita y elimina accesos sin confirmación por correo.</p></div></div><form onSubmit={submit} className="grid gap-3 rounded-xl border border-teal-100 bg-white p-4 md:grid-cols-5"><input required placeholder="Nombre completo" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input required type="email" placeholder="Correo" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input required={!editing} type="password" minLength={8} maxLength={128} placeholder={editing ? 'Nueva clave (opcional)' : 'Clave temporal'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} disabled={Boolean(editing && form.role === 'super_admin')} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100"><option value="patient">Paciente</option><option value="family">Familiar</option><option value="caregiver">Cuidador</option><option value="super_admin" disabled={form.role !== 'super_admin'}>Super administrador (protegido)</option></select><button className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white">{editing ? 'Guardar cambios' : 'Crear usuario'}</button></form>{notice && <p className="mt-2 text-sm text-rose-700">{notice}</p>}<div className="mt-4 grid gap-2">{users.map(item => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{item.full_name}</p><p className="text-sm text-slate-500">{item.email} · {item.role}</p></div><div className="flex gap-2"><button onClick={() => { setEditing(item.id); setForm({ fullName: item.full_name, email: item.email, password: '', role: item.role }) }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Editar</button><button onClick={() => { if (window.confirm('¿Eliminar este acceso?')) void onAction('DELETE', { id: item.id }) }} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Eliminar</button></div></div>)}</div></section>
}

function AuthScreen(props: any) { return <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"><div className="mb-7 text-center"><div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-teal-600 text-white"><Pill /></div><h1 className="text-2xl font-bold">{props.isSignUp ? 'Crear cuenta de acceso' : 'Ingresar a MediStock'}</h1><p className="mt-2 text-sm text-slate-500">{props.isSignUp ? 'Pacientes, familiares y administradores pueden registrarse.' : 'Inventario y cuidado familiar seguro'}</p></div><form onSubmit={props.handleAuth} className="flex flex-col gap-4">{props.isSignUp && <label className="text-sm font-semibold">Nombre completo<input required value={props.fullName} onChange={(e: any) => props.setFullName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-teal-500" /></label>}<label className="text-sm font-semibold">Correo electrónico<input required type="email" value={props.email} onChange={(e: any) => props.setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-teal-500" /></label><label className="text-sm font-semibold">Clave<input required minLength={8} maxLength={128} type="password" value={props.password} onChange={(e: any) => props.setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-teal-500" /></label>{props.message && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{props.message}</p>}<button disabled={props.loading} className="rounded-lg bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60">{props.loading ? 'Procesando…' : props.isSignUp ? 'Crear cuenta' : 'Ingresar'}</button></form><button onClick={() => props.setIsSignUp(!props.isSignUp)} className="mt-5 w-full text-sm font-semibold text-teal-700">{props.isSignUp ? 'Ya tengo cuenta' : 'Crear cuenta paciente'}</button></div></main> }
function AccountCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-3"><div className="text-teal-600">{icon}</div><h2 className="font-bold">{title}</h2></div>{children}</section> }
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 text-teal-600">{icon}</div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div> }

function ComprasTab({ medicines, compras, patientNames, onAction }: { medicines: Medicine[]; compras: Compra[]; patientNames: Record<string, string>; onAction: (method: string, payload: any) => Promise<boolean> }) {
  const today = new Date().toISOString().slice(0, 10)
  const emptyForm = { patient_id: '', medicine_id: '', medicine_name: '', purchased_at: today, quantity: '', price_usd: '', exchange_rate: '', price_bsf: '', notes: '', manual_stock: '' }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fetchingRate, setFetchingRate] = useState(false)
  const [filterMonth, setFilterMonth] = useState(today.slice(0, 7))

  const patients = Object.entries(patientNames).map(([id, name]) => ({ id, name }))

  function startEdit(c: Compra) {
    setEditingId(c.id)
    setForm({ patient_id: c.patient_id, medicine_id: c.medicine_id ?? '', medicine_name: c.medicine_name, purchased_at: c.purchased_at, quantity: String(c.quantity), price_usd: String(c.price_usd), exchange_rate: String(c.exchange_rate), price_bsf: String(c.price_bsf), notes: c.notes ?? '', manual_stock: '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() { setEditingId(null); setForm(emptyForm) }

  function onMedicineChange(medicineId: string) {
    const med = medicines.find(m => m.id === medicineId)
    setForm(f => ({ ...f, medicine_id: medicineId, medicine_name: med?.name ?? '', patient_id: med?.patient_id ?? f.patient_id }))
  }

  async function fetchBcvRate() {
    setFetchingRate(true)
    try {
      const res = await fetch('/api/bcv')
      const data = await res.json()
      if (data.rate) setForm(f => {
        let newUsd = f.price_usd;
        let newBsf = f.price_bsf;
        if (f.price_usd) newBsf = (parseFloat(f.price_usd) * data.rate).toFixed(2);
        else if (f.price_bsf) newUsd = (parseFloat(f.price_bsf) / data.rate).toFixed(2);
        return { ...f, exchange_rate: String(data.rate), price_usd: newUsd, price_bsf: newBsf };
      })
      else alert('No se pudo obtener la tasa BCV automáticamente. Ingrésala manualmente.')
    } catch { alert('Error de red al consultar BCV.') }
    setFetchingRate(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.medicine_name || !form.purchased_at || !form.quantity || !form.exchange_rate || (!form.price_usd && !form.price_bsf)) return
    
    let finalUsd = parseFloat(form.price_usd || '0')
    let finalBsf = parseFloat(form.price_bsf || '0')
    const rate = parseFloat(form.exchange_rate)
    
    if (!finalUsd && finalBsf && rate) finalUsd = parseFloat((finalBsf / rate).toFixed(2))
    if (!finalBsf && finalUsd && rate) finalBsf = parseFloat((finalUsd * rate).toFixed(2))

    if (editingId) {
      // PATCH — update existing purchase
      const saved = await onAction('PATCH', {
        id: editingId,
        medicine_name: form.medicine_name,
        purchased_at: form.purchased_at,
        quantity: parseFloat(form.quantity),
        price_usd: finalUsd,
        exchange_rate: rate,
        price_bsf: finalBsf,
        notes: form.notes || null,
      })
      if (saved) cancelEdit()
    } else {
      // POST — new purchase
      if (!form.patient_id) return
      const saved = await onAction('POST', {
        patient_id: form.patient_id,
        medicine_id: form.medicine_id || null,
        medicine_name: form.medicine_name,
        purchased_at: form.purchased_at,
        quantity: parseFloat(form.quantity),
        price_usd: finalUsd,
        exchange_rate: rate,
        price_bsf: finalBsf,
        notes: form.notes || null,
        manual_stock: form.manual_stock ? parseFloat(form.manual_stock) : undefined,
      })
      if (saved) setForm({ ...emptyForm, exchange_rate: form.exchange_rate })
    }
  }

  const filtered = compras.filter(c => c.purchased_at.slice(0, 7) === filterMonth)
  const totalUsd = filtered.reduce((sum, c) => sum + Number(c.price_usd), 0)
  const totalBsf = filtered.reduce((sum, c) => sum + Number(c.price_bsf), 0)

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border p-5 shadow-sm ${editingId ? 'border-amber-300 bg-amber-50' : 'border-teal-100 bg-teal-50'}`}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-bold">{editingId ? '✏️ Editando compra' : 'Registrar compra de medicamento'}</h2>
          {editingId && <button onClick={cancelEdit} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">Cancelar edición</button>}
        </div>
        <p className="mb-4 text-sm text-slate-600">{editingId ? 'El inventario se sumará o restará automáticamente según el cambio que hagas en las unidades.' : 'El stock del medicamento subirá automáticamente al guardar.'}</p>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!editingId && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Paciente</label>
              <select required value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="">Seleccionar paciente</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {!editingId && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Medicamento</label>
              <select value={form.medicine_id} onChange={e => onMedicineChange(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="">Seleccionar (o escribe abajo)</option>
                {medicines.filter(m => !form.patient_id || m.patient_id === form.patient_id).map(m => <option key={m.id} value={m.id}>{m.name} {m.brand ? `(${m.brand})` : ''}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Nombre del medicamento</label>
            <input value={form.medicine_name} onChange={e => setForm(f => ({ ...f, medicine_name: e.target.value }))} placeholder="Ej: Trayenta 5mg" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Fecha de compra</label>
            <input type="date" required value={form.purchased_at} onChange={e => setForm(f => ({ ...f, purchased_at: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Unidades en la caja</label>
            <input type="number" min="1" step="1" required value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="Ej: 30" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Precio USD (caja completa)</label>
            <input type="number" min="0" step="0.01" value={form.price_usd} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, price_usd: val, price_bsf: val && f.exchange_rate ? (parseFloat(val) * parseFloat(f.exchange_rate)).toFixed(2) : f.price_bsf })) }} placeholder="Ej: 12.50" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Tasa BCV (Bs/USD)</label>
            <div className="flex gap-2">
              <input type="number" min="1" step="0.0001" required value={form.exchange_rate} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, exchange_rate: val, price_bsf: f.price_usd && val ? (parseFloat(f.price_usd) * parseFloat(val)).toFixed(2) : f.price_bsf })) }} placeholder="Ej: 853.49" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
              <button type="button" onClick={fetchBcvRate} disabled={fetchingRate} className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                {fetchingRate ? '...' : 'BCV'}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">Precio Bs.S (caja completa)</label>
            <input type="number" min="0" step="0.01" value={form.price_bsf} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, price_bsf: val, price_usd: val && f.exchange_rate ? (parseFloat(val) / parseFloat(f.exchange_rate)).toFixed(2) : f.price_usd })) }} placeholder="Ej: 500" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-teal-800" />
          </div>
          {!editingId && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Stock manual tras compra (opcional)</label>
              <input type="number" min="0" step="1" value={form.manual_stock} onChange={e => setForm(f => ({ ...f, manual_stock: e.target.value }))} placeholder="Dejar vacío = auto" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
            </div>
          )}
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <label className="text-xs font-semibold text-slate-600">Notas (opcional)</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Farmacia, observaciones..." className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </div>
          <button type="submit" className={`rounded-lg px-5 py-2.5 text-sm font-bold text-white sm:col-span-2 lg:col-span-3 ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
            {editingId ? 'Guardar cambios' : 'Registrar compra'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold">Historial de compras</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Mes:</label>
            <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No hay compras registradas para este mes.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Medicamento</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Unidades</th>
                    <th className="px-4 py-3">USD</th>
                    <th className="px-4 py-3">Tasa BCV</th>
                    <th className="px-4 py-3">Bs.S</th>
                    <th className="px-4 py-3">Notas</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(c => (
                    <tr key={c.id} className={editingId === c.id ? 'bg-amber-50' : ''}>
                      <td className="px-4 py-3 font-semibold">{c.medicine_name}</td>
                      <td className="px-4 py-3">{new Date(`${c.purchased_at}T00:00:00`).toLocaleDateString('es-ES')}</td>
                      <td className="px-4 py-3">{c.quantity}</td>
                      <td className="px-4 py-3">${Number(c.price_usd).toFixed(2)}</td>
                      <td className="px-4 py-3">{Number(c.exchange_rate).toFixed(4)}</td>
                      <td className="px-4 py-3 font-bold text-teal-800">Bs. {Number(c.price_bsf).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-slate-500">{c.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button onClick={() => startEdit(c)} className="text-xs font-semibold text-amber-700 hover:underline">Editar</button>
                          <button onClick={() => { if (window.confirm('¿Eliminar esta compra?')) void onAction('DELETE', { id: c.id }) }} className="text-xs font-semibold text-rose-700 hover:underline">Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Total USD · {filterMonth}</p>
                <p className="mt-1 text-lg font-bold">${totalUsd.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-teal-100 bg-teal-50 p-4">
                <p className="text-xs text-slate-500">Total Bs.S · {filterMonth}</p>
                <p className="mt-1 text-lg font-bold text-teal-800">Bs. {totalBsf.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Compras registradas</p>
                <p className="mt-1 text-lg font-bold">{filtered.length}</p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
