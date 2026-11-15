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
begin;

create function public.consume_rate_limit(key_ text,max_ integer,seconds_ integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  insert into rate_limits(key,attempts,window_start) values(key_,1,now())
  on conflict(key) do update set
    attempts=case when rate_limits.window_start<now()-make_interval(secs=>seconds_) then 1 else rate_limits.attempts+1 end,
    window_start=case when rate_limits.window_start<now()-make_interval(secs=>seconds_) then now() else rate_limits.window_start end
  returning attempts into n;
  return n<=max_;
end $$;

create function public.archive_medication(p uuid,m uuid,reason_ text,source_ text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot_ jsonb; version_ integer;
begin
  select to_jsonb(md)||jsonb_build_object('schedule',jsonb_build_object('times',s.times,'days',s.days,'reminder_minutes',s.reminder_minutes,'reminders_enabled',s.reminders_enabled)),md.version
  into snapshot_,version_ from medications md join medication_schedules s on s.medication_id=md.id where md.id=m and md.profile_id=p;
  insert into medication_versions(profile_id,medication_id,version,snapshot,changed_by,reason,source)
    values(p,m,version_,snapshot_,auth.uid(),reason_,source_);
end $$;

create function public.care_action(profile_ uuid,kind_ text,payload_ jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p uuid:=profile_; uid uuid:=auth.uid(); role_ text; member_ uuid; id_ uuid;
  med medications%rowtype; dose dose_events%rowtype; assignment_ care_assignments%rowtype;
  appt appointments%rowtype; invite_ invitations%rowtype; cm care_members%rowtype;
  code_ text; hash_ text; n integer; target_ uuid; expected_ integer; old_status text;
  old_owner uuid; tz text; details_ jsonb; result_ jsonb; state_ text;
begin
  if uid is null then raise exception using message='Sign in to continue',errcode='42501'; end if;
  if kind_='create_profile' then
    if not public.consume_rate_limit('create-profile:'||uid,10,3600) then return jsonb_build_object('error','Too many profiles created. Try again later.','code','rate_limit'); end if;
    if coalesce(length(trim(payload_->>'preferred_name')),0) not between 1 and 100 then raise exception 'Enter a preferred name'; end if;
    if not exists(select 1 from pg_timezone_names where name=payload_->>'timezone') then raise exception 'Choose a valid timezone'; end if;
    insert into elderly_profiles(owner_id,preferred_name,timezone,date_of_birth,notes)
    values(uid,trim(payload_->>'preferred_name'),payload_->>'timezone',nullif(payload_->>'date_of_birth','')::date,coalesce(payload_->>'notes','')) returning id into p;
    insert into care_members(profile_id,user_id,role,can_invite) values(p,uid,'owner',true);
    perform public.write_audit(p,'Created a care profile','profile',p,jsonb_build_object('name',payload_->>'preferred_name'));
    return jsonb_build_object('id',p,'message','Your care profile is ready');
  end if;

  if kind_='join' then
    -- Return validation errors rather than raising, so failed attempts remain committed.
    if not public.consume_rate_limit('join:'||uid,8,900) then return jsonb_build_object('error','Too many code attempts. Try again in 15 minutes.','code','rate_limit'); end if;
    code_:=regexp_replace(upper(coalesce(payload_->>'code','')),'[^A-Z0-9]','','g');
    hash_:=encode(sha256(convert_to(code_,'UTF8')),'hex');
    select * into invite_ from invitations where code_hash=hash_ for update;
    if not found or invite_.revoked_at is not null or invite_.consumed_at is not null or invite_.expires_at<=now() then
      return jsonb_build_object('error','This invitation is invalid, expired, revoked or already used.','code','invalid_invitation');
    end if;
    if exists(select 1 from care_members where profile_id=invite_.profile_id and user_id=uid and active) then
      return jsonb_build_object('error','You already belong to this care circle.','code','already_member');
    end if;
    p:=invite_.profile_id;
    insert into care_members(profile_id,user_id,role,can_invite) values(p,uid,invite_.role,invite_.can_invite)
      on conflict(profile_id,user_id) do update set active=true,role=excluded.role,can_invite=excluded.can_invite,joined_at=now();
    update invitations set consumed_at=now(),consumed_by=uid where id=invite_.id;
    perform public.write_audit(p,'Joined the care circle','member',uid,jsonb_build_object('role',invite_.role));
    perform public.notify_care_circle(p,'member_joined','A member joined your care circle','An invitation was accepted. Sign in to review care circle access.','joined:'||invite_.id);
    return jsonb_build_object('id',p,'message','You joined the care circle');
  end if;

  role_:=public.member_role(p); member_:=public.member_id(p);
  if role_ is null then raise exception using message='You do not have access to this care profile',errcode='42501'; end if;
  select timezone into tz from elderly_profiles where id=p;
  id_:=nullif(payload_->>'id','')::uuid;
  expected_:=nullif(payload_->>'expected_version','')::integer;

  if kind_='save_medication' then
    if role_ not in('owner','coordinator') then raise exception using message='You cannot edit medication instructions',errcode='42501'; end if;
    if coalesce(length(trim(payload_->>'name')),0) not between 1 and 120 or coalesce(length(trim(payload_->>'dosage')),0) not between 1 and 250 or coalesce(length(trim(payload_->>'source')),0) not between 1 and 250 then raise exception 'Name, recorded dosage and instruction source are required'; end if;
    if payload_->>'form' not in('tablet','capsule','liquid','injection','drops','inhaler','other') then raise exception 'Invalid medication form'; end if;
    if exists(select 1 from jsonb_array_elements_text(payload_->'times') x where x !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid administration time'; end if;
    target_:=nullif(payload_->>'responsible_member_id','')::uuid;
    perform public.assert_responsible_member(p,target_);
    if id_ is null then
      insert into medications(profile_id,name,strength,dosage,form,route,instructions,source,start_date,end_date,responsible_member_id,entered_by)
      values(p,trim(payload_->>'name'),coalesce(payload_->>'strength',''),trim(payload_->>'dosage'),payload_->>'form',coalesce(payload_->>'route',''),coalesce(payload_->>'instructions',''),trim(payload_->>'source'),(payload_->>'start_date')::date,nullif(payload_->>'end_date','')::date,target_,uid) returning id into id_;
      old_status:='Added medication';
    else
      select * into med from medications where id=id_ and profile_id=p for update;
      if not found then raise exception using message='Medication not found',errcode='42501'; end if;
      if med.version is distinct from expected_ then raise exception using message='This medication changed. Refresh and try again.',errcode='40001'; end if;
      if coalesce(length(trim(payload_->>'reason')),0)=0 then raise exception 'Record a reason for changing the instructions'; end if;
      perform public.archive_medication(p,id_,payload_->>'reason',payload_->>'source');
      update medications set name=trim(payload_->>'name'),strength=coalesce(payload_->>'strength',''),dosage=trim(payload_->>'dosage'),form=payload_->>'form',route=coalesce(payload_->>'route',''),instructions=coalesce(payload_->>'instructions',''),source=trim(payload_->>'source'),start_date=(payload_->>'start_date')::date,end_date=nullif(payload_->>'end_date','')::date,responsible_member_id=target_,version=version+1,updated_at=now() where id=id_;
      -- Preserve every past, reported or assigned occurrence. Only replace future untouched scheduling rows.
      delete from dose_events d where d.medication_id=id_ and d.scheduled_at>now() and d.status='scheduled' and d.version=1 and not exists(select 1 from care_assignments a where a.dose_event_id=d.id);
      get diagnostics n=row_count;
      old_status:='Updated medication instructions';
      perform public.notify_care_circle(p,'medication_changed','Recorded medication instructions changed','A care circle member updated recorded instructions. Review the previous and current versions in CareRelay. Confirm unclear instructions with your healthcare professional. Timezone: '||tz,'medication:'||id_||':'||(med.version+1));
      if target_ is not null then
        perform public.enqueue_notification(p,(select user_id from care_members where id=target_),'medication_changed','Recorded instructions were updated','Review your assigned medication instructions and version history in CareRelay. Timezone: '||tz,'medication-assignee:'||id_||':'||(med.version+1)||':'||target_);
      end if;
    end if;
    insert into medication_schedules(profile_id,medication_id,times,days,reminder_minutes,reminders_enabled)
    values(p,id_,array(select jsonb_array_elements_text(payload_->'times')),array(select jsonb_array_elements_text(payload_->'days')::integer),(payload_->>'reminder_minutes')::integer,(payload_->>'reminders_enabled')::boolean)
    on conflict(medication_id) do update set times=excluded.times,days=excluded.days,reminder_minutes=excluded.reminder_minutes,reminders_enabled=excluded.reminders_enabled;
    perform public.write_audit(p,old_status,'medication',id_,jsonb_build_object('name',payload_->>'name','reason',payload_->>'reason','source',payload_->>'source','future_occurrences_regenerated',coalesce(n,0)));
    perform public.generate_profile_doses(p,7);
    return jsonb_build_object('id',id_,'message',old_status);
  end if;

  if kind_ in('medication_state','flag_medication') then
    if kind_='medication_state' and role_ not in('owner','coordinator') then raise exception using message='You cannot change medication schedules',errcode='42501'; end if;
    if kind_='flag_medication' and (role_='viewer' or not public.can_read_medication(p,id_)) then raise exception using message='You cannot flag this medication',errcode='42501'; end if;
    select * into med from medications where id=id_ and profile_id=p for update;
    if not found then raise exception using message='Medication not found',errcode='42501'; end if;
    if med.version is distinct from expected_ then raise exception using message='This medication changed. Refresh and try again.',errcode='40001'; end if;
    if kind_='flag_medication' then
      if coalesce(length(trim(payload_->>'note')),0)=0 then raise exception 'Describe what needs professional confirmation'; end if;
      perform public.archive_medication(p,id_,'Flagged for professional confirmation',med.source);
      update medications set flagged=true,flag_note=payload_->>'note',version=version+1,updated_at=now() where id=id_;
      perform public.write_audit(p,'Flagged instructions for professional confirmation','medication',id_,jsonb_build_object('name',med.name,'note',payload_->>'note'));
      perform public.notify_care_circle(p,'medication_flagged','Medication instructions need confirmation','A member flagged recorded instructions as unclear. Please contact the appropriate healthcare professional.','flag:'||id_||':'||(med.version+1));
    else
      state_:=payload_->>'state';
      if state_ not in('active','paused','completed') or coalesce(length(trim(payload_->>'reason')),0)=0 then raise exception 'A valid state and reason are required'; end if;
      perform public.archive_medication(p,id_,payload_->>'reason',med.source);
      update medications set state=state_,version=version+1,updated_at=now() where id=id_;
      delete from dose_events d where medication_id=id_ and scheduled_at>now() and status='scheduled' and version=1 and not exists(select 1 from care_assignments a where a.dose_event_id=d.id);
      perform public.generate_profile_doses(p,7);
      perform public.write_audit(p,case state_ when 'paused' then 'Paused a medication schedule' when 'completed' then 'Completed a medication schedule' else 'Resumed a medication schedule' end,'medication',id_,jsonb_build_object('name',med.name,'previous_state',med.state,'new_state',state_,'reason',payload_->>'reason'));
      perform public.notify_care_circle(p,'medication_changed','A medication schedule changed','A medication schedule was '||state_||'. Review the change and its recorded reason in CareRelay.','state:'||id_||':'||(med.version+1));
    end if;
    return jsonb_build_object('message','Medication updated');
  end if;

  if kind_='dose_status' then
    select * into dose from dose_events where id=id_ and profile_id=p for update;
    if not found then raise exception using message='Dose not found',errcode='42501'; end if;
    if role_='viewer' or (role_='caretaker' and dose.assigned_member_id is distinct from member_) then raise exception using message='Only the profile owner, coordinator or current assigned caretaker can record this dose',errcode='42501'; end if;
    if dose.version is distinct from expected_ then raise exception using message='Someone already updated this dose. Refresh to see their report.',errcode='40001'; end if;
    state_:=payload_->>'status';
    if state_ not in('self_reported_taken','assisted_recorded','declined','needs_help','unconfirmed','explicitly_missed') then raise exception 'Invalid dose status'; end if;
    if state_='self_reported_taken' and role_<>'owner' then raise exception 'Only the profile owner can self-report taking a dose. Use assistance recorded.'; end if;
    if dose.scheduled_at>now()+interval '30 minutes' then raise exception 'This dose is scheduled for later. Record the status closer to its scheduled time.'; end if;
    update dose_events set status=state_,reported_by=uid,recorded_at=now(),note=coalesce(payload_->>'note',''),version=version+1 where id=id_;
    perform public.write_audit(p,case state_ when 'self_reported_taken' then 'Self-reported a dose as taken' when 'assisted_recorded' then 'Recorded assistance with a dose' when 'declined' then 'Reported a declined dose' when 'needs_help' then 'Requested help with a dose' when 'explicitly_missed' then 'Explicitly reported a missed dose' else 'Marked dose status as unconfirmed' end,'dose',id_,jsonb_build_object('medication',dose.snapshot->>'name','previous_status',dose.status,'new_status',state_,'note',payload_->>'note','scheduled_at',dose.scheduled_at));
    if state_ in('self_reported_taken','assisted_recorded','declined','explicitly_missed') then
      for assignment_ in select * from care_assignments where dose_event_id=id_ and status<>'completed' for update loop
        update care_assignments set status='completed',proposed_owner_id=null,version=version+1,updated_at=now() where id=assignment_.id;
        perform public.write_audit(p,'Resolved a dose responsibility','assignment',assignment_.id,jsonb_build_object('dose_status',state_,'current_owner',assignment_.current_owner_id));
      end loop;
    end if;
    if state_='explicitly_missed' then
      perform public.notify_care_circle(p,'dose_missed','A dose was explicitly reported missed','An authorised member explicitly reported a missed dose. Review the report in CareRelay. Timezone: '||tz,'missed:'||id_||':'||(dose.version+1));
    elsif state_='needs_help' then
      perform public.notify_care_circle(p,'help_requested','Help requested with a care task','A care circle member requested assistance. Sign in to view the task and coordinate support.','dose-help:'||id_||':'||(dose.version+1));
    end if;
    return jsonb_build_object('message','Dose report saved. This is a recorded report, not verification of ingestion.');
  end if;

  if kind_='save_appointment' then
    if role_ not in('owner','coordinator') then raise exception using message='You cannot manage appointments',errcode='42501'; end if;
    if coalesce(length(trim(payload_->>'doctor_name')),0) not between 1 and 150 or coalesce(length(trim(payload_->>'clinic')),0) not between 1 and 200 then raise exception 'Doctor and clinic are required'; end if;
    target_:=nullif(payload_->>'accompanying_member_id','')::uuid;
    perform public.assert_responsible_member(p,target_);
    if id_ is null then
      insert into appointments(profile_id,doctor_name,specialty,starts_at,clinic,location,notes,accompanying_member_id,status,follow_up_notes,created_by)
      values(p,trim(payload_->>'doctor_name'),coalesce(payload_->>'specialty',''),(payload_->>'starts_at')::timestamptz,trim(payload_->>'clinic'),coalesce(payload_->>'location',''),coalesce(payload_->>'notes',''),target_,payload_->>'status',coalesce(payload_->>'follow_up_notes',''),uid) returning id into id_;
      old_status:='Created an appointment'; expected_:=0;
    else
      select * into appt from appointments where id=id_ and profile_id=p for update;
      if not found then raise exception using message='Appointment not found',errcode='42501'; end if;
      if appt.version is distinct from expected_ then raise exception using message='This appointment changed. Refresh and try again.',errcode='40001'; end if;
      update appointments set doctor_name=trim(payload_->>'doctor_name'),specialty=coalesce(payload_->>'specialty',''),starts_at=(payload_->>'starts_at')::timestamptz,clinic=trim(payload_->>'clinic'),location=coalesce(payload_->>'location',''),notes=coalesce(payload_->>'notes',''),accompanying_member_id=target_,status=payload_->>'status',follow_up_notes=coalesce(payload_->>'follow_up_notes',''),version=version+1,updated_at=now() where id=id_;
      old_status:='Updated an appointment';
      -- Keep an existing handoff and accompanying-person assignment consistent.
      for assignment_ in select * from care_assignments where appointment_id=id_ for update loop
        update care_assignments set previous_owner_id=case when current_owner_id is distinct from target_ then current_owner_id else previous_owner_id end,current_owner_id=target_,proposed_owner_id=null,status=case when payload_->>'status' in('completed','cancelled') then 'completed' else 'accepted' end,version=version+1,updated_at=now() where id=assignment_.id;
        perform public.write_audit(p,'Updated appointment responsibility','assignment',assignment_.id,jsonb_build_object('previous_owner',assignment_.current_owner_id,'current_owner',target_));
      end loop;
    end if;
    perform public.write_audit(p,old_status,'appointment',id_,jsonb_build_object('doctor',payload_->>'doctor_name','starts_at',payload_->>'starts_at','assigned_member',target_,'status',payload_->>'status'));
    if target_ is not null then
      perform public.enqueue_notification(p,(select user_id from care_members where id=target_),'appointment_changed','An appointment responsibility was updated','You are the recorded accompanying person for an appointment. Review the details in CareRelay. Timezone: '||tz,'appointment:'||id_||':'||(expected_+1)||':'||target_);
    end if;
    return jsonb_build_object('id',id_,'message','Appointment saved');
  end if;

  if kind_='delete_appointment' then
    if role_ not in('owner','coordinator') then raise exception using message='You cannot cancel appointments',errcode='42501'; end if;
    select * into appt from appointments where id=id_ and profile_id=p for update;
    if not found then raise exception using message='Appointment not found',errcode='42501'; end if;
    if appt.version is distinct from expected_ then raise exception using message='This appointment changed. Refresh and try again.',errcode='40001'; end if;
    update appointments set status='cancelled',version=version+1,updated_at=now() where id=id_;
    for assignment_ in select * from care_assignments where appointment_id=id_ and status<>'completed' for update loop
      update care_assignments set status='completed',proposed_owner_id=null,version=version+1,updated_at=now() where id=assignment_.id;
      perform public.write_audit(p,'Closed a cancelled appointment responsibility','assignment',assignment_.id,'{}');
    end loop;
    perform public.write_audit(p,'Cancelled an appointment','appointment',id_,jsonb_build_object('doctor',appt.doctor_name));
    if appt.accompanying_member_id is not null then
      perform public.enqueue_notification(p,(select user_id from care_members where id=appt.accompanying_member_id),'appointment_changed','An appointment was cancelled','A care circle appointment was marked cancelled. Review the details in CareRelay.','appointment-cancelled:'||id_||':'||(appt.version+1));
    end if;
    return jsonb_build_object('message','Appointment cancelled and preserved in history');
  end if;

  if kind_='handoff' then
    target_:=(payload_->>'to_member_id')::uuid;
    perform public.assert_responsible_member(p,target_);
    if target_=member_ and role_='caretaker' then raise exception 'Choose another authorised member'; end if;
    if id_ is null then
      if role_ not in('owner','coordinator') then raise exception using message='Only an owner or coordinator can create assignments',errcode='42501'; end if;
      old_owner:=null;
      if nullif(payload_->>'dose_event_id','') is not null then
        select * into dose from dose_events where id=(payload_->>'dose_event_id')::uuid and profile_id=p for update;
        if not found then raise exception using message='Dose not found',errcode='42501'; end if;
        if dose.status in('self_reported_taken','assisted_recorded','declined','explicitly_missed') then raise exception 'This dose already has a resolved report'; end if;
        old_owner:=dose.assigned_member_id;
      elsif nullif(payload_->>'appointment_id','') is not null then
        select * into appt from appointments where id=(payload_->>'appointment_id')::uuid and profile_id=p for update;
        if not found or appt.status<>'upcoming' then raise exception 'Select an upcoming appointment'; end if;
        old_owner:=appt.accompanying_member_id;
      end if;
      insert into care_assignments(profile_id,dose_event_id,appointment_id,title,current_owner_id,proposed_owner_id,initiated_by,status,note,due_at)
      values(p,nullif(payload_->>'dose_event_id','')::uuid,nullif(payload_->>'appointment_id','')::uuid,payload_->>'title',old_owner,target_,uid,'pending',coalesce(payload_->>'note',''),(payload_->>'due_at')::timestamptz) returning id into id_;
      expected_:=0;
    else
      -- Lock a linked occurrence first, matching dose_status lock ordering.
      select * into assignment_ from care_assignments where id=id_ and profile_id=p;
      if not found then raise exception using message='Task not found',errcode='42501'; end if;
      if assignment_.dose_event_id is not null then perform 1 from dose_events where id=assignment_.dose_event_id for update; end if;
      if assignment_.appointment_id is not null then perform 1 from appointments where id=assignment_.appointment_id for update; end if;
      select * into assignment_ from care_assignments where id=id_ and profile_id=p for update;
      if role_ not in('owner','coordinator') and not(role_='caretaker' and assignment_.current_owner_id=member_) then raise exception using message='You cannot transfer this responsibility',errcode='42501'; end if;
      if assignment_.version is distinct from expected_ then raise exception using message='This task changed. Refresh to see the current responsibility.',errcode='40001'; end if;
      if assignment_.status='completed' then raise exception 'This task has already been completed'; end if;
      old_owner:=assignment_.current_owner_id;
      update care_assignments set proposed_owner_id=target_,status='pending',note=coalesce(payload_->>'note',''),initiated_by=uid,version=version+1,updated_at=now() where id=id_;
    end if;
    if old_owner=target_ then raise exception 'This member is already responsible for the task'; end if;
    perform public.write_audit(p,'Requested a care handoff','assignment',id_,jsonb_build_object('title',payload_->>'title','current_owner',old_owner,'proposed_owner',target_,'note',payload_->>'note'));
    perform public.enqueue_notification(p,(select user_id from care_members where id=target_),'handoff_requested','A care handoff needs your response','You have been asked to take responsibility for a care task. Sign in to accept or decline. The current person remains responsible until you accept. Timezone: '||tz,'handoff:'||id_||':'||(expected_+1)||':'||target_);
    return jsonb_build_object('id',id_,'message','Handoff requested. Responsibility changes when the member accepts.');
  end if;

  if kind_ in('handoff_response','complete_task','task_help') then
    select * into assignment_ from care_assignments where id=id_ and profile_id=p;
    if not found then raise exception using message='Task not found',errcode='42501'; end if;
    if assignment_.dose_event_id is not null then perform 1 from dose_events where id=assignment_.dose_event_id for update; end if;
    if assignment_.appointment_id is not null then perform 1 from appointments where id=assignment_.appointment_id for update; end if;
    select * into assignment_ from care_assignments where id=id_ and profile_id=p for update;
    if assignment_.version is distinct from expected_ then raise exception using message='This task changed. Refresh to see the latest update.',errcode='40001'; end if;
    if kind_='handoff_response' then
      if assignment_.proposed_owner_id is distinct from member_ or assignment_.status<>'pending' then raise exception using message='Only the invited task recipient can respond to this pending handoff',errcode='42501'; end if;
      if (payload_->>'accept')::boolean then
        update care_assignments set previous_owner_id=current_owner_id,current_owner_id=proposed_owner_id,proposed_owner_id=null,status='accepted',note=coalesce(payload_->>'note',''),version=version+1,updated_at=now() where id=id_;
        if assignment_.dose_event_id is not null then update dose_events set assigned_member_id=member_,version=version+1 where id=assignment_.dose_event_id; end if;
        if assignment_.appointment_id is not null then update appointments set accompanying_member_id=member_,version=version+1,updated_at=now() where id=assignment_.appointment_id; end if;
        old_status:='Accepted a care handoff'; state_:='handoff_accepted';
      else
        update care_assignments set proposed_owner_id=null,status='declined',note=coalesce(payload_->>'note',''),version=version+1,updated_at=now() where id=id_;
        old_status:='Declined a care handoff'; state_:='handoff_declined';
      end if;
      perform public.write_audit(p,old_status,'assignment',id_,jsonb_build_object('title',assignment_.title,'previous_owner',assignment_.current_owner_id,'proposed_owner',member_,'current_owner',case when (payload_->>'accept')::boolean then member_ else assignment_.current_owner_id end,'note',payload_->>'note'));
      perform public.notify_care_circle(p,state_,'Care handoff '||case when (payload_->>'accept')::boolean then 'accepted' else 'declined' end,'A care task handoff received a response. Sign in to see the current responsible person and the recorded history.','response:'||id_||':'||(assignment_.version+1));
      if assignment_.current_owner_id is not null then perform public.enqueue_notification(p,(select user_id from care_members where id=assignment_.current_owner_id),state_,'Your care handoff received a response','Review the response and current responsibility in CareRelay.','response-owner:'||id_||':'||(assignment_.version+1)); end if;
      return jsonb_build_object('message',old_status);
    end if;
    if role_ not in('owner','coordinator') and not(role_='caretaker' and assignment_.current_owner_id=member_) then raise exception using message='You cannot update this task',errcode='42501'; end if;
    if assignment_.status='completed' then raise exception 'This task is already completed'; end if;
    if kind_='task_help' then
      if coalesce(length(trim(payload_->>'note')),0)=0 then raise exception 'Describe the help you need'; end if;
      update care_assignments set note=payload_->>'note',version=version+1,updated_at=now() where id=id_;
      perform public.write_audit(p,'Requested help with a care task','assignment',id_,jsonb_build_object('title',assignment_.title,'note',payload_->>'note'));
      perform public.notify_care_circle(p,'help_requested','A caretaker requested help','A member reported an issue with a care task. Sign in to coordinate support.','task-help:'||id_||':'||(assignment_.version+1));
      return jsonb_build_object('message','Help request recorded and the coordinator notified');
    end if;
    if assignment_.status='pending' then raise exception 'Resolve the pending handoff before completing this task'; end if;
    if assignment_.dose_event_id is not null and exists(select 1 from dose_events where id=assignment_.dose_event_id and status in('scheduled','unconfirmed','needs_help')) then raise exception 'Record the dose status first. Completing a task must not imply that a dose was taken.'; end if;
    update care_assignments set status='completed',proposed_owner_id=null,note=coalesce(payload_->>'note',''),version=version+1,updated_at=now() where id=id_;
    perform public.write_audit(p,'Completed a care task','assignment',id_,jsonb_build_object('title',assignment_.title,'current_owner',assignment_.current_owner_id,'note',payload_->>'note'));
    return jsonb_build_object('message','Task completed');
  end if;

  if kind_='invite' then
    if not public.can_invite(p) then raise exception using message='The profile owner has not granted you invitation permission',errcode='42501'; end if;
    if not public.consume_rate_limit('invite:'||uid,20,3600) then return jsonb_build_object('error','Too many invitations. Try again later.','code','rate_limit'); end if;
    state_:=payload_->>'role';
    if state_ not in('coordinator','caretaker','viewer') or (role_<>'owner' and state_='coordinator') then raise exception using message='Only the profile owner can invite coordinators',errcode='42501'; end if;
    code_:='CR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    hash_:=encode(sha256(convert_to(regexp_replace(code_,'[^A-Z0-9]','','g'),'UTF8')),'hex');
    insert into invitations(profile_id,code_hash,role,can_invite,invited_by)
      values(p,hash_,state_,role_='owner' and state_='coordinator' and coalesce((payload_->>'can_invite')::boolean,false),uid) returning id into id_;
    perform public.write_audit(p,'Created a care circle invitation','invitation',id_,jsonb_build_object('role',state_,'expires_in_hours',48));
    perform public.enqueue_notification(p,uid,'invitation_created','Your care circle invitation is ready','You created a single-use invitation that expires in 48 hours. Share the code from your current CareRelay session with the intended member. The code is never included in email.','invite-created:'||id_);
    return jsonb_build_object('id',id_,'code',code_,'message','Invitation created. Copy this code now; it is only displayed once.');
  end if;

  if kind_='revoke_invitation' then
    if not public.can_invite(p) then raise exception using message='You cannot manage invitations',errcode='42501'; end if;
    select * into invite_ from invitations where id=id_ and profile_id=p for update;
    if not found then raise exception using message='Invitation not found',errcode='42501'; end if;
    if invite_.consumed_at is not null then raise exception 'This invitation was already used. The profile owner can remove the member.'; end if;
    update invitations set revoked_at=now() where id=id_;
    perform public.write_audit(p,'Revoked an invitation','invitation',id_,jsonb_build_object('role',invite_.role));
    return jsonb_build_object('message','Invitation revoked');
  end if;

  if kind_='remove_member' then
    if role_<>'owner' then raise exception using message='Only the profile owner can revoke member access',errcode='42501'; end if;
    select * into cm from care_members where id=id_ and profile_id=p for update;
    if not found or cm.role='owner' then raise exception 'The profile owner must retain access'; end if;
    update care_members set active=false where id=id_;
    -- Surface every unresolved responsibility affected by revocation.
    for assignment_ in select * from care_assignments where profile_id=p and status<>'completed' and id_ in(current_owner_id,proposed_owner_id) for update loop
      update care_assignments set previous_owner_id=case when current_owner_id=id_ then current_owner_id else previous_owner_id end,current_owner_id=case when current_owner_id=id_ then null else current_owner_id end,proposed_owner_id=null,status='open',version=version+1,updated_at=now() where id=assignment_.id;
      perform public.write_audit(p,'Reopened a responsibility after access removal','assignment',assignment_.id,jsonb_build_object('removed_member',id_,'previous_owner',assignment_.current_owner_id));
    end loop;
    update dose_events set assigned_member_id=null,version=version+1 where profile_id=p and assigned_member_id=id_ and status in('scheduled','unconfirmed','needs_help');
    update medications set responsible_member_id=null where profile_id=p and responsible_member_id=id_;
    update appointments set accompanying_member_id=null,version=version+1,updated_at=now() where profile_id=p and accompanying_member_id=id_ and status='upcoming';
    update notifications set status='failed',error='Recipient access revoked' where profile_id=p and user_id=cm.user_id and status in('queued','unconfigured');
    perform public.write_audit(p,'Removed a care circle member','member',id_,jsonb_build_object('name',(select name from users where id=cm.user_id),'role',cm.role));
    perform public.notify_care_circle(p,'member_removed','Care circle access changed','A member was removed. Review unresolved responsibilities that may need reassignment.','removed:'||id_||':'||now());
    return jsonb_build_object('message','Access revoked. Affected responsibilities are now unresolved.');
  end if;

  if kind_='request_help' then
    if role_='viewer' then raise exception using message='Viewers cannot create care tasks',errcode='42501'; end if;
    if coalesce(length(trim(payload_->>'note')),0)=0 then raise exception 'Describe the help you need'; end if;
    insert into care_assignments(profile_id,title,initiated_by,status,note,due_at) values(p,'Help requested',uid,'open',payload_->>'note',now()) returning id into id_;
    perform public.write_audit(p,'Requested care support','assignment',id_,jsonb_build_object('note',payload_->>'note'));
    perform public.notify_care_circle(p,'help_requested','A care circle member needs help','A member requested care support. Sign in to review the request and offer assistance.','help:'||id_);
    return jsonb_build_object('message','Your help request has been recorded');
  end if;

  if kind_='settings' then
    update care_members set email_enabled=(payload_->>'email_enabled')::boolean,reminder_enabled=(payload_->>'reminder_enabled')::boolean,updates_enabled=(payload_->>'updates_enabled')::boolean where id=member_;
    if role_ in('owner','coordinator') then
      update elderly_profiles set grace_minutes=(payload_->>'grace_minutes')::integer,escalation_minutes=(payload_->>'escalation_minutes')::integer,appointment_reminders=array(select jsonb_array_elements_text(payload_->'appointment_reminders')::integer) where id=p;
    end if;
    perform public.write_audit(p,'Updated notification preferences','profile',p,'{}');
    return jsonb_build_object('message','Preferences saved');
  end if;

  if kind_='notification_read' then
    update notifications set read_at=now() where user_id=uid and profile_id=p and (coalesce((payload_->>'all')::boolean,false) or id=id_);
    return jsonb_build_object('message','Notifications marked as read');
  end if;

  raise exception 'Unknown care action';
end $$;

-- Prevent direct RPC calls to internal definer helpers, even with an authenticated token.
revoke execute on function public.write_audit(uuid,text,text,uuid,jsonb), public.assert_responsible_member(uuid,uuid), public.enqueue_notification(uuid,uuid,text,text,text,text), public.notify_care_circle(uuid,text,text,text,text), public.archive_medication(uuid,uuid,text,text), public.generate_profile_doses(uuid,integer), public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke execute on function public.sync_auth_user() from public,anon,authenticated;
revoke execute on function public.care_action(uuid,text,jsonb),public.care_bootstrap(uuid) from public,anon;
grant execute on function public.care_action(uuid,text,jsonb),public.care_bootstrap(uuid) to authenticated;

commit;
begin;

create function public.collect_profile_reminders(p uuid) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare e elderly_profiles%rowtype; d record; a record; cm record; lead_ integer; recipient_ uuid; before_ integer; after_ integer;
begin
  select * into e from elderly_profiles where id=p;
  select count(*) into before_ from notifications where profile_id=p;
  perform public.generate_profile_doses(p,7);
  for d in select * from dose_events where profile_id=p and status='scheduled' and scheduled_at<now()-make_interval(mins=>e.grace_minutes) for update loop
    update dose_events set status='unconfirmed',version=version+1 where id=d.id;
    perform public.write_audit(p,'Dose status has not yet been updated','dose',d.id,jsonb_build_object('previous_status','scheduled','new_status','unconfirmed','medication',d.snapshot->>'name','scheduled_at',d.scheduled_at));
  end loop;
  for d in select de.*,s.reminder_minutes,s.reminders_enabled from dose_events de join medication_schedules s on s.medication_id=de.medication_id where de.profile_id=p and de.scheduled_at>now()-interval '7 days' and de.scheduled_at<now()+interval '1 day' loop
    select user_id into recipient_ from care_members where id=d.assigned_member_id and active;
    recipient_:=coalesce(recipient_,e.owner_id);
    if d.reminders_enabled and d.status='scheduled' and d.scheduled_at>now() and d.scheduled_at<=now()+make_interval(mins=>d.reminder_minutes) then
      perform public.enqueue_notification(p,recipient_,'dose_reminder','An upcoming medication task is scheduled','A medication task is scheduled for '||to_char(d.scheduled_at at time zone e.timezone,'DD Mon YYYY, HH24:MI')||' ('||e.timezone||'). Sign in to view the recorded instructions and responsibility.','dose-reminder:'||d.id||':'||recipient_);
    end if;
    if d.status='unconfirmed' and d.scheduled_at<=now()-make_interval(mins=>e.grace_minutes) then
      perform public.enqueue_notification(p,recipient_,'dose_unconfirmed','Medication status has not yet been updated','Medication status has not yet been updated for a task scheduled at '||to_char(d.scheduled_at at time zone e.timezone,'DD Mon YYYY, HH24:MI')||' ('||e.timezone||'). Please confirm the recorded status. Unconfirmed does not mean missed.','dose-unconfirmed:'||d.id||':'||recipient_);
      if d.scheduled_at<=now()-make_interval(mins=>e.grace_minutes+e.escalation_minutes) then
        perform public.notify_care_circle(p,'dose_escalation','A medication status still needs confirmation','Medication status has not yet been updated after the configured grace and escalation periods. Please coordinate a status check. This is not a missed-dose report. Timezone: '||e.timezone,'dose-escalation:'||d.id);
      end if;
    end if;
  end loop;
  for a in select * from appointments where profile_id=p and status='upcoming' and starts_at>now() and starts_at<=now()+interval '7 days' loop
    foreach lead_ in array e.appointment_reminders loop
      if a.starts_at<=now()+make_interval(mins=>lead_) then
        perform public.enqueue_notification(p,e.owner_id,'appointment_reminder','An appointment is coming up','An appointment is scheduled for '||to_char(a.starts_at at time zone e.timezone,'DD Mon YYYY, HH24:MI')||' ('||e.timezone||'). Sign in for the clinic, accompanying person and recorded notes.','appointment-reminder:'||a.id||':'||a.version||':'||lead_||':'||e.owner_id);
        select user_id into recipient_ from care_members where id=a.accompanying_member_id and active;
        if recipient_ is not null then
          perform public.enqueue_notification(p,recipient_,'appointment_reminder','An appointment you accompany is coming up','You are the recorded accompanying person for an appointment at '||to_char(a.starts_at at time zone e.timezone,'DD Mon YYYY, HH24:MI')||' ('||e.timezone||'). Review the details in CareRelay.','appointment-reminder:'||a.id||':'||a.version||':'||lead_||':'||recipient_);
        end if;
      end if;
    end loop;
  end loop;
  select count(*) into after_ from notifications where profile_id=p;
  return after_-before_;
end $$;

create function public.care_test_reminder(profile_ uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if not public.can_manage(profile_) then raise exception using message='Only an owner or coordinator can test reminders',errcode='42501'; end if;
  if not public.consume_rate_limit('test-email:'||auth.uid(),5,3600) then return jsonb_build_object('error','Reminder test limit reached. Try again later.'); end if;
  n:=public.collect_profile_reminders(profile_);
  perform public.enqueue_notification(profile_,auth.uid(),'reminder_test','CareRelay reminder delivery test','Your CareRelay email notification configuration is being tested. Sign in to check delivery history. Timezone: '||(select timezone from elderly_profiles where id=profile_),'test:'||gen_random_uuid());
  perform public.write_audit(profile_,'Requested a reminder delivery test','profile',profile_,jsonb_build_object('reminders_generated',n));
  return jsonb_build_object('message','Test queued. Check the recorded delivery result.','generated',n+1);
end $$;

create function public.assert_worker(secret_ text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare stored_ text;
begin
  select value into stored_ from job_settings where key='cron_secret_hash';
  if coalesce(length(stored_),0)<>64 or length(coalesce(secret_,''))<32 or encode(sha256(convert_to(secret_,'UTF8')),'hex')<>stored_ then raise exception using message='Worker authorization failed',errcode='42501'; end if;
end $$;

create function public.care_worker(secret_ text,operation_ text,payload_ jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e record; n integer:=0; result_ jsonb; id_ uuid;
begin
  perform public.assert_worker(secret_);
  if operation_='collect' then
    for e in select id from elderly_profiles loop n:=n+public.collect_profile_reminders(e.id); end loop;
    return jsonb_build_object('generated',n);
  end if;
  if operation_='claim' then
    -- Recover crashed workers. Provider idempotency keys prevent duplicate sends on retry.
    update notifications set status='queued',locked_at=null,error='Recovered stale delivery lock' where status='processing' and locked_at<now()-interval '10 minutes';
    -- Revoked memberships and disabled preferences are rechecked at delivery time.
    update notifications n set status='failed',error='Recipient access revoked or email preference disabled'
    where n.status in('queued','unconfigured','failed') and exists(select 1 from care_members c where c.profile_id=n.profile_id and c.user_id=n.user_id and (not c.active or not c.email_enabled or (case when n.kind in('dose_reminder','dose_unconfirmed','dose_escalation','appointment_reminder') then not c.reminder_enabled else not c.updates_enabled end)));
    with candidates as (
      select n.id from notifications n join care_members c on c.profile_id=n.profile_id and c.user_id=n.user_id
      where n.status in('queued','unconfigured','failed') and n.attempts<5 and c.active and c.email_enabled and
      (case when n.kind in('dose_reminder','dose_unconfirmed','dose_escalation','appointment_reminder') then c.reminder_enabled else c.updates_enabled end)
      and (n.status<>'failed' or coalesce(n.locked_at,n.created_at)<now()-make_interval(mins=>greatest(n.attempts*2,1)))
      order by n.created_at limit least(coalesce((payload_->>'limit')::integer,30),100) for update of n skip locked
    ), claimed as (
      update notifications set status='processing',locked_at=now() where id in(select id from candidates) returning *
    ) select coalesce(jsonb_agg(to_jsonb(n)||jsonb_build_object('email',u.email)),'[]') into result_ from claimed n join users u on u.id=n.user_id;
    return result_;
  end if;
  if operation_='finish' then
    id_:=(payload_->>'id')::uuid;
    if payload_->>'status' not in('sent','failed','unconfigured') then raise exception 'Invalid delivery status'; end if;
    update notifications set status=payload_->>'status',error=payload_->>'error',provider_id=payload_->>'provider_id',sent_at=case when payload_->>'status'='sent' then now() else sent_at end,attempts=attempts+case when payload_->>'status'='unconfigured' then 0 else 1 end,locked_at=case when payload_->>'status'='unconfigured' then null else now() end
    where id=id_ and status='processing';
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unknown worker operation';
end $$;

revoke execute on function public.collect_profile_reminders(uuid),public.assert_worker(text) from public,anon,authenticated;
revoke execute on function public.care_test_reminder(uuid) from public,anon;
grant execute on function public.care_test_reminder(uuid) to authenticated;
revoke execute on function public.care_worker(text,text,jsonb) from public;
grant execute on function public.care_worker(text,text,jsonb) to anon,authenticated,service_role;
-- Helpers reveal only current-user-scoped booleans, never membership rows.
revoke execute on function public.member_role(uuid),public.member_id(uuid),public.has_access(uuid),public.can_manage(uuid),public.can_invite(uuid),public.can_read_medication(uuid,uuid),public.can_read_dose(uuid,uuid),public.can_read_appointment(uuid,uuid),public.can_read_audit(uuid,text,uuid,uuid) from public,anon;
grant execute on function public.member_role(uuid),public.member_id(uuid),public.has_access(uuid),public.can_manage(uuid),public.can_invite(uuid),public.can_read_medication(uuid,uuid),public.can_read_dose(uuid,uuid),public.can_read_appointment(uuid,uuid),public.can_read_audit(uuid,text,uuid,uuid) to authenticated;

commit;
