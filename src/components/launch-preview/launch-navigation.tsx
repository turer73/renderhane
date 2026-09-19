"use client";
import {useCallback,useEffect,useRef} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {Menu,X,ArrowRight} from 'lucide-react';
import {loginPath,type Locale} from '@/lib/launch-preview/core';
import {previewHome,previewPath,type PreviewTool} from '@/lib/launch-preview/routes';
import './launch.css';
import './tools.css';
export function LaunchNavigation({locale,current='home',production=false}:{locale:Locale;current?:PreviewTool|'home';production?:boolean}){
 const tr=locale==='tr';
 const container=useRef<HTMLDivElement>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const toggle=useRef<HTMLButtonElement>(null);
 const closeMenu=useCallback(()=>{
   if(dialog.current?.open)dialog.current.close();
   toggle.current?.setAttribute('aria-expanded','false');
   container.current?.classList.remove('rhl-menu-is-open');
   document.documentElement.style.overflow='';
 },[]);
 const openMenu=useCallback(()=>{
   const d=dialog.current;
   if(!d||d.open||typeof d.showModal!=='function')return;
   d.showModal();
   document.documentElement.style.overflow='hidden';
   toggle.current?.setAttribute('aria-expanded','true');
   container.current?.classList.add('rhl-menu-is-open');
   d.querySelector<HTMLElement>('[data-menu-close]')?.focus({preventScroll:true});
 },[]);
 // Native dialog kapatmalari (Escape, form yontemi) sonrasi durumu toparla.
 useEffect(()=>{
   const d=dialog.current;
   if(!d)return;
   const onClose=()=>{toggle.current?.setAttribute('aria-expanded','false');container.current?.classList.remove('rhl-menu-is-open');document.documentElement.style.overflow='';};
   d.addEventListener('close',onClose);
   return()=>d.removeEventListener('close',onClose);
 },[]);
 // Masaustune gecince cekmeceyi kapat.
 useEffect(()=>{
   const mq=window.matchMedia('(min-width: 1200px)');
   const onChange=()=>{if(mq.matches)closeMenu();};
   mq.addEventListener('change',onChange);
   return()=>mq.removeEventListener('change',onChange);
 },[closeMenu]);
 useEffect(()=>{
   const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')container.current?.querySelectorAll<HTMLDetailsElement>('details').forEach(d=>d.open=false)};
   const onOutside=(e:MouseEvent)=>{if(!(e.target instanceof Element)||!e.target.closest('.rhl-header-free'))container.current?.querySelectorAll<HTMLDetailsElement>('.rhl-header-free').forEach(d=>{d.open=false;});};
   document.addEventListener('keydown',onKey);document.addEventListener('click',onOutside);
   return()=>{document.removeEventListener('keydown',onKey);document.removeEventListener('click',onOutside);};
 },[]);
 useEffect(()=>()=>{document.documentElement.style.overflow='';},[]);
 const home=production?`/${locale}`:previewHome(locale);
 const toolPath=(page:PreviewTool)=>production
  ? page==='artistic'?`/${locale}/iletisim`:`/${locale}/araclar/${({background:'arka-plan-kaldirma',qr:'qr-kod',nfc:'nfc-yaz'} as Partial<Record<PreviewTool,string>>)[page]??''}`
  : previewPath(locale,page);
 const anchor=(id:string)=>current==='home'?`#${id}`:`${home}#${id}`;
 const focusTarget=(hash:string)=>{
   const el=document.getElementById(hash.replace(/^#/,''));
   if(el){el.tabIndex=-1;el.focus({preventScroll:true});}
 };
 const onDrawerNav=(e:React.MouseEvent)=>{
   const a=(e.target as Element).closest('a');
   if(!a)return;
   closeMenu();
   const href=a.getAttribute('href')||'';
   if(href.startsWith('#'))focusTarget(href);
 };
 // Sekme tuzagi: odak diyalog icinde kalir.
 const trapTab=(e:React.KeyboardEvent)=>{
   if(e.key!=='Tab')return;
   const d=dialog.current;
   if(!d)return;
   const items=[...d.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')].filter(el=>el.getClientRects().length>0);
   const first=items[0],last=items[items.length-1];
   if(!first||!last)return;
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 };
 const free=[['background',tr?'Arka plan kaldır':'Remove background',tr?'Kayıt olmadan · Günde 3 hak':'No signup · 3 per day'],['qr',tr?'Standart QR oluştur':'Create standard QR','PNG + SVG'],['nfc',tr?'NFC etiketi yaz':'Write NFC tag',tr?'Uyumlu cihazda etiket yazımı':'Compatible device required']] as const;
 const links=<><a href={anchor('rhl-example')}>{tr?'3D örneği':'3D example'}</a><a href={anchor('rhl-paths')}>{tr?'Üretim alanları':'Create'}</a><a href={anchor('rhl-cost')}>{tr?'Kredi hesabı':'Credits'}</a></>;
 return <div ref={container}>
 <div className="rhl-nav-wrap"><header className="rhl-header"><Link href={home} className="rhl-brand"><Image src="/logo/rhl-mark.svg" alt="" width={34} height={34} unoptimized/>Renderhane</Link>
 <nav className="rhl-nav" aria-label={tr?'Ana menü':'Main menu'}>{links}<details className="rhl-header-free"><summary>{tr?'Ücretsiz araçlar':'Free tools'}</summary><div className="rhl-free-menu">{free.map(([page,label,note])=><Link key={page} href={toolPath(page)} aria-current={current===page?'page':undefined}>{label}<small>{note}</small></Link>)}<a href={anchor('rhl-free')}>{tr?'Tüm yardımcıları gör':'All helpers'} →</a></div></details></nav>
 <div className="rhl-actions"><Link className="rhl-login" href={loginPath(locale,null)}>{tr?'Giriş yap':'Sign in'}</Link><Link className="rhl-btn small" href={loginPath(locale,'img-to-3d')}>{tr?'Üretmeye başla':'Start creating'} <ArrowRight size={14}/></Link><button ref={toggle} className="rhl-menu-toggle" type="button" aria-expanded="false" aria-controls="rhl-mobile-menu" aria-label={tr?'Menü':'Menu'} onClick={()=>dialog.current?.open?closeMenu():openMenu()}><Menu size={18}/><span>{tr?'Menü':'Menu'}</span></button></div></header></div>
 <dialog ref={dialog} className="rhl-mobile-drawer" id="rhl-mobile-menu" aria-labelledby="rhl-menu-title" onClick={e=>{if(e.target===dialog.current)closeMenu();}} onKeyDown={trapTab}>
 <div className="rhl-drawer-head"><div><span className="rhl-label">RENDERHANE</span><h2 id="rhl-menu-title">{tr?'Nereden başlayalım?':'Where to start?'}</h2></div><button type="button" className="rhl-drawer-close" data-menu-close aria-label={tr?'Menüyü kapat':'Close menu'} onClick={closeMenu}><X size={22}/></button></div>
 <nav className="rhl-drawer-links" aria-label={tr?'Mobil menü':'Mobile menu'} onClick={onDrawerNav}>
 <span className="rhl-mobile-group">{tr?'ÜRETİM':'CREATE'}</span>
 <a href={anchor('rhl-example')}><span>{tr?'3D örneğini incele':'Explore the 3D example'}</span><span aria-hidden="true">→</span></a>
 <a href={anchor('rhl-paths')}><span>{tr?'Üretim alanları':'Creation areas'}</span><span aria-hidden="true">→</span></a>
 <a href={anchor('rhl-cost')}><span>{tr?'Kredi hesabı':'Credit estimate'}</span><span aria-hidden="true">→</span></a>
 <span className="rhl-mobile-group">{tr?'ÜCRETSİZ YARDIMCILAR':'FREE HELPERS'}</span>
 {free.map(([page,label,note])=><Link key={page} href={toolPath(page)}><span>{label}<small>{note}</small></span><span aria-hidden="true">→</span></Link>)}
 <a href={anchor('rhl-free')}>{tr?'Tüm yardımcıları gör':'See all helpers'} →</a>
 <Link href={toolPath('artistic')}><span>{tr?'Sanatsal QR':'Artistic QR'}</span><span className="rhl-paid-tag">{tr?'Ücretli':'Paid'}</span></Link>
 </nav>
 <div className="rhl-drawer-bottom"><Link className="rhl-btn" href={loginPath(locale,'img-to-3d')} onClick={closeMenu}>{tr?'3D üretime başla':'Start creating in 3D'} →</Link><p>{tr?'Üretim için giriş gerekir. Model maliyeti krediyle hesaplanır.':'Sign-in is required. Model cost is credit-based.'}</p></div>
 </dialog>
 </div>;
}
