-- Apply in a new Supabase project. Only RPCs may mutate balances or inventory.
create extension if not exists pgcrypto with schema extensions;
create table public.nt_members (id uuid primary key references auth.users(id) on delete cascade, balance integer not null default 0 check(balance>=0), created_at timestamptz not null default now());
create table public.nt_admins (id uuid primary key references auth.users(id) on delete cascade);
create table public.nt_campaigns (id text primary key, name text not null, cost integer not null check(cost>0), total integer not null check(total>0), remaining integer not null check(remaining>=0 and remaining<=total), active boolean not null default false, pool jsonb not null, last_one boolean not null default false, last_awarded boolean not null default false);
create table public.nt_draws (id uuid primary key, member_id uuid not null references public.nt_members, campaign_id text not null references public.nt_campaigns, count integer not null, cost integer not null, result jsonb not null, created_at timestamptz not null default now());
create table public.nt_requests (id uuid primary key, member_id uuid not null references public.nt_members, method text not null check(method in ('発送','チケット交換')), status text not null, recipient jsonb not null, items jsonb not null, created_at timestamptz not null default now());
create table public.nt_inventory (id uuid primary key default gen_random_uuid(), member_id uuid not null references public.nt_members, prize_id text not null, status text not null default '保有中' check(status in ('保有中','申請中','交換済み')), request_id uuid references public.nt_requests, created_at timestamptz not null default now());
create table public.nt_ledger (id uuid primary key default gen_random_uuid(), member_id uuid not null references public.nt_members, amount integer not null, balance_after integer not null, label text not null, kind text not null, operation_id uuid unique, created_at timestamptz not null default now());
create table public.nt_claims (member_id uuid not null references public.nt_members, mission text not null, claim_day text not null, primary key(member_id,mission,claim_day));
create table public.nt_audit (id uuid primary key default gen_random_uuid(), actor uuid not null references auth.users, label text not null, created_at timestamptz not null default now());
create index nt_inventory_member on public.nt_inventory(member_id,status);
create index nt_draws_member on public.nt_draws(member_id,created_at desc);
create index nt_requests_member on public.nt_requests(member_id,created_at desc);
create index nt_ledger_member on public.nt_ledger(member_id,created_at desc);

alter table public.nt_members enable row level security;
alter table public.nt_admins enable row level security;
alter table public.nt_campaigns enable row level security;
alter table public.nt_draws enable row level security;
alter table public.nt_requests enable row level security;
alter table public.nt_inventory enable row level security;
alter table public.nt_ledger enable row level security;
alter table public.nt_claims enable row level security;
alter table public.nt_audit enable row level security;
revoke all on public.nt_members,public.nt_admins,public.nt_campaigns,public.nt_draws,public.nt_requests,public.nt_inventory,public.nt_ledger,public.nt_claims,public.nt_audit from anon,authenticated;

-- Seeded catalogs are stopped until the operator confirms real stock and prizes.
insert into public.nt_campaigns(id,name,cost,total,remaining,pool,last_one) values
('neon','妖狐雷光録',1,1000,1000,'["neonSSR","neonSR","neonR1","neonR2","neonN1","neonN2","neonN3"]',false),
('retro','雷光狛犬絵巻',3,300,300,'["retroSSR","retroSR","retroR1","retroR2","retroN1","retroN2","retroN3"]',false),
('last','月影猫又絵巻',2,3,3,'["lastSSR","lastSR","lastR1","lastR2","lastN1","lastN2","lastN3"]',true),
('solar','暁天鳳凰録',2,500,500,'["solarSSR","solarSR","neonR1","neonR2","neonN1","neonN2","neonN3"]',false),
('ocean','蒼海龍絵巻',2,400,400,'["oceanSSR","oceanSR","lastR1","lastR2","lastN1","lastN2","lastN3"]',false);

create function public.nt_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); payload jsonb;
begin
 if uid is null then raise exception 'ログインが必要です'; end if;
 insert into public.nt_members(id) values(uid) on conflict do nothing;
 select jsonb_build_object(
 'version',2,'balance',m.balance,'isAdmin',exists(select 1 from public.nt_admins where id=uid),
 'campaigns',(select jsonb_object_agg(id,jsonb_build_object('remaining',remaining,'active',active,'lastOneAwarded',last_awarded,'total',total,'cost',cost)) from public.nt_campaigns),
 'inventory',coalesce((select jsonb_agg(jsonb_build_object('itemId',id,'prizeId',prize_id,'status',status,'requestId',request_id,'acquiredAt',created_at) order by created_at desc) from public.nt_inventory where member_id=uid),'[]'::jsonb),
 'ticketLedger',coalesce((select jsonb_agg(jsonb_build_object('id',id,'amount',amount,'balanceAfter',balance_after,'label',label,'type',kind,'at',created_at) order by created_at desc) from (select * from public.nt_ledger where member_id=uid order by created_at desc limit 300) l),'[]'::jsonb),
 'drawHistory',coalesce((select jsonb_agg(result || jsonb_build_object('id',id,'at',created_at,'campaignKey',campaign_id,'cost',cost,'count',count) order by created_at desc) from (select * from public.nt_draws where member_id=uid order by created_at desc limit 120) d),'[]'::jsonb),
 'exchangeRequests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'at',created_at,'items',items,'method',method,'status',status,'addressMasked',left(recipient->>'address',4)||'…') order by created_at desc) from public.nt_requests where member_id=uid),'[]'::jsonb),
 'missionClaims',coalesce((select jsonb_object_agg(mission,case when mission='daily' then to_jsonb(claim_day) else 'true'::jsonb end) from public.nt_claims where member_id=uid and (mission!='daily' or claim_day=to_char(now() at time zone 'Asia/Tokyo','YYYY-MM-DD'))),'{}'::jsonb),
 'adminAudit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'at',created_at,'label',label) order by created_at desc) from (select * from public.nt_audit where actor=uid order by created_at desc limit 120) a),'[]'::jsonb)
 ) into payload from public.nt_members m where m.id=uid;
 return payload;
end $$;

create function public.nt_draw(p_campaign text,p_count integer,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); c public.nt_campaigns; balance_now integer; existing public.nt_draws; ids jsonb:='[]'; summary jsonb:='{"SSR":0,"SR":0,"R":0,"N":0}'; roll integer; ix integer; rarity text; prize text; bonus boolean; result jsonb;
begin
 if uid is null then raise exception 'ログインが必要です'; end if;
 if p_key is null or p_count not in (1,10,100) then raise exception '無効な抽選リクエスト'; end if;
 select balance into balance_now from public.nt_members where id=uid for update;
 if not found then raise exception '会員情報を読み込んでください'; end if;
 select * into existing from public.nt_draws where id=p_key;
 if found then
  if existing.member_id!=uid or existing.campaign_id!=p_campaign or existing.count!=p_count then raise exception '取引IDが一致しません'; end if;
  return jsonb_build_object('state',public.nt_state(),'result',existing.result);
 end if;
 select * into c from public.nt_campaigns where id=p_campaign for update;
 if not found or not c.active then raise exception 'このガチャは現在停止中です'; end if;
 if c.remaining<p_count or balance_now<c.cost*p_count then raise exception 'チケットまたは口数が不足しています'; end if;
 for i in 1..p_count loop
  loop roll:=get_byte(extensions.gen_random_bytes(1),0); exit when roll<200; end loop;
  roll:=roll%100;
  if roll<1 then ix:=0;rarity:='SSR'; elsif roll<10 then ix:=1;rarity:='SR'; elsif roll<40 then ix:=2+(get_byte(extensions.gen_random_bytes(1),0)%2);rarity:='R'; else
   loop ix:=get_byte(extensions.gen_random_bytes(1),0);exit when ix<255;end loop;ix:=4+(ix%3);rarity:='N';
  end if;
  prize:=c.pool->>ix;
  ids:=ids||jsonb_build_array(prize);
  summary:=jsonb_set(summary,array[rarity],to_jsonb((summary->>rarity)::integer+1));
  insert into public.nt_inventory(member_id,prize_id) values(uid,prize);
 end loop;
 bonus:=c.last_one and c.remaining=p_count and not c.last_awarded;
 if bonus then insert into public.nt_inventory(member_id,prize_id) values(uid,'lastBonus'); end if;
 update public.nt_campaigns set remaining=remaining-p_count,last_awarded=last_awarded or bonus where id=c.id;
 update public.nt_members set balance=balance-c.cost*p_count where id=uid returning balance into balance_now;
 result:=jsonb_build_object('resultIds',ids,'lastBonus',bonus,'summary',summary,'count',p_count,'transactionId',p_key);
 insert into public.nt_draws(id,member_id,campaign_id,count,cost,result) values(p_key,uid,c.id,p_count,c.cost*p_count,result);
 insert into public.nt_ledger(member_id,amount,balance_after,label,kind,operation_id) values(uid,-c.cost*p_count,balance_now,c.name||' '||p_count||'回','抽選消費',p_key);
 return jsonb_build_object('state',public.nt_state(),'result',result);
end $$;

create function public.nt_claim(p_mission text,p_answers jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); claim_day text; amount integer; b integer;
begin
 if uid is null then raise exception 'ログインが必要です'; end if;
 if p_mission='daily' then amount:=20;claim_day:=to_char(now() at time zone 'Asia/Tokyo','YYYY-MM-DD');
 elsif p_mission='survey' then
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)!=3 then raise exception 'アンケートの回答が必要です'; end if;
  if exists(select 1 from jsonb_array_elements(p_answers) a where jsonb_typeof(a)!='string' or length(a#>>'{}') not between 1 and 100) then raise exception '回答内容が不正です'; end if;
  amount:=50;claim_day:='once';
 else raise exception '外部成果の認証が必要です'; end if;
 perform 1 from public.nt_members where id=uid for update;
 if not found then raise exception '会員情報がありません'; end if;
 insert into public.nt_claims values(uid,p_mission,claim_day) on conflict do nothing;
 if not found then raise exception 'この報酬は受け取り済みです'; end if;
 update public.nt_members set balance=balance+amount where id=uid returning balance into b;
 insert into public.nt_ledger(member_id,amount,balance_after,label,kind) values(uid,amount,b,p_mission,'ミッション付与');
 return public.nt_state();
end $$;

create function public.nt_exchange(p_prizes jsonb,p_method text,p_recipient jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); selected jsonb; qty integer; b integer; existing public.nt_requests;
begin
 if uid is null then raise exception 'ログインが必要です'; end if;
 if p_key is null or p_method not in ('発送','チケット交換') or jsonb_typeof(p_prizes) is distinct from 'array' or jsonb_array_length(p_prizes) not between 1 and 100 then raise exception '申請内容が不正です'; end if;
 if p_method='発送' and (length(trim(coalesce(p_recipient->>'name',''))) not between 1 and 100 or length(trim(coalesce(p_recipient->>'address',''))) not between 5 and 500 or coalesce(p_recipient->>'postal','')!~'^[0-9]{3}-?[0-9]{4}$') then raise exception '配送先を確認してください'; end if;
 perform 1 from public.nt_members where id=uid for update;
 select * into existing from public.nt_requests where id=p_key;
 if found then
  if existing.member_id!=uid or existing.method!=p_method or existing.recipient is distinct from p_recipient or (select jsonb_agg(value order by value) from jsonb_array_elements_text(p_prizes)) is distinct from (select jsonb_agg(item->>'prizeId' order by item->>'prizeId') from jsonb_array_elements(existing.items) item) then raise exception '申請IDが一致しません'; end if;
  return jsonb_build_object('state',public.nt_state(),'id',p_key);
 end if;
 select jsonb_agg(jsonb_build_object('prizeId',prize_id,'quantity',n)),sum(n)::integer into selected,qty from (select prize_id,count(*) n from public.nt_inventory where member_id=uid and status='保有中' and prize_id in (select jsonb_array_elements_text(p_prizes)) group by prize_id) grouped;
 if qty is null or qty=0 or jsonb_array_length(selected)!=jsonb_array_length(p_prizes) then raise exception '交換可能な景品がありません'; end if;
 insert into public.nt_requests values(p_key,uid,p_method,case when p_method='発送' then '受付済み' else '交換済み' end,p_recipient,selected,now());
 update public.nt_inventory set status=case when p_method='発送' then '申請中' else '交換済み' end,request_id=p_key where member_id=uid and status='保有中' and prize_id in(select jsonb_array_elements_text(p_prizes));
 if p_method='チケット交換' then
  update public.nt_members set balance=balance+qty*5 where id=uid returning balance into b;
  insert into public.nt_ledger(member_id,amount,balance_after,label,kind,operation_id) values(uid,qty*5,b,'景品チケット交換','景品交換',p_key);
 end if;
 return jsonb_build_object('state',public.nt_state(),'id',p_key);
end $$;

create function public.nt_admin(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); b integer; target uuid; op uuid; req public.nt_requests; new_status text;
begin
 if uid is null or not exists(select 1 from public.nt_admins where id=uid) then raise exception '管理者権限が必要です'; end if;
 if p_action='grant' then
  target:=(p_data->>'member')::uuid;op:=(p_data->>'key')::uuid;
  if op is null or (p_data->>'amount')::integer not between 1 and 10000 or length(coalesce(p_data->>'reason','')) not between 1 and 200 then raise exception '付与内容を確認してください'; end if;
  perform 1 from public.nt_members where id=target for update;
  if not found then raise exception '対象会員がありません'; end if;
  if exists(select 1 from public.nt_ledger where operation_id=op) then raise exception '付与は処理済みです'; end if;
  update public.nt_members set balance=balance+(p_data->>'amount')::integer where id=target returning balance into b;
  insert into public.nt_ledger(member_id,amount,balance_after,label,kind,operation_id) values(target,(p_data->>'amount')::integer,b,p_data->>'reason','管理付与',op);
 elsif p_action='campaign' then
  update public.nt_campaigns set active=(p_data->>'active')::boolean where id=p_data->>'campaign';
  if not found then raise exception 'ガチャが見つかりません'; end if;
 elsif p_action='status' then
  select * into req from public.nt_requests where id=(p_data->>'request')::uuid for update;
  if not found or req.method!='発送' then raise exception '発送申請が見つかりません'; end if;
  new_status:=p_data->>'status';
  if new_status not in ('受付済み','内容確認済み','発送準備中','発送済み') or (req.status='発送済み' and new_status!='発送済み') then raise exception 'ステータス変更が不正です'; end if;
  update public.nt_requests set status=new_status where id=req.id;
  if new_status='発送済み' then update public.nt_inventory set status='交換済み' where request_id=req.id; end if;
 else raise exception '無効な管理操作です'; end if;
 insert into public.nt_audit(actor,label) values(uid,p_action||':'||coalesce(p_data->>'reason',p_data->>'campaign',p_data->>'status',''));
 return public.nt_state();
end $$;

-- Explicit whitelist: no anonymous access and no default PUBLIC execution.
create function public.nt_admin_state() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.nt_admins where id=auth.uid()) then raise exception '管理者権限が必要です'; end if;
 return jsonb_build_object(
 'memberCount',(select count(*) from public.nt_members),
 'drawCount',(select coalesce(sum(count),0) from public.nt_draws),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'memberId',member_id,'at',created_at,'method',method,'status',status,'items',items,'addressMasked',(recipient->>'name')||' / '||(recipient->>'postal')||' / '||(recipient->>'address')) order by created_at desc) from (select * from public.nt_requests order by created_at desc limit 100) r),'[]'::jsonb),
 'draws',coalesce((select jsonb_agg(result || jsonb_build_object('id',id,'at',created_at,'memberId',member_id,'campaignKey',campaign_id,'cost',cost,'count',count) order by created_at desc) from (select * from public.nt_draws order by created_at desc limit 120) d),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'at',created_at,'label',label) order by created_at desc) from (select * from public.nt_audit order by created_at desc limit 100) a),'[]'::jsonb));
end $$;
revoke all on function public.nt_admin_state() from public,anon;
grant execute on function public.nt_admin_state() to authenticated;
revoke all on function public.nt_state(),public.nt_draw(text,integer,uuid),public.nt_claim(text,jsonb),public.nt_exchange(jsonb,text,jsonb,uuid),public.nt_admin(text,jsonb) from public,anon;
grant execute on function public.nt_state(),public.nt_draw(text,integer,uuid),public.nt_claim(text,jsonb),public.nt_exchange(jsonb,text,jsonb,uuid),public.nt_admin(text,jsonb) to authenticated;
