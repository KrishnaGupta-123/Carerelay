-- Avoid ambiguity between the worker count and whole-row notification aliases.
begin;
create or replace function public.care_worker(secret_ text,operation_ text,payload_ jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e record; generated_ integer:=0; result_ jsonb; id_ uuid;
begin
  perform public.assert_worker(secret_);
  if operation_='collect' then
    for e in select id from elderly_profiles loop generated_:=generated_+public.collect_profile_reminders(e.id); end loop;
    return jsonb_build_object('generated',generated_);
  end if;
  if operation_='claim' then
    -- Recover crashed workers. Provider idempotency keys prevent duplicate sends on retry.
    update notifications set status='queued',locked_at=null,error='Recovered stale delivery lock' where status='processing' and locked_at<now()-interval '10 minutes';
    -- Revoked memberships and disabled preferences are rechecked at delivery time.
    update notifications n set status='failed',error='Recipient access or preferences changed, or the task no longer needs this reminder'
    where n.status in('queued','unconfigured','failed') and (not public.notification_is_relevant(n) or exists(select 1 from care_members c where c.profile_id=n.profile_id and c.user_id=n.user_id and (not c.active or not c.email_enabled or (case when n.kind in('dose_reminder','dose_unconfirmed','dose_escalation','appointment_reminder') then not c.reminder_enabled else not c.updates_enabled end))));
    with candidates as (
      select n.id from notifications n join care_members c on c.profile_id=n.profile_id and c.user_id=n.user_id
      where n.status in('queued','unconfigured','failed') and n.attempts<5 and c.active and c.email_enabled and public.notification_is_relevant(n) and (nullif(payload_->>'profile','') is null or n.profile_id=(payload_->>'profile')::uuid) and
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



commit;
