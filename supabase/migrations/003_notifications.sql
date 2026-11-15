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
