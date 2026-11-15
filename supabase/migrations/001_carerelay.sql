-- CareRelay: apply once in Supabase SQL Editor or with `npm run db:migrate`.
-- Every public table has RLS. Application writes are atomic, validated RPCs.
begin;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null check (length(name) between 1 and 150),
  created_at timestamptz not null default now()
);
create function public.sync_auth_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.users(id,email,name) values (new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'name',''),split_part(coalesce(new.email,'Member'),'@',1)))
  on conflict(id) do update set email=excluded.email;
  return new;
end $$;
create trigger carerelay_auth_user after insert or update of email on auth.users for each row execute function public.sync_auth_user();
insert into public.users(id,email,name) select id,coalesce(email,''),coalesce(nullif(raw_user_meta_data->>'name',''),split_part(coalesce(email,'Member'),'@',1)) from auth.users on conflict do nothing;

create table public.elderly_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete restrict,
  preferred_name text not null check(length(preferred_name) between 1 and 100),
  date_of_birth date,
  timezone text not null default 'Asia/Kolkata',
  notes text not null default '',
  grace_minutes integer not null default 60 check(grace_minutes between 5 and 1440),
  escalation_minutes integer not null default 120 check(escalation_minutes between 5 and 2880),
  appointment_reminders integer[] not null default '{1440,60}',
  created_at timestamptz not null default now()
);
create table public.care_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete restrict,
  role text not null check(role in ('owner','coordinator','caretaker','viewer')),
  can_invite boolean not null default false,
  active boolean not null default true,
  email_enabled boolean not null default true,
  reminder_enabled boolean not null default true,
  updates_enabled boolean not null default true,
  joined_at timestamptz not null default now(),
  unique(profile_id,user_id)
);
create unique index one_active_owner_per_profile on public.care_members(profile_id) where role='owner' and active;
create index membership_access on public.care_members(user_id,profile_id) where active;
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  code_hash text not null unique check(length(code_hash)=64),
  role text not null check(role in ('coordinator','caretaker','viewer')),
  can_invite boolean not null default false,
  invited_by uuid not null references public.users(id),
  expires_at timestamptz not null default (now()+interval '48 hours'),
  consumed_at timestamptz, consumed_by uuid references public.users(id), revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  name text not null check(length(name) between 1 and 120), strength text not null default '',
  dosage text not null check(length(dosage) between 1 and 250), form text not null,
  route text not null default '', instructions text not null default '', source text not null,
  start_date date not null, end_date date check(end_date is null or end_date>=start_date),
  state text not null default 'active' check(state in ('active','paused','completed')),
  responsible_member_id uuid references public.care_members(id) on delete restrict,
  entered_by uuid not null references public.users(id),
  version integer not null default 1 check(version>0), flagged boolean not null default false,
  flag_note text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,profile_id)
);
create table public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  medication_id uuid not null unique,
  times text[] not null check(cardinality(times) between 1 and 12),
  days integer[] not null check(cardinality(days) between 1 and 7 and days <@ array[0,1,2,3,4,5,6]),
  reminder_minutes integer not null default 15 check(reminder_minutes between 0 and 1440),
  reminders_enabled boolean not null default true,
  foreign key(medication_id,profile_id) references public.medications(id,profile_id) on delete cascade
);
create table public.medication_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  medication_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  changed_by uuid not null references public.users(id), reason text not null, source text not null,
  created_at timestamptz not null default now(),
  foreign key(medication_id,profile_id) references public.medications(id,profile_id) on delete restrict,
  unique(medication_id,version)
);
create table public.dose_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  medication_id uuid not null,
  scheduled_at timestamptz not null,
  snapshot jsonb not null,
  status text not null default 'scheduled' check(status in ('scheduled','self_reported_taken','assisted_recorded','declined','needs_help','unconfirmed','explicitly_missed')),
  assigned_member_id uuid references public.care_members(id), reported_by uuid references public.users(id),
  recorded_at timestamptz, note text not null default '', version integer not null default 1,
  created_at timestamptz not null default now(),
  foreign key(medication_id,profile_id) references public.medications(id,profile_id) on delete restrict,
  unique(medication_id,scheduled_at), unique(id,profile_id)
);
create index dose_schedule on public.dose_events(profile_id,scheduled_at);
create index unresolved_doses on public.dose_events(scheduled_at) where status in ('scheduled','unconfirmed','needs_help');
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  doctor_name text not null, specialty text not null default '', starts_at timestamptz not null,
  clinic text not null, location text not null default '', notes text not null default '',
  accompanying_member_id uuid references public.care_members(id),
  status text not null default 'upcoming' check(status in ('upcoming','completed','cancelled')),
  follow_up_notes text not null default '', version integer not null default 1,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,profile_id)
);
create index appointment_schedule on public.appointments(profile_id,starts_at);
create table public.care_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  dose_event_id uuid, appointment_id uuid,
  title text not null,
  current_owner_id uuid references public.care_members(id), previous_owner_id uuid references public.care_members(id),
  proposed_owner_id uuid references public.care_members(id), initiated_by uuid not null references public.users(id),
  status text not null default 'open' check(status in ('open','pending','accepted','declined','completed')),
  note text not null default '', due_at timestamptz not null,
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(dose_event_id,profile_id) references public.dose_events(id,profile_id) on delete restrict,
  foreign key(appointment_id,profile_id) references public.appointments(id,profile_id) on delete restrict,
  check(dose_event_id is null or appointment_id is null),
  check(status<>'pending' or proposed_owner_id is not null)
);
create unique index one_dose_assignment on public.care_assignments(dose_event_id) where dose_event_id is not null;
create unique index one_appointment_assignment on public.care_assignments(appointment_id) where appointment_id is not null;
create index assigned_tasks on public.care_assignments(profile_id,current_owner_id,proposed_owner_id,status);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  user_id uuid not null references public.users(id),
  kind text not null, subject text not null, body text not null,
  status text not null default 'queued' check(status in ('queued','processing','sent','failed','unconfigured')),
  idempotency_key text not null unique,
  read_at timestamptz, sent_at timestamptz, error text, provider_id text,
  attempts integer not null default 0, locked_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_outbox on public.notifications(status,created_at);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.elderly_profiles(id) on delete cascade,
  actor_id uuid references public.users(id), actor_name text not null,
  action text not null, entity_type text not null, entity_id uuid,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index care_timeline on public.audit_logs(profile_id,created_at desc);
create table public.rate_limits (
  key text primary key, attempts integer not null default 1, window_start timestamptz not null default now()
);
create table public.job_settings (key text primary key, value text not null);
-- API key remains in environment. Store only a SHA-256 digest to authenticate worker RPCs.
insert into public.job_settings values ('cron_secret_hash','') on conflict do nothing;

create function public.member_role(p uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$
  select role from care_members where profile_id=p and user_id=auth.uid() and active limit 1;
$$;
create function public.member_id(p uuid) returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select id from care_members where profile_id=p and user_id=auth.uid() and active limit 1;
$$;
create function public.has_access(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.member_role(p) is not null;
$$;
create function public.can_manage(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(public.member_role(p) in ('owner','coordinator'),false);
$$;
create function public.can_invite(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from care_members where profile_id=p and user_id=auth.uid() and active and (role='owner' or (role='coordinator' and can_invite)));
$$;
create function public.can_read_medication(p uuid,m uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.member_role(p) in ('owner','coordinator','viewer') or (public.member_role(p)='caretaker' and (
    exists(select 1 from medications where id=m and profile_id=p and responsible_member_id=public.member_id(p)) or
    exists(select 1 from dose_events d where d.medication_id=m and d.profile_id=p and d.assigned_member_id=public.member_id(p)) or
    exists(select 1 from care_assignments a join dose_events d on d.id=a.dose_event_id where d.medication_id=m and a.profile_id=p and public.member_id(p) in (a.current_owner_id,a.proposed_owner_id))));
$$;
create function public.can_read_dose(p uuid,d uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.member_role(p) in ('owner','coordinator','viewer') or (public.member_role(p)='caretaker' and (
    exists(select 1 from dose_events where id=d and profile_id=p and assigned_member_id=public.member_id(p)) or
    exists(select 1 from care_assignments where dose_event_id=d and profile_id=p and public.member_id(p) in (current_owner_id,proposed_owner_id))));
$$;
create function public.can_read_appointment(p uuid,a uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.member_role(p) in ('owner','coordinator','viewer') or (public.member_role(p)='caretaker' and (
    exists(select 1 from appointments where id=a and profile_id=p and accompanying_member_id=public.member_id(p)) or
    exists(select 1 from care_assignments where appointment_id=a and profile_id=p and public.member_id(p) in (current_owner_id,proposed_owner_id))));
$$;
create function public.can_read_audit(p uuid,e text,i uuid,actor uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.member_role(p) in ('owner','coordinator','viewer') or (public.member_role(p)='caretaker' and (
    actor=auth.uid() or (e='medication' and public.can_read_medication(p,i)) or (e='dose' and public.can_read_dose(p,i)) or
    (e='appointment' and public.can_read_appointment(p,i)) or (e='assignment' and exists(select 1 from care_assignments where id=i and public.member_id(p) in(current_owner_id,previous_owner_id,proposed_owner_id)))));
$$;

alter table public.users enable row level security;
alter table public.elderly_profiles enable row level security;
alter table public.care_members enable row level security;
alter table public.invitations enable row level security;
alter table public.medications enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.medication_versions enable row level security;
alter table public.dose_events enable row level security;
alter table public.appointments enable row level security;
alter table public.care_assignments enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;
alter table public.job_settings enable row level security;

create policy users_visible on public.users for select to authenticated using (id=auth.uid() or exists(select 1 from public.care_members c where c.user_id=users.id and c.active and public.has_access(c.profile_id)));
create policy profiles_visible on public.elderly_profiles for select to authenticated using(public.has_access(id));
create policy members_visible on public.care_members for select to authenticated using(public.has_access(profile_id));
create policy invitations_visible on public.invitations for select to authenticated using(public.can_invite(profile_id));
create policy medication_visible on public.medications for select to authenticated using(public.can_read_medication(profile_id,id));
create policy schedules_visible on public.medication_schedules for select to authenticated using(public.can_read_medication(profile_id,medication_id));
create policy versions_visible on public.medication_versions for select to authenticated using(public.can_read_medication(profile_id,medication_id));
create policy doses_visible on public.dose_events for select to authenticated using(public.can_read_dose(profile_id,id));
create policy appointments_visible on public.appointments for select to authenticated using(public.can_read_appointment(profile_id,id));
create policy assignments_visible on public.care_assignments for select to authenticated using(public.member_role(profile_id) in('owner','coordinator','viewer') or (public.member_role(profile_id)='caretaker' and public.member_id(profile_id) in(current_owner_id,proposed_owner_id)));
create policy notifications_visible on public.notifications for select to authenticated using(user_id=auth.uid() and public.has_access(profile_id));
create policy audit_visible on public.audit_logs for select to authenticated using(public.can_read_audit(profile_id,entity_type,entity_id,actor_id));
-- No direct write policies: mutations require business RPC permission checks and row locks.
revoke all on public.rate_limits,public.job_settings from anon,authenticated;
grant select on public.users,public.elderly_profiles,public.care_members,public.invitations,public.medications,public.medication_schedules,public.medication_versions,public.dose_events,public.appointments,public.care_assignments,public.notifications,public.audit_logs to authenticated;

create function public.write_audit(p uuid,a text,e text,i uuid,d jsonb default '{}') returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into audit_logs(profile_id,actor_id,actor_name,action,entity_type,entity_id,details)
  values(p,auth.uid(),coalesce((select name from users where id=auth.uid()),'CareRelay'),a,e,i,d);
end $$;
create function public.assert_responsible_member(p uuid,m uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if m is not null and not exists(select 1 from care_members where id=m and profile_id=p and active and role in('owner','coordinator','caretaker')) then
    raise exception using message='Choose an active authorised care member',errcode='42501';
  end if;
end $$;
create function public.enqueue_notification(p uuid,u uuid,k text,s text,b text,key_ text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from care_members where profile_id=p and user_id=u and active and email_enabled and
    (case when k in('dose_reminder','dose_unconfirmed','dose_escalation','appointment_reminder') then reminder_enabled else updates_enabled end)) then
    insert into notifications(profile_id,user_id,kind,subject,body,idempotency_key) values(p,u,k,s,b,key_) on conflict(idempotency_key) do nothing;
  end if;
end $$;
create function public.notify_care_circle(p uuid,k text,s text,b text,key_ text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m record;
begin
  for m in select user_id from care_members where profile_id=p and active and role in('owner','coordinator') loop
    perform public.enqueue_notification(p,m.user_id,k,s,b,key_||':'||m.user_id);
  end loop;
end $$;

-- Generate occurrences in the profile's local timezone, preserving all existing rows.
-- Future, untouched occurrences affected by an edit are removed separately with an audit entry.
create function public.generate_profile_doses(p uuid,days_ahead integer default 7) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare med record; day_ date; time_ text; at_ timestamptz; tz text; added integer:=0; count_ integer;
begin
  select timezone into tz from elderly_profiles where id=p;
  for med in select m.*,s.times,s.days from medications m join medication_schedules s on s.medication_id=m.id where m.profile_id=p and m.state='active' loop
    for day_ in select generate_series((now() at time zone tz)::date,(now() at time zone tz)::date+least(greatest(days_ahead,1),30),'1 day')::date loop
      if day_>=med.start_date and (med.end_date is null or day_<=med.end_date) and extract(dow from day_)::integer=any(med.days) then
        foreach time_ in array med.times loop
          at_:=(day_::text||' '||time_)::timestamp at time zone tz;
          insert into dose_events(profile_id,medication_id,scheduled_at,snapshot,assigned_member_id)
          values(p,med.id,at_,jsonb_build_object('name',med.name,'strength',med.strength,'dosage',med.dosage,'instructions',med.instructions,'source',med.source,'version',med.version),med.responsible_member_id)
          on conflict(medication_id,scheduled_at) do nothing;
          get diagnostics count_=row_count; added:=added+count_;
        end loop;
      end if;
    end loop;
  end loop;
  return added;
end $$;

create function public.care_bootstrap(requested_profile uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p uuid; result jsonb; r text; m uuid;
begin
  if auth.uid() is null then raise exception using message='Sign in to continue',errcode='42501'; end if;
  select coalesce(requested_profile,(select profile_id from care_members where user_id=auth.uid() and active order by joined_at limit 1)) into p;
  if p is not null and not public.has_access(p) then raise exception using message='You do not have access to this care profile',errcode='42501'; end if;
  r:=public.member_role(p); m:=public.member_id(p);
  result:=jsonb_build_object(
    'user',(select to_jsonb(u)-'created_at' from users u where id=auth.uid()),
    'profiles',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('role',c.role) order by c.joined_at) from elderly_profiles e join care_members c on c.profile_id=e.id where c.user_id=auth.uid() and c.active),'[]'),
    'profile',(select to_jsonb(e) from elderly_profiles e where id=p),
    'membership',(select to_jsonb(c)||jsonb_build_object('name',u.name,'email',u.email) from care_members c join users u on u.id=c.user_id where c.id=m),
    'members',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('name',u.name,'email',u.email) order by case c.role when 'owner' then 0 when 'coordinator' then 1 else 2 end,c.joined_at) from care_members c join users u on u.id=c.user_id where c.profile_id=p),'[]'),
    'medications',coalesce((select jsonb_agg(to_jsonb(md)||jsonb_build_object('schedule',jsonb_build_object('times',s.times,'days',s.days,'reminder_minutes',s.reminder_minutes,'reminders_enabled',s.reminders_enabled)) order by md.created_at) from medications md join medication_schedules s on s.medication_id=md.id where md.profile_id=p and public.can_read_medication(p,md.id)),'[]'),
    'doses',coalesce((select jsonb_agg(to_jsonb(d) order by d.scheduled_at) from dose_events d where d.profile_id=p and d.scheduled_at>=now()-interval '30 days' and d.scheduled_at<=now()+interval '30 days' and public.can_read_dose(p,d.id)),'[]'),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from care_assignments a where a.profile_id=p and (r in('owner','coordinator','viewer') or m in(a.current_owner_id,a.proposed_owner_id))),'[]'),
    'appointments',coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at) from appointments a where a.profile_id=p and public.can_read_appointment(p,a.id)),'[]'),
    'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from audit_logs where profile_id=p and public.can_read_audit(p,entity_type,entity_id,actor_id) order by created_at desc limit 200) a),'[]'),
    'invitations',case when public.can_invite(p) then coalesce((select jsonb_agg(to_jsonb(i)-'code_hash'-'consumed_by' order by i.created_at desc) from invitations i where i.profile_id=p),'[]') else '[]'::jsonb end,
    'versions',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('actor_name',u.name) order by v.created_at desc) from medication_versions v join users u on u.id=v.changed_by where v.profile_id=p and public.can_read_medication(p,v.medication_id)),'[]'),
    'notifications',coalesce((select jsonb_agg(to_jsonb(n)-'idempotency_key'-'provider_id'-'locked_at' order by n.created_at desc) from notifications n where n.profile_id=p and n.user_id=auth.uid()),'[]')
  );
  return result;
end $$;

commit;
