type Env = { DB: D1Database; ASSETS: Fetcher; ADMIN_USER: string; ADMIN_PASSWORD: string; SESSION_SECRET: string; PUBLIC_BASE_URL: string }

type ProductInput = { name:string; slug?:string; description?:string; price:number; category_id?:number; stock?:number; featured?:boolean|number; visible?:boolean|number; badge?:string; care?:string; size_chart?:string; images?:{url:string;alt?:string;sort_order?:number}[] }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const ok = (data:any, init:ResponseInit = {}) => new Response(JSON.stringify(data), { ...init, headers: { ...JSON_HEADERS, ...(init.headers||{}) } })
const err = (message:string, status=400) => ok({ error: message }, { status })
const slugify = (v:string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
async function body<T>(req:Request): Promise<T> { try { return await req.json() as T } catch { return {} as T } }
function cookie(req:Request, name:string){ return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.split('=').slice(1).join('=') || '' }
async function hash(text:string){ const data = new TextEncoder().encode(text); const buf = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('') }
function sessionCookie(token:string, req:Request){ const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : ''; return `ws_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}` }
async function isAdmin(req:Request, env:Env){ const token = cookie(req,'ws_session'); if(!token) return false; const token_hash = await hash(token + env.SESSION_SECRET); const row:any = await env.DB.prepare('SELECT id FROM admin_sessions WHERE token_hash=? AND expires_at > datetime(\'now\')').bind(token_hash).first(); return !!row }
async function requireAdmin(req:Request, env:Env){ if(!(await isAdmin(req, env))) throw new Response(JSON.stringify({error:'No autorizado'}), {status:401, headers:JSON_HEADERS}) }
async function settings(env:Env){ const {results} = await env.DB.prepare('SELECT key,value FROM site_settings').all(); return Object.fromEntries((results||[]).map((r:any)=>[r.key,r.value])) }
async function categories(env:Env){ const {results}=await env.DB.prepare('SELECT * FROM categories WHERE visible=1 ORDER BY sort_order,name').all(); return results||[] }
async function sizes(env:Env){ const {results}=await env.DB.prepare('SELECT * FROM sizes ORDER BY sort_order,name').all(); return results||[] }
async function colors(env:Env){ const {results}=await env.DB.prepare('SELECT * FROM colors ORDER BY sort_order,name').all(); return results||[] }
async function productExtras(env:Env, ids:number[]){
  if(!ids.length) return {images:{}, variants:{}}
  const marks = ids.map(()=>'?').join(',')
  const imgs = await env.DB.prepare(`SELECT * FROM product_images WHERE product_id IN (${marks}) ORDER BY sort_order,id`).bind(...ids).all()
  const vars = await env.DB.prepare(`SELECT pv.*, s.name size, c.name color, c.hex FROM product_variants pv LEFT JOIN sizes s ON s.id=pv.size_id LEFT JOIN colors c ON c.id=pv.color_id WHERE product_id IN (${marks}) ORDER BY s.sort_order,c.sort_order`).bind(...ids).all()
  const images:any={}, variants:any={}
  for(const i of (imgs.results||[]) as any[]){ (images[i.product_id] ||= []).push(i) }
  for(const v of (vars.results||[]) as any[]){ (variants[v.product_id] ||= []).push(v) }
  return {images, variants}
}
async function products(env:Env, req:Request, admin=false){
  const u = new URL(req.url); const where:string[]=[]; const bind:any[]=[]
  if(!admin) where.push('p.visible=1')
  const q=u.searchParams.get('q'); if(q){ where.push('(p.name LIKE ? OR p.description LIKE ?)'); bind.push(`%${q}%`,`%${q}%`) }
  const cat=u.searchParams.get('category'); if(cat){ where.push('(c.slug=? OR c.name=?)'); bind.push(cat,cat) }
  const featured=u.searchParams.get('featured'); if(featured==='1') where.push('p.featured=1')
  const min=u.searchParams.get('min'); if(min){ where.push('p.price>=?'); bind.push(Number(min)) }
  const max=u.searchParams.get('max'); if(max){ where.push('p.price<=?'); bind.push(Number(max)) }
  const size=u.searchParams.get('size'); if(size){ where.push('EXISTS (SELECT 1 FROM product_variants pv JOIN sizes s ON s.id=pv.size_id WHERE pv.product_id=p.id AND s.name=?)'); bind.push(size) }
  const color=u.searchParams.get('color'); if(color){ where.push('EXISTS (SELECT 1 FROM product_variants pv JOIN colors co ON co.id=pv.color_id WHERE pv.product_id=p.id AND co.name=?)'); bind.push(color) }
  const sortMap:any={recent:'p.created_at DESC', price_asc:'p.price ASC', price_desc:'p.price DESC', featured:'p.featured DESC, p.created_at DESC'}
  const order=sortMap[u.searchParams.get('sort')||'recent'] || sortMap.recent
  const sql = `SELECT p.*, c.name category, c.slug category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ${order}`
  const res = await env.DB.prepare(sql).bind(...bind).all(); const rows:any[] = (res.results||[]) as any[]
  const ex = await productExtras(env, rows.map(r=>r.id))
  return rows.map(r=>({...r, featured:!!r.featured, visible:!!r.visible, images:ex.images[r.id]||[], variants:ex.variants[r.id]||[]}))
}
async function productBySlug(env:Env, slug:string){ const r:any=await env.DB.prepare('SELECT p.*, c.name category, c.slug category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=? AND p.visible=1').bind(slug).first(); if(!r) return null; const ex=await productExtras(env,[r.id]); return {...r, featured:!!r.featured, visible:!!r.visible, images:ex.images[r.id]||[], variants:ex.variants[r.id]||[]} }
async function homepage(env:Env, activeOnly=true){ const sql = `SELECT * FROM homepage_sections ${activeOnly?'WHERE active=1':''} ORDER BY sort_order,id`; const {results}=await env.DB.prepare(sql).all(); return (results||[]).map((s:any)=>({...s, active:!!s.active, metadata: safeJson(s.metadata)})) }
function safeJson(v:string){ try{return JSON.parse(v||'{}')}catch{return {}} }
async function saveProduct(env:Env, data:ProductInput, id?:number){
  if(!data.name || Number.isNaN(Number(data.price))) throw err('Nombre y precio son obligatorios')
  const slug = slugify(data.slug || data.name)
  const vals=[data.name,slug,data.description||'',Number(data.price),data.category_id||null,data.stock||0,data.featured?1:0,data.visible===false?0:1,data.badge||'',data.care||'',data.size_chart||'']
  if(id){ await env.DB.prepare('UPDATE products SET name=?,slug=?,description=?,price=?,category_id=?,stock=?,featured=?,visible=?,badge=?,care=?,size_chart=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...vals,id).run() }
  else { const res:any=await env.DB.prepare('INSERT INTO products (name,slug,description,price,category_id,stock,featured,visible,badge,care,size_chart) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(...vals).run(); id=res.meta.last_row_id }
  await env.DB.prepare('DELETE FROM product_images WHERE product_id=?').bind(id).run()
  for(const [i,img] of (data.images||[]).filter(x=>x.url).entries()) await env.DB.prepare('INSERT INTO product_images (product_id,url,alt,sort_order) VALUES (?,?,?,?)').bind(id,img.url,img.alt||data.name,img.sort_order||i+1).run()
  return {id}
}
async function api(req:Request, env:Env){
  const url=new URL(req.url); const path=url.pathname; const method=req.method
  try{
    if(method==='GET' && path==='/api/site') return ok({settings:await settings(env), homepage:await homepage(env), categories:await categories(env), sizes:await sizes(env), colors:await colors(env), faqs:(await env.DB.prepare('SELECT * FROM faqs WHERE active=1 ORDER BY sort_order,id').all()).results, products:await products(env, req)})
    if(method==='GET' && path==='/api/products') return ok(await products(env, req))
    if(method==='GET' && path.startsWith('/api/products/')){ const p=await productBySlug(env, decodeURIComponent(path.split('/').pop()||'')); return p?ok(p):err('Producto no encontrado',404) }
    if(method==='GET' && path==='/api/categories') return ok(await categories(env))
    if(method==='GET' && path==='/api/faqs') return ok((await env.DB.prepare('SELECT * FROM faqs WHERE active=1 ORDER BY sort_order,id').all()).results||[])
    if(method==='POST' && path==='/api/admin/login'){ const b:any=await body(req); if(b.user!==env.ADMIN_USER || b.password!==env.ADMIN_PASSWORD) return err('Credenciales incorrectas',401); const token=crypto.randomUUID()+crypto.randomUUID(); const token_hash=await hash(token+env.SESSION_SECRET); await env.DB.prepare("INSERT INTO admin_sessions (token_hash,user,expires_at) VALUES (?,?,datetime('now','+7 days'))").bind(token_hash,b.user).run(); return ok({ok:true,user:b.user},{headers:{'set-cookie':sessionCookie(token,req)}}) }
    if(method==='POST' && path==='/api/admin/logout'){ await requireAdmin(req,env); return ok({ok:true},{headers:{'set-cookie':'ws_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'}}) }
    if(method==='GET' && path==='/api/admin/me'){ return ok({authenticated:await isAdmin(req,env)}) }
    if(path.startsWith('/api/admin/')) await requireAdmin(req,env)
    if(method==='GET' && path==='/api/admin/products') return ok(await products(env, req, true))
    if(method==='POST' && path==='/api/admin/products'){ const r=await saveProduct(env, await body(req)); return ok(r,{status:201}) }
    if(path.match(/^\/api\/admin\/products\/\d+$/)){ const id=Number(path.split('/').pop()); if(method==='PUT') return ok(await saveProduct(env, await body(req), id)); if(method==='DELETE'){ await env.DB.prepare('DELETE FROM product_images WHERE product_id=?').bind(id).run(); await env.DB.prepare('DELETE FROM product_variants WHERE product_id=?').bind(id).run(); await env.DB.prepare('DELETE FROM products WHERE id=?').bind(id).run(); return ok({ok:true}) } }
    if(method==='GET' && path==='/api/admin/homepage') return ok(await homepage(env,false))
    if(method==='PUT' && path==='/api/admin/homepage'){ const b:any=await body(req); for(const s of b.sections||[]) await env.DB.prepare('UPDATE homepage_sections SET title=?,subtitle=?,content=?,image=?,button_text=?,button_link=?,sort_order=?,active=?,metadata=? WHERE id=?').bind(s.title||'',s.subtitle||'',s.content||'',s.image||'',s.button_text||'',s.button_link||'',s.sort_order||0,s.active?1:0,JSON.stringify(s.metadata||{}),s.id).run(); return ok({ok:true}) }
    if(method==='GET' && path==='/api/admin/settings') return ok({settings:await settings(env), categories:await categories(env), sizes:await sizes(env), colors:await colors(env)})
    if(method==='PUT' && path==='/api/admin/settings'){ const b:any=await body(req); for(const [k,v] of Object.entries(b.settings||{})) await env.DB.prepare('INSERT INTO site_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,String(v)).run(); return ok({ok:true}) }
    if(method==='GET' && path==='/api/admin/faqs') return ok((await env.DB.prepare('SELECT * FROM faqs ORDER BY sort_order,id').all()).results||[])
    if(method==='POST' && path==='/api/admin/faqs'){ const b:any=await body(req); const r:any=await env.DB.prepare('INSERT INTO faqs (question,answer,sort_order,active) VALUES (?,?,?,?)').bind(b.question,b.answer,b.sort_order||0,b.active?1:0).run(); return ok({id:r.meta.last_row_id},{status:201}) }
    if(path.match(/^\/api\/admin\/faqs\/\d+$/)){ const id=Number(path.split('/').pop()); if(method==='PUT'){ const b:any=await body(req); await env.DB.prepare('UPDATE faqs SET question=?,answer=?,sort_order=?,active=? WHERE id=?').bind(b.question,b.answer,b.sort_order||0,b.active?1:0,id).run(); return ok({ok:true}) } if(method==='DELETE'){ await env.DB.prepare('DELETE FROM faqs WHERE id=?').bind(id).run(); return ok({ok:true}) } }
    if(method==='GET' && path==='/api/admin/categories') return ok((await env.DB.prepare('SELECT * FROM categories ORDER BY sort_order,id').all()).results||[])
    if(method==='PUT' && path==='/api/admin/categories'){ const b:any=await body(req); for(const c of b.categories||[]) await env.DB.prepare('UPDATE categories SET name=?,slug=?,description=?,image=?,sort_order=?,visible=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(c.name,slugify(c.slug||c.name),c.description||'',c.image||'',c.sort_order||0,c.visible?1:0,c.id).run(); return ok({ok:true}) }
    return err('Ruta no encontrada',404)
  } catch(e:any){ if(e instanceof Response) return e; return err(e?.message || 'Error interno',500) }
}
export default { async fetch(req:Request, env:Env){ const url=new URL(req.url); if(url.pathname.startsWith('/api/')) return api(req, env); return env.ASSETS.fetch(req) } }
