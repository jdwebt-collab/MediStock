const fs = require('fs')
let content = fs.readFileSync('app/page.tsx', 'utf8')

// Update emptyForm to include price_bsf
content = content.replace(
  `const emptyForm = { patient_id: '', medicine_id: '', medicine_name: '', purchased_at: today, quantity: '', price_usd: '', exchange_rate: '', notes: '', manual_stock: '' }`,
  `const emptyForm = { patient_id: '', medicine_id: '', medicine_name: '', purchased_at: today, quantity: '', price_usd: '', exchange_rate: '', price_bsf: '', notes: '', manual_stock: '' }`
)

// Remove derived priceBsf
content = content.replace(
  `const priceBsf = form.price_usd && form.exchange_rate ? (parseFloat(form.price_usd) * parseFloat(form.exchange_rate)).toFixed(2) : ''\n  const patients = Object.entries(patientNames).map(([id, name]) => ({ id, name }))`,
  `const patients = Object.entries(patientNames).map(([id, name]) => ({ id, name }))`
)

// Update startEdit to include price_bsf
content = content.replace(
  `setForm({ patient_id: c.patient_id, medicine_id: c.medicine_id ?? '', medicine_name: c.medicine_name, purchased_at: c.purchased_at, quantity: String(c.quantity), price_usd: String(c.price_usd), exchange_rate: String(c.exchange_rate), notes: c.notes ?? '', manual_stock: '' })`,
  `setForm({ patient_id: c.patient_id, medicine_id: c.medicine_id ?? '', medicine_name: c.medicine_name, purchased_at: c.purchased_at, quantity: String(c.quantity), price_usd: String(c.price_usd), exchange_rate: String(c.exchange_rate), price_bsf: String(c.price_bsf), notes: c.notes ?? '', manual_stock: '' })`
)

// Update fetchBcvRate to calculate price_bsf
content = content.replace(
  `if (data.rate) setForm(f => ({ ...f, exchange_rate: String(data.rate) }))`,
  `if (data.rate) setForm(f => ({ ...f, exchange_rate: String(data.rate), price_bsf: f.price_usd ? (parseFloat(f.price_usd) * data.rate).toFixed(2) : f.price_bsf }))`
)

// Update submit function (remove priceBsf fallback)
content = content.replace(
  `price_bsf: parseFloat(priceBsf || '0'),`,
  `price_bsf: parseFloat(form.price_bsf || '0'),`
)
content = content.replace(
  `price_bsf: parseFloat(priceBsf || '0'),`,
  `price_bsf: parseFloat(form.price_bsf || '0'),`
)

// Change inputs in JSX
// USD Input
content = content.replace(
  `<input type="number" min="0" step="0.01" required value={form.price_usd} onChange={e => setForm(f => ({ ...f, price_usd: e.target.value }))} placeholder="Ej: 12.50" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />`,
  `<input type="number" min="0" step="0.01" value={form.price_usd} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, price_usd: val, price_bsf: val && f.exchange_rate ? (parseFloat(val) * parseFloat(f.exchange_rate)).toFixed(2) : f.price_bsf })) }} placeholder="Ej: 12.50" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />`
)

// Rate Input
content = content.replace(
  `<input type="number" min="1" step="0.0001" required value={form.exchange_rate} onChange={e => setForm(f => ({ ...f, exchange_rate: e.target.value }))} placeholder="Ej: 853.49" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />`,
  `<input type="number" min="1" step="0.0001" required value={form.exchange_rate} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, exchange_rate: val, price_bsf: f.price_usd && val ? (parseFloat(f.price_usd) * parseFloat(val)).toFixed(2) : f.price_bsf })) }} placeholder="Ej: 853.49" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />`
)

// BsS Input (was readonly)
content = content.replace(
  `<label className="text-xs font-semibold text-slate-600">Precio en Bs.S (calculado)</label>\n            <input readOnly value={priceBsf ? \`Bs. \${Number(priceBsf).toLocaleString('es-VE')}\` : ''} placeholder="Auto" className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-teal-800" />`,
  `<label className="text-xs font-semibold text-slate-600">Precio Bs.S (caja completa)</label>\n            <input type="number" min="0" step="0.01" value={form.price_bsf} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, price_bsf: val, price_usd: val && f.exchange_rate ? (parseFloat(val) / parseFloat(f.exchange_rate)).toFixed(2) : f.price_usd })) }} placeholder="Ej: 500" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-teal-800" />`
)

// Update submit condition
content = content.replace(
  `if (!form.medicine_name || !form.purchased_at || !form.quantity || !form.price_usd || !form.exchange_rate) return`,
  `if (!form.medicine_name || !form.purchased_at || !form.quantity || !form.exchange_rate || (!form.price_usd && !form.price_bsf)) return`
)

fs.writeFileSync('app/page.tsx', content)
