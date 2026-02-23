-- Initial v1 schema for Outputs To Outcomes

create extension if not exists pgcrypto;

create type public.outcome_status as enum ('active', 'archived', 'retired');
create type public.output_status as enum ('active', 'paused', 'retired');
create type public.frequency_type as enum ('daily', 'fixed_weekly', 'flexible_weekly');
create type public.shortfall_reason as enum (
  'time',
  'energy',
  'motivation',
  'external_blocker',
  'forgot',
  'other'
);
create type public.reflection_period_type as enum ('weekly', 'monthly');

create function public.is_valid_weekday_array(days smallint[])
returns boolean
language sql
immutable
as $$
  select
    days is not null
    and array_length(days, 1) between 1 and 7
    and not exists (select 1 from unnest(days) as d where d < 0 or d > 6)
    and array_length(days, 1) = (select count(distinct d) from unnest(days) as d);
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create function public.enforce_user_ownership()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if new.user_id is null then
      new.user_id := auth.uid();
    end if;

    if new.user_id <> auth.uid() then
      raise exception 'Cannot write data for another user';
    end if;
  end if;

  return new;
end;
$$;

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  start_of_week smallint not null default 1 check (start_of_week in (0, 1)),
  reminders_enabled boolean not null default false,
  daily_reminder_time time,
  weekly_review_reminder_time time,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  category text,
  status public.outcome_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.outputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome_id uuid not null references public.outcomes(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 240),
  frequency_type public.frequency_type not null,
  frequency_value smallint not null check (frequency_value between 1 and 7),
  schedule_weekdays smallint[],
  is_starter boolean not null default false,
  status public.output_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (
      frequency_type = 'daily'
      and frequency_value = 1
      and schedule_weekdays is null
    )
    or (
      frequency_type = 'fixed_weekly'
      and public.is_valid_weekday_array(schedule_weekdays)
      and frequency_value = array_length(schedule_weekdays, 1)
    )
    or (
      frequency_type = 'flexible_weekly'
      and frequency_value between 1 and 7
      and schedule_weekdays is null
    )
  )
);

create table public.output_change_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  output_id uuid not null references public.outputs(id) on delete cascade,
  change_type text not null,
  old_value jsonb not null default '{}'::jsonb,
  new_value jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  output_id uuid not null references public.outputs(id) on delete cascade,
  action_date date not null,
  completed integer not null default 0 check (completed >= 0),
  total integer not null default 1 check (total >= 0),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, output_id, action_date)
);

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome_id uuid not null references public.outcomes(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  unit text not null default '',
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, outcome_id, name)
);

create unique index metrics_one_primary_per_outcome
on public.metrics (outcome_id)
where is_primary;

create table public.metric_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_id uuid not null references public.metrics(id) on delete cascade,
  entry_date date not null,
  value numeric not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, metric_id, entry_date)
);

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome_id uuid not null references public.outcomes(id) on delete cascade,
  period_type public.reflection_period_type not null default 'weekly',
  period_start date not null,
  responses jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, outcome_id, period_type, period_start)
);

create table public.shortfall_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  output_id uuid not null references public.outputs(id) on delete cascade,
  occurrence_date date,
  week_start date,
  reason public.shortfall_reason not null,
  other_text text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (num_nonnulls(occurrence_date, week_start) = 1),
  check (
    (reason = 'other' and char_length(trim(coalesce(other_text, ''))) > 0)
    or (reason <> 'other' and other_text is null)
  )
);

create unique index shortfall_unique_occurrence
on public.shortfall_tags (user_id, output_id, occurrence_date)
where occurrence_date is not null;

create unique index shortfall_unique_week
on public.shortfall_tags (user_id, output_id, week_start)
where week_start is not null;

create index outcomes_user_status_idx on public.outcomes (user_id, status);
create index outputs_user_status_idx on public.outputs (user_id, status);
create index outputs_outcome_idx on public.outputs (outcome_id);
create index action_logs_user_output_date_idx on public.action_logs (user_id, output_id, action_date);
create index metrics_user_outcome_idx on public.metrics (user_id, outcome_id);
create index metric_entries_user_metric_date_idx on public.metric_entries (user_id, metric_id, entry_date);
create index reflections_user_outcome_period_idx on public.reflections (user_id, outcome_id, period_start);
create index shortfall_tags_user_output_idx on public.shortfall_tags (user_id, output_id);

create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

create trigger set_outcomes_updated_at
before update on public.outcomes
for each row execute function public.set_updated_at();

create trigger set_outputs_updated_at
before update on public.outputs
for each row execute function public.set_updated_at();

create trigger set_action_logs_updated_at
before update on public.action_logs
for each row execute function public.set_updated_at();

create trigger set_metrics_updated_at
before update on public.metrics
for each row execute function public.set_updated_at();

create trigger set_metric_entries_updated_at
before update on public.metric_entries
for each row execute function public.set_updated_at();

create trigger set_reflections_updated_at
before update on public.reflections
for each row execute function public.set_updated_at();

create trigger set_shortfall_tags_updated_at
before update on public.shortfall_tags
for each row execute function public.set_updated_at();

create trigger enforce_user_settings_owner
before insert on public.user_settings
for each row execute function public.enforce_user_ownership();

create trigger enforce_outcomes_owner
before insert on public.outcomes
for each row execute function public.enforce_user_ownership();

create trigger enforce_outputs_owner
before insert on public.outputs
for each row execute function public.enforce_user_ownership();

create trigger enforce_output_change_logs_owner
before insert on public.output_change_logs
for each row execute function public.enforce_user_ownership();

create trigger enforce_action_logs_owner
before insert on public.action_logs
for each row execute function public.enforce_user_ownership();

create trigger enforce_metrics_owner
before insert on public.metrics
for each row execute function public.enforce_user_ownership();

create trigger enforce_metric_entries_owner
before insert on public.metric_entries
for each row execute function public.enforce_user_ownership();

create trigger enforce_reflections_owner
before insert on public.reflections
for each row execute function public.enforce_user_ownership();

create trigger enforce_shortfall_tags_owner
before insert on public.shortfall_tags
for each row execute function public.enforce_user_ownership();

alter table public.user_settings enable row level security;
alter table public.outcomes enable row level security;
alter table public.outputs enable row level security;
alter table public.output_change_logs enable row level security;
alter table public.action_logs enable row level security;
alter table public.metrics enable row level security;
alter table public.metric_entries enable row level security;
alter table public.reflections enable row level security;
alter table public.shortfall_tags enable row level security;

create policy user_settings_owner on public.user_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy outcomes_owner on public.outcomes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy outputs_owner on public.outputs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy output_change_logs_owner on public.output_change_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy action_logs_owner on public.action_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy metrics_owner on public.metrics
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy metric_entries_owner on public.metric_entries
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy reflections_owner on public.reflections
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy shortfall_tags_owner on public.shortfall_tags
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create function public.week_start_for_user(p_user_id uuid, p_target_date date)
returns date
language sql
stable
as $$
  with settings as (
    select coalesce((select us.start_of_week from public.user_settings us where us.user_id = p_user_id), 1) as sow
  )
  select (
    p_target_date
    - ((extract(dow from p_target_date)::int - settings.sow + 7) % 7)
  )::date
  from settings;
$$;

create function public.get_daily_dashboard(p_target_date date default (timezone('utc', now())::date))
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_start_of_week smallint := 1;
  v_week_start date;
  v_week_end date;
  v_today_dow smallint;
  v_yesterday date;
  v_yesterday_dow smallint;
  v_missed_yesterday_count integer;
  v_payload jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(us.start_of_week, 1)
  into v_start_of_week
  from public.user_settings us
  where us.user_id = v_user_id;

  v_today_dow := extract(dow from p_target_date)::smallint;
  v_week_start := (p_target_date - ((v_today_dow - v_start_of_week + 7) % 7))::date;
  v_week_end := v_week_start + 6;

  v_yesterday := p_target_date - 1;
  v_yesterday_dow := extract(dow from v_yesterday)::smallint;

  with base_outputs as (
    select
      o.id,
      o.user_id,
      o.outcome_id,
      o.description,
      o.frequency_type,
      o.frequency_value,
      o.schedule_weekdays,
      o.is_starter,
      o.status,
      case
        when o.frequency_type = 'daily' then true
        when o.frequency_type = 'fixed_weekly' then v_yesterday_dow = any(o.schedule_weekdays)
        when o.frequency_type = 'flexible_weekly' then true
        else false
      end as scheduled_yesterday
    from public.outputs o
    join public.outcomes oc on oc.id = o.outcome_id and oc.user_id = o.user_id
    where o.user_id = v_user_id
      and o.status = 'active'
      and oc.status = 'active'
  )
  select count(*)::int
  into v_missed_yesterday_count
  from base_outputs bo
  left join public.action_logs al
    on al.output_id = bo.id
   and al.user_id = bo.user_id
   and al.action_date = v_yesterday
  where bo.scheduled_yesterday
    and coalesce(al.completed, 0) = 0;

  with active_outcomes as (
    select
      oc.id,
      oc.title,
      oc.category,
      oc.status,
      oc.created_at
    from public.outcomes oc
    where oc.user_id = v_user_id
      and oc.status = 'active'
    order by oc.created_at desc
  ),
  base_outputs as (
    select
      o.id,
      o.outcome_id,
      o.description,
      o.frequency_type,
      o.frequency_value,
      o.schedule_weekdays,
      o.is_starter,
      o.status,
      case
        when o.frequency_type = 'daily' then true
        when o.frequency_type = 'fixed_weekly' then v_today_dow = any(o.schedule_weekdays)
        when o.frequency_type = 'flexible_weekly' then true
        else false
      end as scheduled_today
    from public.outputs o
    join public.outcomes oc on oc.id = o.outcome_id and oc.user_id = o.user_id
    where o.user_id = v_user_id
      and o.status = 'active'
      and oc.status = 'active'
  ),
  today_logs as (
    select al.output_id, al.completed, al.total, al.notes
    from public.action_logs al
    where al.user_id = v_user_id
      and al.action_date = p_target_date
  ),
  week_days as (
    select generate_series(v_week_start, v_week_end, interval '1 day')::date as day
  ),
  scheduled_counts as (
    select
      bo.id as output_id,
      case
        when bo.frequency_type = 'daily' then 7::numeric
        when bo.frequency_type = 'fixed_weekly' then count(*)::numeric
        when bo.frequency_type = 'flexible_weekly' then bo.frequency_value::numeric
      end as target_units
    from base_outputs bo
    left join week_days wd
      on bo.frequency_type = 'fixed_weekly'
     and extract(dow from wd.day)::smallint = any(bo.schedule_weekdays)
    group by bo.id, bo.frequency_type, bo.frequency_value
  ),
  weekly_progress as (
    select
      bo.id as output_id,
      coalesce(
        sum(
          case
            when bo.frequency_type = 'flexible_weekly' then greatest(al.completed, 0)::numeric
            when al.total > 0 then least(al.completed::numeric / al.total::numeric, 1)
            else 0
          end
        ),
        0
      ) as completed_units
    from base_outputs bo
    left join public.action_logs al
      on al.output_id = bo.id
     and al.user_id = v_user_id
     and al.action_date between v_week_start and v_week_end
    group by bo.id
  ),
  output_rows as (
    select
      bo.outcome_id,
      bo.id,
      bo.description,
      bo.frequency_type,
      bo.frequency_value,
      bo.schedule_weekdays,
      bo.is_starter,
      bo.scheduled_today,
      coalesce(sc.target_units, 0) as target_units,
      coalesce(wp.completed_units, 0) as completed_units,
      tl.completed as today_completed,
      tl.total as today_total,
      tl.notes as today_notes
    from base_outputs bo
    left join scheduled_counts sc on sc.output_id = bo.id
    left join weekly_progress wp on wp.output_id = bo.id
    left join today_logs tl on tl.output_id = bo.id
  )
  select jsonb_build_object(
    'date', p_target_date,
    'week_start', v_week_start,
    'week_end', v_week_end,
    'start_of_week', v_start_of_week,
    'missed_yesterday_count', v_missed_yesterday_count,
    'outcomes', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ao.id,
          'title', ao.title,
          'category', ao.category,
          'outputs', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', r.id,
                  'description', r.description,
                  'frequency_type', r.frequency_type,
                  'frequency_value', r.frequency_value,
                  'schedule_weekdays', r.schedule_weekdays,
                  'is_starter', r.is_starter,
                  'scheduled_today', r.scheduled_today,
                  'today_log', case
                    when r.today_total is null then null
                    else jsonb_build_object(
                      'completed', r.today_completed,
                      'total', r.today_total,
                      'notes', r.today_notes
                    )
                  end,
                  'weekly_progress', jsonb_build_object(
                    'completed', r.completed_units,
                    'target', r.target_units,
                    'rate', case
                      when r.target_units > 0 then round((r.completed_units / r.target_units) * 100, 2)
                      else 0
                    end,
                    'target_met', r.completed_units >= r.target_units
                  )
                )
                order by r.id
              ),
              '[]'::jsonb
            )
            from output_rows r
            where r.outcome_id = ao.id
          )
        )
      ),
      '[]'::jsonb
    )
  )
  into v_payload
  from active_outcomes ao;

  return v_payload;
end;
$$;

create function public.purge_my_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.shortfall_tags where user_id = v_user_id;
  delete from public.reflections where user_id = v_user_id;
  delete from public.metric_entries where user_id = v_user_id;
  delete from public.metrics where user_id = v_user_id;
  delete from public.action_logs where user_id = v_user_id;
  delete from public.output_change_logs where user_id = v_user_id;
  delete from public.outputs where user_id = v_user_id;
  delete from public.outcomes where user_id = v_user_id;
  delete from public.user_settings where user_id = v_user_id;
end;
$$;

grant execute on function public.get_daily_dashboard(date) to authenticated;
grant execute on function public.purge_my_data() to authenticated;
