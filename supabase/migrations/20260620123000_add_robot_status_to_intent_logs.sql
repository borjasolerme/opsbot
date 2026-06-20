alter table public.intent_logs
  add column robot_status text not null default 'skipped';

alter table public.intent_logs
  add constraint intent_logs_robot_status_check
  check (robot_status in ('sent', 'failed', 'skipped'));
