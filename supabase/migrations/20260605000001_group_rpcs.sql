-- create_group: makes a group + adds the caller as admin, bypassing the
-- bootstrap RLS gap (a user can't insert their own first admin membership).
create or replace function create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  code text;
  attempts int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into groups (name, invite_code, created_by)
      values (trim(group_name), code, auth.uid())
      returning id into new_id;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 5 then raise; end if;
    end;
  end loop;

  insert into group_members (group_id, user_id, role)
  values (new_id, auth.uid(), 'admin');

  return new_id;
end; $$;

-- join_group: looks up a group by invite code (members-only RLS would block a
-- non-member SELECT) and adds the caller as a member. Returns null if no match.
create or replace function join_group(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into gid
  from groups
  where groups.invite_code = upper(trim(join_group.invite_code));

  if gid is null then
    return null;
  end if;

  insert into group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  return gid;
end; $$;

grant execute on function create_group(text) to authenticated;
grant execute on function join_group(text)  to authenticated;
