"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {Menu,X,ArrowRight} from 'lucide-react';
import {loginPath,type Locale} from '@/lib/launch-preview/core';
import {previewHome,previewPath,type PreviewTool} from '@/lib/launch-preview/routes';
import './launch.css';
import './tools.css';
export function LaunchNavigation({locale,current='home'}:{locale:Locale;current?:PreviewTool|'home'}){
 const tr=locale==='tr'; const [open,setOpen]=useState(false);
 const container=useRef<HTMLDivElement>(null);
 const close=()=>{setOpen(false);container.current?.querySelectorAll('details').forEach(d=>d.open=false)};
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')close()};
 const onOutside=(e:MouseEvent)=>{if(!(e.target instanceof Element)||!e.target.closest('.rhl-header-free'))container.current?.querySelectorAll('details').forEach(d=>d.open=false)};
 document.addEventListener('keydown',onKey);document.addEventListener('click',onOutside);
 return()=>{document.removeEventListener('keydown',onKey);document.removeEventListener('click',onOutside)};
 },[]);
 const home=previewHome(locale);
 const anchor=(id:string)=>current==='home'?`#${id}`:`${home}#${id}`;
 const free=[['background',tr?'Arka plan kaldır':'Remove background',tr?'Şişe karşılaştırması · Günde 3 hak':'Bottle example · 3 per day'],['qr',tr?'Standart QR oluştur':'Create standard QR','PNG + SVG'],['nfc',tr?'NFC etiketi yaz':'Write NFC tag',tr?'Uyumlu cihazda etiket yazımı':'Compatible device required']] as const;
 const links=<><a href={anchor('rhl-example')}>{tr?'3D örneği':'3D example'}</a><a href={anchor('rhl-paths')}>{tr?'Üretim alanları':'Create'}</a><a href={anchor('rhl-cost')}>{tr?'Kredi hesabı':'Credits'}</a></>;
 return <div ref={container}>
 <header className="rhl-header"><Link href={home} className="rhl-brand" onClick={close}><Image src="/logo/rhl-mark.svg" alt="" width={34} height={31} unoptimized/>Renderhane</Link>
 <nav className="rhl-nav" aria-label={tr?'Ana menü':'Main menu'} onClick={e=>{if((e.target as Element).closest('a'))close()}}>{links}<details className="rhl-header-free"><summary>{tr?'Ücretsiz araçlar':'Free tools'}</summary><div className="rhl-free-menu">{free.map(([page,label,note])=><Link key={page} href={previewPath(locale,page)} aria-current={current===page?'page':undefined}>{label}<small>{note}</small></Link>)}<a href={anchor('rhl-free')}>{tr?'Tüm yardımcıları gör':'All helpers'} →</a></div></details></nav>
 <div className="rhl-actions"><Link className="rhl-login" href={loginPath(locale,null)}>{tr?'Giriş yap':'Sign in'}</Link><Link className="rhl-btn small" href={loginPath(locale,'img-to-3d')}>{tr?'Üretmeye başla':'Start creating'} <ArrowRight size={14}/></Link><button className="rhl-menu-toggle" type="button" aria-expanded={open} aria-controls="rhl-mobile-menu" aria-label={tr?'Menü':'Menu'} onClick={()=>setOpen(v=>!v)}>{open?<X size={18}/>:<Menu size={18}/>}</button></div></header>
 <nav className="rhl-mobile-nav" hidden={!open} id="rhl-mobile-menu" aria-label={tr?'Mobil menü':'Mobile menu'} onClick={e=>{if((e.target as Element).closest('a'))close()}}>{links}<span className="rhl-mobile-group">{tr?'Ücretsiz araçlar':'Free tools'}</span>{free.map(([page,label])=><Link key={page} href={previewPath(locale,page)}>{label}</Link>)}<Link href={previewPath(locale,'artistic')}>{tr?'Sanatsal QR':'Artistic QR'} <span className="rhl-paid-tag">{tr?'Ücretli':'Paid'}</span></Link></nav>
 </div>;
}
