import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {useStytchB2BClient,useStytchMemberSession} from '@stytch/react/b2b';
import {Navigate,Route,Routes} from 'react-router';
import {Login} from './components/Login';

import {clearPortalToken,exchangeStytch,type OrganizerAccess} from './supabase-portal';
import {visibleModules,labels,type ModuleKey} from './permissions';
import {People} from './modules/People';
import {Tasks} from './modules/Tasks';
import {Events} from './modules/Events';
import {ServiceHours} from './modules/ServiceHours';
import {Profile} from './modules/Profile';
import {Knowledge} from './modules/Knowledge';
import {Applications} from './modules/Applications';
import {Overview,SecurityLogs,Training} from './modules/Overview';
import {SecurityObservatory} from './modules/SecurityObservatory';
import {MediaOperations} from './modules/MediaOperations';
import { Announcements, AnnouncementPreview, useAnnouncements } from './modules/Announcements';
// The visual studios load only when somebody opens their workspace.
const MediaEdm=lazy(()=>import('./modules/MediaEdm').then(m=>({default:m.MediaEdm})));
import {CommunityOperations} from './modules/CommunityOperations';
import {OrganizerChat} from './modules/OrganizerChat';
import {LearningLibrary} from './modules/LearningLibrary';
const TechStudio=lazy(()=>import('./modules/TechStudio').then(m=>({default:m.TechStudio})));
import {SupplyChain} from './modules/SupplyChain';
const SecurityStudio=lazy(()=>import('./modules/SecurityStudio').then(m=>({default:m.SecurityStudio})));
const ToolLab=lazy(()=>import('./modules/ToolLab').then(m=>({default:m.ToolLab})));
const AccountSecurity=lazy(()=>import('./modules/AccountSecurity').then(m=>({default:m.AccountSecurity})));
const SocialManagement=lazy(()=>import('./modules/SocialManagement').then(m=>({default:m.SocialManagement})));
import {GrowthHub} from './modules/GrowthHub';
import type {Department} from './portal-data';

/**
 * Study0SG brush-stroke emblem, vector-traced from the supplied organization logo.
 * No background image or external font. currentColor inherits theme colors.
 * Decorative because the adjacent Study0SG brand text names the website.
 */
type Study0SGLogoProps = { className?: string };

function Study0SGLogo({ className = '' }: Study0SGLogoProps) {
  return (
    <svg
      className={`study0sg-logo-mark ${className}`.trim()}
      style={{width:49, height:49, flexShrink:0, color:"var(--color-accent, #dd831f)", display:"block"}}
      viewBox="0 0 278 273"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" fillRule="evenodd" d="M136 107 131 107 129 108 123 114 123 115 117 123 114 129 114 131 111 138 111 143 110 144 110 160 111 161 111 165 114 172 120 178 122 178 123 179 137 179 142 176 145 173 146 173 146 171 148 170 148 168 150 166 150 164 151 163 151 159 152 158 152 140 151 139 151 136 149 134 149 132 147 128 141 121 141 119 140 118 140 117 142 115 141 110 139 110 Z M138 121 142 125 144 129 144 132 145 133 145 146 144 147 144 152 143 153 141 160 132 170 130 170 125 164 125 160 124 159 124 151 125 149 124 147 126 144 125 142 128 136 127 135 129 133 129 131 131 127 136 121 Z M135 117 136 116 138 118 136 119 Z M196 87 195 88 191 89 184 97 171 123 171 125 170 126 170 128 169 129 169 131 166 138 166 141 165 142 165 145 164 146 164 149 163 150 163 154 162 155 162 159 161 160 161 166 160 167 160 186 161 187 161 189 163 191 164 190 168 191 169 192 178 192 180 191 182 189 183 189 189 182 189 181 195 173 197 168 199 166 203 158 204 159 204 163 203 164 203 170 202 171 202 177 201 178 201 184 200 185 200 208 201 209 201 213 202 215 203 215 203 214 205 212 211 209 211 207 213 205 213 201 214 200 214 196 215 195 215 190 216 188 218 187 217 186 218 184 216 183 216 181 218 177 216 176 217 174 219 173 218 169 220 168 218 167 218 166 220 165 218 163 219 161 220 162 218 160 218 157 220 153 220 149 222 148 221 147 223 145 222 144 223 143 222 141 223 139 221 136 221 133 222 132 225 132 226 131 231 131 232 130 235 130 236 129 240 128 242 126 241 125 237 125 236 124 216 124 215 125 201 125 200 126 194 127 192 129 192 131 197 134 203 135 204 136 204 138 200 143 195 153 193 155 193 158 191 162 189 163 188 165 188 168 184 176 178 181 176 179 176 157 177 156 177 149 178 148 179 137 180 136 180 133 181 132 181 129 183 125 183 122 184 121 184 118 185 117 186 112 190 105 197 97 199 96 207 97 208 96 207 92 204 89 Z M201 188 203 186 205 186 206 187 204 189 202 189 Z M112 85 110 85 106 83 100 83 99 84 94 85 90 88 87 89 85 91 78 95 63 109 62 109 62 110 58 114 58 115 56 116 53 122 51 124 51 126 49 129 48 135 47 136 47 149 48 150 49 154 54 159 62 163 64 162 65 164 68 163 70 165 74 165 75 166 77 166 82 169 84 171 84 172 85 171 89 174 88 175 89 178 86 181 82 183 77 184 76 185 68 186 67 185 63 185 62 184 55 183 53 190 57 192 60 192 62 194 66 194 67 195 69 195 70 194 71 195 85 196 88 194 90 194 96 191 102 185 102 183 103 182 103 177 102 176 101 171 98 168 98 167 96 165 89 162 87 160 81 157 78 157 73 154 71 154 67 152 63 148 62 146 62 142 63 141 64 135 67 129 77 118 77 117 92 104 93 104 98 100 104 97 108 96 109 97 105 105 95 118 95 119 93 121 92 121 86 128 82 135 82 137 83 139 85 140 88 140 94 137 100 132 100 131 105 126 107 122 107 120 114 110 114 108 116 106 117 102 118 101 118 94 117 93 117 91 Z M65 192 67 191 68 193 67 194 Z M71 190 72 189 74 189 75 190 74 191 72 191 Z M72 188 73 187 76 187 77 188 76 189 73 189 Z M129 0 128 1 120 1 119 2 114 2 113 3 110 3 109 4 101 5 94 8 91 8 88 10 83 11 67 19 65 21 59 24 56 27 51 30 46 35 45 35 29 51 29 52 25 56 25 57 22 60 19 66 17 68 10 82 8 89 6 92 6 95 4 99 3 107 2 108 2 113 1 114 1 129 2 127 2 124 3 123 4 124 4 132 5 131 7 135 7 130 9 126 9 122 10 121 10 117 11 116 12 107 16 105 17 106 17 112 18 113 20 105 22 103 31 85 34 82 34 81 42 71 42 70 51 60 52 62 53 62 68 49 72 47 81 40 86 38 88 36 90 36 92 34 94 34 102 30 108 29 112 27 120 26 121 25 129 25 130 24 150 24 151 25 159 25 160 26 168 27 169 28 175 29 178 31 183 32 197 39 199 41 209 47 214 52 215 52 226 63 226 64 233 72 233 73 239 81 247 98 247 100 250 107 251 114 252 115 253 128 254 129 254 146 253 147 252 160 251 161 250 168 249 169 246 180 243 185 243 187 241 191 239 193 237 198 227 211 227 212 212 227 211 227 203 234 200 235 195 239 181 246 179 246 178 247 176 247 169 250 166 250 165 251 162 251 161 252 157 252 156 253 150 253 149 254 119 254 118 253 113 253 112 252 108 252 107 251 104 251 103 250 98 251 97 250 99 249 97 248 93 249 92 248 93 247 91 246 88 247 87 246 88 245 86 246 85 245 86 244 84 245 81 243 82 242 80 243 76 241 74 239 64 233 60 229 59 229 48 218 56 226 54 227 41 214 41 213 31 200 29 195 28 194 27 195 26 194 27 191 26 190 25 191 24 190 25 188 24 185 23 187 22 185 23 187 23 191 25 193 24 194 26 195 26 198 29 200 30 203 34 208 33 209 35 210 34 211 35 213 40 219 38 220 34 216 37 219 37 220 55 238 60 241 64 245 65 245 70 249 73 250 75 252 80 254 82 256 80 257 70 252 68 250 61 246 58 243 57 243 53 239 52 239 34 221 34 220 24 207 14 188 14 186 12 183 12 181 9 175 9 172 8 171 8 168 7 167 7 164 6 163 6 159 5 158 4 145 4 154 5 155 6 165 7 166 8 173 9 174 10 180 12 183 13 188 21 204 23 206 26 212 36 224 36 225 48 237 49 237 54 242 55 242 58 245 59 245 67 251 89 262 91 262 92 263 94 263 101 266 104 266 105 267 108 267 109 268 113 268 114 269 120 269 121 270 130 270 131 271 144 271 145 270 155 270 156 269 163 269 164 268 167 268 168 267 172 267 173 266 187 262 190 260 192 260 208 252 210 250 217 246 220 243 225 240 242 223 242 222 246 218 246 217 249 214 249 213 255 205 262 191 263 193 266 186 265 182 266 181 267 183 268 181 268 179 269 178 268 173 269 172 270 174 270 172 271 171 271 168 270 166 271 165 272 166 272 163 273 162 273 157 272 156 272 154 273 153 274 154 274 145 275 144 275 130 274 129 274 119 273 118 273 113 272 112 271 103 270 102 266 88 264 85 264 83 260 75 260 73 248 53 240 44 240 43 231 34 230 34 225 29 224 29 215 22 208 19 206 17 204 17 202 15 200 15 195 12 193 12 185 8 183 8 182 7 180 7 173 4 165 3 164 2 158 2 157 1 148 1 147 0 Z M106 266 107 265 109 265 110 266 109 267 107 267 Z M121 264 122 263 126 263 127 264 126 265 122 265 Z M115 263 116 262 119 262 120 263 119 264 116 264 Z M109 262 110 261 113 261 114 262 113 263 110 263 Z M90 261 91 260 93 260 94 261 93 262 91 262 Z M124 259 125 258 141 258 142 259 141 260 125 260 Z M81 257 82 256 84 256 91 260 90 261 88 261 Z M150 255 151 254 158 254 159 255 158 256 151 256 Z M106 253 107 252 111 252 112 253 123 254 124 255 149 255 150 256 149 257 122 257 121 256 116 256 115 255 111 255 110 254 107 254 Z M103 252 104 251 106 251 107 252 106 253 104 253 Z M100 251 101 250 103 250 104 251 103 252 101 252 Z M89 250 91 248 93 250 95 251 96 250 101 253 103 252 109 255 114 255 115 256 118 256 119 257 124 257 125 258 124 259 115 259 114 258 106 257 105 256 94 253 Z M75 243 77 241 80 244 81 243 84 246 86 246 90 249 89 250 87 250 79 246 Z M72 240 73 239 76 242 74 243 72 241 Z M69 236 72 239 71 241 67 238 Z M60 231 61 230 67 235 66 236 64 236 60 232 Z M55 227 56 226 60 230 60 231 59 232 55 228 Z M219 226 213 232 212 232 205 238 187 248 185 248 182 250 180 250 176 252 165 254 164 255 159 255 158 254 159 253 163 253 164 252 171 251 172 250 180 248 183 246 185 246 199 239 201 237 208 233 211 230 212 230 217 225 Z M264 186 265 187 265 189 264 190 263 189 263 187 Z M267 178 268 179 268 181 267 182 266 181 266 179 Z M268 175 269 176 269 178 268 179 267 178 267 176 Z M272 158 273 159 273 161 272 162 271 161 271 159 Z" />
    </svg>
  );
}

// Group screens by everyday work. A screen can appear in two groups as a shortcut.
// The permission checker still decides which screens each organizer can open.
type NavGroup = { id: string; title: string; description: string; items: Array<{ key: ModuleKey; text: string }> };
const navGroups: NavGroup[] = [
 { id:'overview', title:'Overview', description:'Your personal workspace', items:[
  {key:'dashboard',text:'Home dashboard'}, {key:'announcements',text:'Announcements'}, {key:'my_tasks',text:'My tasks'},
  {key:'my_hours',text:'My VIA & contributions'}, {key:'onboarding',text:'My training'},
  {key:'my_profile',text:'My profile'}] },
 { id:'media',title:'Media Studio',description:'Events, forms and artwork',items:[
  {key:'media',text:'Media dashboard'}, {key:'media_forms',text:'Registration Form Maker'},
  {key:'media_edm',text:'EDM Studio'}, {key:'social_media',text:'Social Publishing'}] },
 { id:'tech-media',title:'Tech & Media',description:'Creative tools shared across teams',items:[
  {key:'tech_studio',text:'Wireframe Builder'}, {key:'media_edm',text:'EDM Studio'},
  {key:'media_forms',text:'Registration Form Maker'}] },
 { id:'security',title:'Tech & Security',description:'Service health and safe software',items:[
  {key:'security',text:'Security Observatory'}, {key:'security_supply_chain',text:'Software Safety Check'},
  {key:'security_studio',text:'Backend & Security Wireframe'},
  {key:'security_tools',text:'Defensive Tool Lab'},
  {key:'security_accounts',text:'Account Security Journal'}] },
 { id:'community',title:'Community Crew',description:'Events and participants',items:[
  {key:'community',text:'Community & events'}, {key:'community_handoffs',text:'Registration handovers'}] },
 { id:'operations',title:'Team & Operations',description:'People and approvals',items:[
  {key:'departments',text:'Department oversight'}, {key:'people_ops',text:'People & applications'},
  {key:'support_queue',text:'Support Pool queue'}, {key:'approval_center',text:'Approvals & offboarding'}] },
 { id:'communication',title:'Communicate & Learn',description:'Chat, courses and support',items:[
  {key:'organizer_chat',text:'Organizer chat'}, {key:'learning',text:'Courses & SOPs'},
  {key:'educator',text:'Educator Circle'}, {key:'rag',text:'AI knowledge assistant'}] },
 { id:'growth',title:'Growth & Partnerships',description:'Reports and partner contacts',items:[
  {key:'growth',text:'Growth dashboard'}, {key:'social_media',text:'Social Publishing'}] },
];

// Stytch verifies the person; the Edge Function independently verifies
// their live organizer status and department grants on each token exchange.
function Dashboard(){
 const {session,isInitialized}=useStytchMemberSession();
 const stytch=useStytchB2BClient();
 const [access,setAccess]=useState<OrganizerAccess|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [selected,setSelected]=useState<ModuleKey>(()=>{const k=new URLSearchParams(window.location.hash.split('?')[1]??'').get('module');return (k&&Object.prototype.hasOwnProperty.call(labels,k)?k:'dashboard') as ModuleKey;});
 const [expanded,setExpanded]=useState<Record<string,boolean>>(()=>{
  const group=navGroups.find(g=>g.items.some(item=>item.key===selected));
  return {[group?.id??'overview']:true};
 });
 const [navigatorOpen,setNavigatorOpen]=useState(false);
 const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
 const announcementInbox=useAnnouncements(Boolean(access));
 // UI preference only: no passwords, JWTs or organizer data are stored here.
 const [theme,setTheme]=useState<'light'|'dark'>(()=>{
  try{const saved=localStorage.getItem('study0sg-theme');if(saved==='dark'||saved==='light')return saved;}catch{/* storage disabled */}
  return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
 });
 useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('study0sg-theme',theme);}catch{/* storage disabled */}},[theme]);
 const navigatorRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{document.title=access&&announcementInbox.unread?`(${announcementInbox.unread}) My Study0SG`:'My Study0SG | Organizers Portal';return()=>{document.title='My Study0SG | Organizers Portal';};},[access,announcementInbox.unread]);

 // Keep the selected section in sync with the URL, including browser Back.
 useEffect(()=>{
  const fromUrl=()=>{
   const key=new URLSearchParams(window.location.hash.split('?')[1]??'').get('module');
   const next=(key&&Object.prototype.hasOwnProperty.call(labels,key)?key:'dashboard') as ModuleKey;
   setSelected(next);
   const group=navGroups.find(g=>g.items.some(item=>item.key===next));
   if(group)setExpanded(previous=>({...previous,[group.id]:true}));
  };
  window.addEventListener('hashchange',fromUrl);
  return ()=>window.removeEventListener('hashchange',fromUrl);
 },[]);

 // Dismiss the logo navigator when clicking outside it or pressing Escape.
 useEffect(()=>{
  if(!navigatorOpen)return;
  const onOutside=(event:PointerEvent)=>{
   if(!navigatorRef.current?.contains(event.target as Node))setNavigatorOpen(false);
  };
  const onEscape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){setNavigatorOpen(false);setMobileMenuOpen(false);}
  };
  document.addEventListener('pointerdown',onOutside);
  document.addEventListener('keydown',onEscape);
  return ()=>{document.removeEventListener('pointerdown',onOutside);document.removeEventListener('keydown',onEscape);};
 },[navigatorOpen]);
 // Esc closes mobile navigation; lock background scroll while the drawer is open.
 useEffect(()=>{
  if(!mobileMenuOpen)return;
  const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileMenuOpen(false);};
  document.addEventListener('keydown',onEscape);
  document.body.classList.add('mobile-nav-open');
  return()=>{document.removeEventListener('keydown',onEscape);document.body.classList.remove('mobile-nav-open');};
 },[mobileMenuOpen]);
 const sid=session?.member_session_id;
 const org=session?.organization_id;
 const expectedOrg=import.meta.env.VITE_STYTCH_ORGANIZATION_ID?.trim();
 useEffect(()=>{
  clearPortalToken();setAccess(null);setError(null);
  if(!isInitialized||!sid){setLoading(false);return;}
  if(!expectedOrg||org!==expectedOrg){setError('Please sign in with your official Study0SG organization.');setLoading(false);return;}
  let mounted=true;
  const refresh=async()=>{
   try{const jwt=stytch.session.getTokens()?.session_jwt;
     if(!jwt)throw new Error('Stytch login expired; sign out and log in again.');
     const verified=await exchangeStytch(jwt);
     if(mounted){setAccess(verified);setError(null);}
   }catch(e){if(mounted){setAccess(null);clearPortalToken();setError(e instanceof Error?e.message:'Access check failed');}}
   finally{if(mounted)setLoading(false);}
  };
  void refresh();
  const timer=window.setInterval(()=>{void refresh();},240_000);
  return()=>{mounted=false;window.clearInterval(timer);clearPortalToken();};
 },[isInitialized,sid,org,expectedOrg,stytch]);
 if(!isInitialized||loading)return <p role="status" className="auth-status">Verifying your Study0SG access…</p>;
 if(!session)return <Navigate to="/" replace/>;
 const signOut=async()=>{clearPortalToken();try{await stytch.session.revoke();}finally{window.location.hash='#/';}};
 if(!access)return <main className="dashboard-page"><section className="dashboard-card" role="alert">
   <span className="eyebrow">ACCOUNT CHECK</span><h1>We couldn't open your workspace</h1>
   <p>{error??'Your organizer access needs review.'}</p><button className="signout-button" onClick={()=>{void signOut();}}>Sign out / use Study0SG</button>
 </section></main>;
 const modules=visibleModules(access.grants);
 const displayed=modules.includes(selected)?selected:'dashboard';
 const canOpen=new Set<ModuleKey>(modules);
 const availableGroups=navGroups.map(group=>({...group,items:group.items.filter(item=>canOpen.has(item.key))})).filter(group=>group.items.length>0);
 // Open the group containing a selected screen, but never change its permissions.
 const selectModule=(key:ModuleKey)=>{
  if(!canOpen.has(key))return;
  setSelected(key);
  setNavigatorOpen(false);
  setMobileMenuOpen(false);
  setExpanded(previous=>{
   const group=availableGroups.find(g=>g.items.some(item=>item.key===key));
   return group?{...previous,[group.id]:true}:previous;
  });
  window.location.hash=`/dashboard?module=${encodeURIComponent(key)}`;
  window.scrollTo({top:0,behavior:'instant'});
 };
 const isFore=access.grants.some(g=>g.role==='fore_director');
 const dept=({community:'community',media:'media',security:'technology',educator:'education'} as Record<string,Department>)[displayed];
 const common={actorId:access.id,grants:access.grants};
 const managerDepartments: Array<'executive'|'support'|'community'|'media'|'technology'|'education'> = ['executive','support','community','media','technology','education'].filter(d=>access.grants.some(g=>g.role==='director'&&g.department===d)) as Array<'executive'|'support'|'community'|'media'|'technology'|'education'>;
 const unreadUrgent=announcementInbox.items.find(item=>item.importance==='urgent'&&!item.read_at);
 const content=(()=>{
  switch(displayed){
   case 'dashboard':return <><AnnouncementPreview inbox={announcementInbox} open={()=>selectModule('announcements')}/><Overview access={access}/></>;
   case 'announcements':return <Announcements inbox={announcementInbox} canGlobal={isFore} managerDepartments={managerDepartments}/>;
   case 'my_tasks':return <Tasks {...common} mineOnly/>;
   case 'my_hours':return <ServiceHours {...common}/>;
   case 'my_profile':return <Profile actorId={access.id}/>;
   case 'onboarding':return <Training/>;
   case 'learning':return <LearningLibrary grants={access.grants}/>;
   case 'organizer_chat':return <OrganizerChat actorId={access.id}/>;
   case 'media_forms':return <MediaOperations manager={isFore||access.grants.some(g=>g.role==='director'&&g.department==='media')}/>;
   case 'media_edm':return <MediaEdm/>;
   case 'community_handoffs':return <CommunityOperations manager={isFore||access.grants.some(g=>g.role==='director'&&g.department==='community')}/>;
   case 'security_supply_chain':return <SupplyChain/>;
   case 'security_studio':return <SecurityStudio/>;
   case 'security_tools':return <ToolLab/>;
   case 'security_accounts':return <AccountSecurity manager={isFore||access.grants.some(g=>g.role==='director'&&g.department==='technology')}/>;
   case 'social_media':return <SocialManagement manager={isFore||access.grants.some(g=>g.role==='director'&&g.department==='media')}/>;
   case 'tech_studio':return <TechStudio/>;
   case 'growth':return isFore?<GrowthHub/>:<p>Growth records are currently restricted to Fore Director while Marketing roles are defined.</p>;
   case 'people_ops':return isFore?<People actorId={access.id}/>:<p>People administration requires a Fore Director account.</p>;
   case 'approval_center':return <Applications/>;
   case 'departments':return <><h2>Cross-team task planning</h2><Tasks {...common}/><h2>Organization calendar</h2><Events grants={access.grants}/></>;
   case 'support_queue':return <Tasks {...common}/>;
   case 'community':case 'media':case 'educator':return <><h2>Department tasks</h2><Tasks {...common} department={dept}/><h2>Department events</h2><Events grants={access.grants} department={dept}/></>;
   case 'security':return <><SecurityObservatory/><h2>Tech & Security work</h2><Tasks {...common} department="technology"/><h2>Security event history</h2><SecurityLogs/></>;
   case 'rag':return <Knowledge isFore={isFore} actorId={access.id} grants={access.grants}/>;
   default:return <p>This section is being prepared.</p>;
  }
 })();
 return <main className="dashboard-page">
   <a className="mobile-skip-link" href="#workspace-content">Skip to main content</a>
   <header className="dashboard-header">
     <div className="brand-navigator" ref={navigatorRef}>
       <button type="button" className="brand brand-trigger" aria-expanded={navigatorOpen}
         aria-controls="study0sg-quick-nav" aria-label="Open Study0SG workspace navigator"
         onClick={()=>setNavigatorOpen(open=>!open)}>
         <Study0SGLogo/>
         <span className="brand-title"><span className="brand-name">Study0SG</span><span className="brand-caption">Workspace navigator</span></span>
         <span className="brand-chevron" aria-hidden="true">{navigatorOpen?'▴':'▾'}</span>
       </button>
       {navigatorOpen&&<div className="quick-nav" id="study0sg-quick-nav" aria-label="Quick workspace navigation">
         <span className="eyebrow">GO TO A WORKSPACE</span>
         <button type="button" className="quick-home" onClick={()=>selectModule('dashboard')}>⌂ &nbsp; Home dashboard</button>
         <div className="quick-nav-links">
           {availableGroups.filter(group=>group.id!=='overview').map(group=><div className="quick-nav-group" key={group.id}>
             <span>{group.title}</span>
             {group.items.slice(0,3).map(item=><button type="button" key={`${group.id}-${item.key}`} onClick={()=>selectModule(item.key)}>{item.text}</button>)}
           </div>)}
         </div>
         <span className="quick-nav-note">Only workspaces you are allowed to access appear here.</span>
       </div>}
     </div>
     <div className="header-actions"><button type="button" className="header-announcements secondary-button" onClick={()=>selectModule('announcements')} aria-label={`Announcements${announcementInbox.unread>0?`, ${announcementInbox.unread} unread`:''}`}><span aria-hidden="true">🔔</span><span className="header-announcements-text">Updates</span>{announcementInbox.unread>0&&<span className="unread-badge" aria-hidden="true">{announcementInbox.unread>99?'99+':announcementInbox.unread}</span>}</button><button type="button" className="theme-toggle secondary-button" aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}><span className="theme-label">{theme==='dark'?'☀ Light mode':'☾ Dark mode'}</span><span className="theme-short" aria-hidden="true">{theme==='dark'?'☀':'☾'}</span></button><span className="header-role">{isFore?'Fore Director · All departments':'Organizer workspace'}</span><button type="button" className="signout-button" onClick={()=>{void signOut();}}>Sign out</button><button className="mobile-menu-toggle secondary-button" type="button" aria-controls="workspace-mobile-nav" aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(v=>!v)}>{mobileMenuOpen?'✕ Close':'☰ Menu'}</button></div>
   </header>
   {unreadUrgent&&<div className="urgent-announcement-banner" role="status"><span aria-hidden="true">⚠</span><div><strong>Urgent organizer update</strong><span>{unreadUrgent.title}</span></div><button type="button" className="secondary-button" onClick={()=>selectModule('announcements')}>Read now</button></div>}
   <div className="workspace-layout">
     {mobileMenuOpen&&<button type="button" className="mobile-nav-backdrop" aria-label="Close workspace menu" onClick={()=>setMobileMenuOpen(false)}/>}
     <nav id="workspace-mobile-nav" className={`workspace-nav grouped-nav${mobileMenuOpen?' mobile-open':''}`} aria-label="Portal sections">
       <div className="mobile-nav-heading"><span className="eyebrow">YOUR WORKSPACE</span><button className="mobile-menu-close secondary-button" type="button" onClick={()=>setMobileMenuOpen(false)} aria-label="Close navigation">✕</button></div>
       {availableGroups.map(group=>{
         const isOpen=Boolean(expanded[group.id]);
         const current=group.items.some(item=>item.key===displayed);
         return <div className="nav-group" key={group.id}>
           <button type="button" className={`nav-group-trigger${current?' contains-current':''}`}
             aria-expanded={isOpen} aria-controls={`nav-group-${group.id}`}
             onClick={()=>setExpanded(prev=>({...prev,[group.id]:!prev[group.id]}))}>
             <span className="nav-group-label"><strong>{group.title}</strong><small>{group.description}</small></span>
             <span className="nav-chevron" aria-hidden="true">{isOpen?'▾':'▸'}</span>
           </button>
           {isOpen&&<div id={`nav-group-${group.id}`} className="nav-group-items">
             {group.items.map(item=><button type="button" key={`${group.id}-${item.key}`}
               aria-current={displayed===item.key?'page':undefined}
               onClick={()=>selectModule(item.key)}
               className={displayed===item.key?'nav-item selected':'nav-item'}>{item.text}</button>)}
           </div>}
         </div>;
       })}
       <button type="button" className="mobile-drawer-signout secondary-button" onClick={()=>{void signOut();}}>Sign out of Study0SG</button>
     </nav>
     <section id="workspace-content" className="workspace-main" tabIndex={-1} aria-live="polite"><span className="eyebrow">STUDY0SG VERIFIED ORGANIZER</span>
       <div className="workspace-title"><h1>{labels[displayed]}</h1>{displayed!=='rag'&&modules.includes('rag')&&<button className="secondary-button" type="button" onClick={()=>selectModule('rag')}>✦ Ask AI</button>}</div>
       <Suspense fallback={<p role="status" className="auth-status">Opening design workspace…</p>}>{content}</Suspense>
     </section>
   </div>
   <nav className="mobile-bottom-nav" aria-label="Quick access">
    {([{key:'dashboard',icon:'⌂',label:'Home'},{key:'announcements',icon:'🔔',label:'Updates'},{key:'organizer_chat',icon:'💬',label:'Chat'},{key:'my_tasks',icon:'☑',label:'Tasks'}] as const).filter(x=>canOpen.has(x.key)).map(item=><button type="button" key={item.key} aria-current={displayed===item.key?'page':undefined} className={displayed===item.key?'mobile-bottom-item current':'mobile-bottom-item'} onClick={()=>selectModule(item.key)}><span className="mobile-bottom-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{item.key==='announcements'&&announcementInbox.unread>0&&<span className="mobile-unread-dot" aria-label={`${announcementInbox.unread} unread`}>{announcementInbox.unread>9?'9+':announcementInbox.unread}</span>}</button>)}
    <button type="button" className="mobile-bottom-item" aria-expanded={mobileMenuOpen} aria-controls="workspace-mobile-nav" onClick={()=>setMobileMenuOpen(true)}><span className="mobile-bottom-icon" aria-hidden="true">☰</span><span>More</span></button>
   </nav>
 </main>;
}

export function App(){return <Routes><Route path="/" element={<Login/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}
