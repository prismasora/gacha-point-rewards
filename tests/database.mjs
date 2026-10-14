import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE || '/tmp/neon-ticket-db-qa/node_modules/@electric-sql/pglite/dist/index.js'));
const db = new PGlite();
// Test-only Auth and random-byte substitutes. Production uses Supabase Auth and pgcrypto.
await db.exec(`create schema auth; create schema extensions;
create role anon; create role authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('00',$1),'hex')$$;`);
const sql = await readFile(new URL('../supabase/migrations/202610140001_core.sql', import.meta.url), 'utf8');
await db.exec(sql.replace('create extension if not exists pgcrypto with schema extensions;', ''));
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
await db.query('insert into auth.users values($1),($2)', [a,b]);
let passed = 0;
async function rpc(name, args = [], signature = '') {
  return (await db.query(`select public.${name}(${signature}) as value`, args)).rows[0].value;
}
async function uid(id) { await db.query(`select set_config('test.uid',$1,false)`,[id]); }
function pass(label) { passed++; process.stdout.write(`PASS ${label}\n`); }
try {
  await uid(a); const initial = await rpc('nt_state');
  assert.equal(initial.balance,0); assert.equal(initial.inventory.length,0); pass('new accounts have no fabricated rewards');
  await db.exec('set role anon');
  await assert.rejects(rpc('nt_state')); pass('anonymous RPC is rejected');
  await db.exec('reset role; set role authenticated');
  await assert.rejects(db.query('update public.nt_members set balance=9999')); pass('direct authenticated balance writes are denied');
  await assert.rejects(rpc('nt_admin',['grant',{}],'$1,$2')); pass('non-admin privilege escalation is denied');
  const daily = await rpc('nt_claim',['daily',null],'$1,$2'); assert.equal(daily.balance,20); pass('server credits daily reward');
  await assert.rejects(rpc('nt_claim',['daily',null],'$1,$2')); pass('duplicate daily rewards are denied');
  await assert.rejects(rpc('nt_claim',['ad',null],'$1,$2')); pass('unverified external ad rewards are denied');
  await assert.rejects(rpc('nt_claim',['survey',[]],'$1,$2')); pass('invalid survey is rejected');
  const survey = await rpc('nt_claim',['survey',['a','b','c']],'$1,$2'); assert.equal(survey.balance,70); pass('validated survey credits once');
  await db.exec('reset role'); await db.query("update public.nt_campaigns set active=true where id='solar'"); await db.exec('set role authenticated');
  const key='33333333-3333-4333-8333-333333333333';
  const draw = await rpc('nt_draw',['solar',10,key],'$1,$2,$3');
  assert.equal(draw.state.balance,50); assert.equal(draw.state.campaigns.solar.remaining,490); assert.equal(draw.result.resultIds.length,10); pass('transactional draw debits tickets, stock and stores inventory');
  const retry = await rpc('nt_draw',['solar',10,key],'$1,$2,$3'); assert.equal(retry.state.balance,50); assert.equal(retry.state.inventory.length,10); pass('idempotent draw retry cannot debit twice');
  await assert.rejects(rpc('nt_draw',['solar',1,key],'$1,$2,$3')); pass('idempotency key cannot be reused for different draw');
  await assert.rejects(rpc('nt_draw',['solar',100,'44444444-4444-4444-8444-444444444444'],'$1,$2,$3')); pass('insufficient tickets cannot create draw');
  await uid(b); const other = await rpc('nt_state'); assert.equal(other.inventory.length,0); assert.equal(other.balance,0); pass('second account cannot read first account rewards');
  await assert.rejects(rpc('nt_draw',['solar',10,key],'$1,$2,$3')); pass('another account cannot replay a transaction');
  await uid(a);
  const exchangeKey='55555555-5555-4555-8555-555555555555';
  const exchange = await rpc('nt_exchange',[['solarSSR'],'チケット交換',{},exchangeKey],'$1,$2,$3,$4');
  assert.equal(exchange.state.balance,100); assert.equal(exchange.state.inventory.filter(x=>x.status==='交換済み').length,10); pass('ticket exchange reserves owned items and credits once');
  const repeatExchange = await rpc('nt_exchange',[['solarSSR'],'チケット交換',{},exchangeKey],'$1,$2,$3,$4'); assert.equal(repeatExchange.state.balance,100); pass('exchange retry cannot double-credit');
  await db.exec("reset role; update public.nt_campaigns set active=true where id='last'; set role authenticated");
  for (let i=0;i<3;i++) await rpc('nt_draw',['last',1,`66666666-6666-4666-8666-66666666666${i}`],'$1,$2,$3');
  const final = await rpc('nt_state'); assert.equal(final.inventory.filter(x=>x.prizeId==='lastBonus').length,1); assert.equal(final.campaigns.last.remaining,0); pass('last-one awarded once on final stock');
  await assert.rejects(rpc('nt_draw',['last',1,'77777777-7777-4777-8777-777777777777'],'$1,$2,$3')); pass('sold-out draw rejected');
  await db.exec('reset role'); await db.query('insert into public.nt_admins values($1)',[a]); await db.exec('set role authenticated');
  const grantKey='88888888-8888-4888-8888-888888888888';
  await rpc('nt_admin',['grant',{member:b,amount:25,reason:'test grant',key:grantKey}],'$1,$2');
  await assert.rejects(rpc('nt_admin',['grant',{member:b,amount:25,reason:'test grant',key:grantKey}],'$1,$2')); pass('admin grant cannot repeat operation id');
  await uid(b); assert.equal((await rpc('nt_state')).balance,25); pass('admin grant reaches target account');
  await uid(a); await rpc('nt_admin_state'); pass('administrator can read fulfillment console');
  process.stdout.write(`${passed} database checks passed. Auth provider and pgcrypto RNG require hosted verification.\n`);
} finally { await db.close(); }
