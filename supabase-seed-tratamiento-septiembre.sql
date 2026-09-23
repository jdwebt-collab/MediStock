-- MediStock: datos del tratamiento de Mamá (corte: 15/09/2026)
-- Ejecuta primero supabase-schema.sql.
-- Luego crea el usuario paciente en Authentication > Users y pega aquí su UUID.

-- Reemplaza este valor por el UUID real de la paciente.
do $$
declare
  patient_uuid uuid := 'REEMPLAZA-CON-UUID-DE-LA-PACIENTE';
begin
  if patient_uuid::text = 'REEMPLAZA-CON-UUID-DE-LA-PACIENTE' then
    raise exception 'Debes reemplazar patient_uuid por el UUID de la paciente';
  end if;

  insert into public.medicines
    (patient_id, name, brand, dose, daily_doses, unit, essential, stock, reorder_days)
  values
    (patient_uuid, 'Trayenta', 'Trayenta', '5 mg', 1, 'tabletas', true, 87, 90),
    (patient_uuid, 'Metoprolol', 'Metoprolol', '50 mg (½)', 1, 'tabletas', true, 225, 90),
    (patient_uuid, 'Amlodipino', 'Amlodipino', '5 mg', 1, 'tabletas', true, 131, 90),
    (patient_uuid, 'Dapagliflozina', 'Dapagliflozina', '10 mg', 1, 'tabletas', true, 95, 90),
    (patient_uuid, 'Aspirina', 'Aspirina', '81 mg', 1, 'tabletas', false, 131, 90),
    (patient_uuid, 'Hidroclorotiazida', 'Hidroclorotiazida', '12,5 mg (½)', 1, 'tabletas', false, 139, 90);
end $$;

-- Verificación segura: solo muestra los medicamentos de este paciente.
select name, dose, stock, unit, daily_doses, reorder_days
from public.medicines
where patient_id = 'REEMPLAZA-CON-UUID-DE-LA-PACIENTE'
order by name;

-- Nota del documento original:
-- Próxima compra: 31/10/2026
-- 1 Trayenta (75$), 2 Dapagliflozina (20$), 1 Aspirina (10$)
-- Total estimado de octubre: 105$.
-- Estos datos económicos aún no tienen una tabla en el esquema actual.
-- No se guardan contraseñas aquí: Supabase Auth gestiona las claves.

-- Para cambiar la clave desde la app:
-- const { error } = await supabase.auth.updateUser({ password: nuevaClave })
-- Nunca insertes ni actualices contraseñas manualmente en public.*

-- Para relacionar un familiar/cuidador, ambos deben existir en Authentication > Users:
-- insert into public.care_relationships
--   (patient_id, caregiver_id, relationship, can_edit_inventory)
-- values
--   ('UUID_DE_LA_PACIENTE', 'UUID_DEL_FAMILIAR', 'hijo/a', true);
-- La paciente conserva el control de quién puede ver o editar su inventario.
