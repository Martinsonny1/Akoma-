import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-webhook-secret','Access-Control-Allow-Methods':'POST, OPTIONS' };
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return reply({error:'method_not_allowed'},405);
  if(!Deno.env.get('PUSH_WEBHOOK_SECRET') || req.headers.get('x-webhook-secret')!==Deno.env.get('PUSH_WEBHOOK_SECRET')) return reply({error:'not_allowed'},401);
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT')||'mailto:privacy@example.com';
  if(!publicKey||!privateKey) return reply({error:'push_not_configured'},503);
  webpush.setVapidDetails(subject,publicKey,privateKey);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const payload=await req.json().catch(()=>({})); const record=payload.record||{}; const table=payload.table||''; let recipient:string|null=null; let title='Meet GH'; let body='You have a new update.'; let url='/';
  if(table==='messages' && payload.type==='INSERT'){
    const {data:m}=await admin.from('matches').select('woman_id,man_id,status').eq('id',record.match_id).maybeSingle();
    if(!m||m.status!=='active') return reply({sent:0});
    recipient=m.woman_id===record.sender_id?m.man_id:m.woman_id; title='New message'; body='You have a new message on Meet GH.'; url='/';
  } else if(table==='matches' && payload.type==='INSERT'){
    recipient=record.man_id; title='New match'; body='You have a new match on Meet GH.';
  } else if(table==='calls' && payload.type==='INSERT' && record.status==='ringing'){
    recipient=record.recipient_id; title=record.call_type==='video'?'Incoming video call':'Incoming voice call'; body='Someone is calling you on Meet GH.'; url='/';
  } else return reply({ignored:true});
  if(!recipient) return reply({sent:0});
  const {data:profile}=await admin.from('profiles').select('notifications,status').eq('id',recipient).maybeSingle();
  if(!profile || profile.status!=='approved' || profile.notifications===false) return reply({sent:0,muted:true});
  if(table==='calls'){ const {data:setting}=await admin.from('call_settings').select('incoming_enabled').eq('user_id',recipient).maybeSingle(); if(setting && setting.incoming_enabled===false) return reply({sent:0,muted:true}); }
  const {data:subs,error}=await admin.from('push_subscriptions').select('id,subscription').eq('user_id',recipient);
  if(error) return reply({error:error.message},500);
  let sent=0,expired:number[]=[];
  for(const sub of subs||[]){
    try{ await webpush.sendNotification(sub.subscription,JSON.stringify({title,body,url,tag:table+'-'+(record.id||Date.now())})); sent++; }
    catch(e){ const status=(e as {statusCode?:number}).statusCode; if(status===404||status===410) expired.push(sub.id); }
  }
  if(expired.length) await admin.from('push_subscriptions').delete().in('id',expired);
  return reply({sent,expired:expired.length});
});
