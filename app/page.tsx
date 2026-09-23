'use client'

import { FormEvent, useEffect, useState } from 'react'
import { AlertTriangle, Bell, Download, FileSpreadsheet, KeyRound, LogOut, Mail, Package, Pill, Search, ShieldCheck, Users } from 'lucide-react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'

type Medicine = { id: string; patient_id: string; name: string; brand: string | null; dose: string; stock: number; daily_doses: number; unit: string; essential: boolean }
type Profile = { full_name: string; role: string }
type Announcement = { id: string; patient_id: string; title: string; body: string; purchase_date: string | null; estimated_amount: number | null; created_at: string }

const treatment = [
  ['Trayenta', '5 mg', 87, true], ['Metoprolol', '50 mg (½)', 225, true], ['Amlodipino', '5 mg', 131, true],
  ['Dapagliflozina', '10 mg', 95, true], ['Aspirina', '81 mg', 131, false], ['Hidroclorotiazida', '12,5 mg (½)', 139, false],
] as const

function getStatus(medicine: Medicine) {
  const days = medicine.stock / Math.max(Number(medicine.daily_doses), 0.01)
  return days < 60 ? ['Crítico', 'bg-rose-50 text-rose-700'] : days < 90 ? ['Reabastecer', 'bg-amber-50 text-amber-700'] : ['En stock', 'bg-emerald-50 text-emerald-700']
}

export default function Page() {
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'inventory' | 'admin' | 'settings'>('inventory')
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

  async function announcementAction(method: string, payload: any) {
    const { data } = await supabase?.auth.getSession() ?? { data: { session: null } }
    const response = await fetch('/api/announcements', { method, headers: { 'Content-Type': 'application/json', ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify(payload) })
    const result = await response.json()
    if (response.ok) { setMessage(method === 'POST' ? 'Información publicada para los usuarios autorizados.' : 'Información eliminada.'); await loadAnnouncements() }
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
    const headers = ['Medicamento', 'Marca', 'Dosis', 'Dosis diarias', 'Unidad', 'Stock', 'Días restantes', 'Estado']
    const rows = medicines.map((medicine) => {
      const days = Number(medicine.stock) / Math.max(Number(medicine.daily_doses), 0.01)
      const status = days < 60 ? 'Crítico' : days < 90 ? 'Reabastecer' : 'En stock'
      return [medicine.name, medicine.brand ?? '', medicine.dose, medicine.daily_doses, medicine.unit, medicine.stock, Math.floor(days), status]
    })
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    worksheet['!cols'] = headers.map((header, index) => ({ wch: Math.max(header.length + 2, ...rows.map((row) => String(row[index] ?? '').length + 2), 12) }))
    worksheet['!autofilter'] = { ref: `A1:H${rows.length + 1}` }
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario')
    XLSX.writeFile(workbook, `medistock-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`)
    setMessage('Respaldo Excel exportado con formato de tabla y filtros.')
  }

  const isAdmin = profile?.role === 'super_admin'



  if (loading && !user) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Cargando MediStock…</main>
  if (!user) return <AuthScreen {...{ email, setEmail, password, setPassword, fullName, setFullName, isSignUp, setIsSignUp, message, loading, handleAuth }} />

  const visible = medicines.filter(m => `${m.name} ${m.brand ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const alerts = medicines.filter(m => Number(m.stock) / Math.max(Number(m.daily_doses), 0.01) < 90)
  const name = profile?.full_name ?? user.email?.split('@')[0] ?? 'usuario'

  return <main className="min-h-screen bg-[#f7f9fc] text-slate-900">
  <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-teal-600 text-white"><Pill /></div><div><p className="font-bold">MediStock</p><p className="text-xs text-slate-400">Cuidado compartido</p></div></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{name}</p><p className="text-xs text-slate-400">{isAdmin ? 'Super administrador' : profile?.role === 'patient' ? 'Paciente' : 'Familiar autorizado'}</p></div><button onClick={signOut} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><LogOut /> Salir</button></div></div></header>
  {alerts.length > 0 && <section className={alerts.some((medicine) => Number(medicine.stock) / Math.max(Number(medicine.daily_doses), 0.01) < 60) ? 'border-b border-rose-200 bg-rose-50' : 'border-b border-amber-200 bg-amber-50'}><div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3"><div className={alerts.some((medicine) => Number(medicine.stock) / Math.max(Number(medicine.daily_doses), 0.01) < 60) ? 'relative flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm' : 'relative flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm'}><Bell className="size-5" aria-hidden="true" style={{ animation: 'medistock-bell 2.8s ease-in-out infinite' }} /><span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-white ring-2 ring-current" /></div><div className="min-w-0"><p className={alerts.some((medicine) => Number(medicine.stock) / Math.max(Number(medicine.daily_doses), 0.01) < 60) ? 'text-xs font-bold uppercase tracking-[0.14em] text-rose-700' : 'text-xs font-bold uppercase tracking-[0.14em] text-amber-700'}>Medicina necesaria</p><p className={alerts.some((medicine) => Number(medicine.stock) / Math.max(Number(medicine.daily_doses), 0.01) < 60) ? 'text-sm font-semibold text-rose-950' : 'text-sm font-semibold text-amber-950'}>{alerts.length === 1 ? 'Hay 1 medicamento que requiere atención.' : `Hay ${alerts.length} medicamentos que requieren atención.`}</p><p className="text-xs text-rose-800">Revisa el inventario para planificar la próxima compra.</p></div><div className="ml-auto hidden shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-rose-700 sm:block">{alerts.filter((medicine) => Number(medicine.stock) / Math.max(Number(medicine.daily_doses), 0.01) < 60).length > 0 ? 'Prioridad alta' : 'Próxima compra'}</div></div></section>}

  <div className="mx-auto max-w-6xl px-5 py-8">
    <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-600">{isAdmin ? 'Administración' : 'Panel de control'}</p><h1 className="mt-2 text-3xl font-bold">Hola, {name}</h1><p className="mt-2 text-sm text-slate-500">{isAdmin ? 'Vista global de pacientes y tratamientos.' : 'Inventario privado conectado a Supabase.'}</p></div>
    
    {message && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{message}</div>}

    <div className="mb-6 flex gap-4 border-b border-slate-200">
      <button onClick={() => setActiveTab('inventory')} className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Inventario</button>
      {isAdmin && <button onClick={() => setActiveTab('admin')} className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'admin' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Administración</button>}
      <button onClick={() => setActiveTab('settings')} className={`pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${activeTab === 'settings' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>Configuración</button>
    </div>

    {activeTab === 'inventory' && (
      <div className="animate-in fade-in duration-300">
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3"><Metric icon={<Package />} label="Medicamentos" value={String(medicines.length)} /><Metric icon={<AlertTriangle />} label="Por reabastecer" value={String(alerts.length)} /><Metric icon={isAdmin ? <ShieldCheck /> : <Users />} label={isAdmin ? 'Rol seguro' : 'Acceso familiar'} value={isAdmin ? 'Activo' : 'Protegido'} /></div>
        <Announcements announcements={announcements} patientNames={patientNames} isAdmin={isAdmin} onDelete={announcementAction} />
        <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-teal-100 bg-teal-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-teal-800"><FileSpreadsheet /><h2 className="font-bold">Respaldo del inventario</h2></div><p className="mt-1 text-sm text-teal-700">Descarga el inventario actual en formato compatible con Excel cuando lo necesites.</p></div><button onClick={exportInventory} className="flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700"><Download /> Exportar Excel</button></section>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Inventario actual</h2><p className="text-sm text-slate-500">Tratamiento y existencias registradas</p></div><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><Search /><span className="sr-only">Buscar medicamento</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar" className="w-full outline-none" /></label></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4">Medicamento</th><th className="p-4">Dosis</th><th className="p-4">Stock</th><th className="p-4">Estado</th></tr></thead><tbody>{visible.map(m => { const [label, color] = getStatus(m); return <tr key={m.id} className="border-t border-slate-100"><td className="p-4 font-semibold">{m.name}</td><td className="p-4">{m.dose}</td><td className="p-4">{m.stock} {m.unit}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{label}</span></td></tr> })}</tbody></table>{visible.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No hay medicamentos para mostrar.</p>}</div></section>
      </div>
    )}

    {activeTab === 'admin' && isAdmin && (
      <div className="animate-in fade-in duration-300 space-y-6">
        <AdminUsers users={adminUsers} onAction={adminUserAction} />
        <AdminAnnouncements users={adminUsers} announcements={announcements} onAction={announcementAction} />
        <AdminInventory medicines={medicines} patientNames={patientNames} onUpdate={medicineAction} />
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
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Inventario global</h2><p className="mb-4 text-sm text-slate-500">Edita las existencias directamente desde esta tabla.</p><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Medicamento</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Dosis diarias</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y">{medicines.map((medicine: Medicine) => editing === medicine.id ? <tr key={medicine.id}><td className="px-4 py-3">{patientNames[medicine.patient_id] ?? 'Paciente'}</td><td className="px-4 py-3">{medicine.name}</td><td className="px-4 py-3"><input type="number" min="0" value={stock} onChange={(event) => setStock(event.target.value)} className="w-24 rounded border px-2 py-1" /></td><td className="px-4 py-3"><input type="number" min="0.01" step="0.01" value={dailyDoses} onChange={(event) => setDailyDoses(event.target.value)} className="w-24 rounded border px-2 py-1" /></td><td className="px-4 py-3"><button onClick={() => void onUpdate({ medicineId: medicine.id, stock: Number(stock), dailyDoses: Number(dailyDoses) }).then((saved: boolean) => { if (saved) setEditing(null) })} className="font-semibold text-teal-700">Guardar</button></td></tr> : <tr key={medicine.id}><td className="px-4 py-3">{patientNames[medicine.patient_id] ?? 'Paciente'}</td><td className="px-4 py-3">{medicine.name}</td><td className="px-4 py-3">{medicine.stock} {medicine.unit}</td><td className="px-4 py-3">{medicine.daily_doses}</td><td className="px-4 py-3"><button onClick={() => { setEditing(medicine.id); setStock(String(medicine.stock)); setDailyDoses(String(medicine.daily_doses)) }} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white">Editar stock</button></td></tr>)}</tbody></table></div></section>
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
