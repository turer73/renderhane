"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {LaunchNavigation} from './launch-navigation';
import {previewHome,previewPath,type PreviewTool} from '@/lib/launch-preview/routes';
import type {Locale} from '@/lib/launch-preview/core';
import './tools-engine/styles.css';
import './launch.css';
import './tools.css';
import './preview-dark.css';
/** Reuses the tested V3 TypeScript tool views. Not an iframe or a new AI backend. */
export function FreeToolsPreview({locale,page,enableBackgroundApi=false}:{locale:Locale;page:PreviewTool;enableBackgroundApi?:boolean}){
 const router=useRouter(); const host=useRef<HTMLDivElement>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{
  let cancelled=false;let dispose:(()=>void)|undefined;
  setStatus('loading');
  void (async()=>{
   const {mountRenderhane}=await import('./tools-engine/core');
   const {createRenderhaneAdapter}=await import('./tools-engine/api-adapter');
   if(cancelled||!host.current)return;
   dispose=mountRenderhane(host.current,{initialPage:page,chrome:false,preview:true,assetBase:'/launch-preview/tools',
    adapters:enableBackgroundApi?createRenderhaneAdapter():undefined,
    pageHref:p=>previewPath(locale,p),
    onNavigate:p=>router.push(previewPath(locale,p)),
    onAnchor:anchor=>router.push(`${previewHome(locale)}#${({examples:'rhl-example',faq:'rhl-scope',how:'rhl-paths'} as Record<string,string>)[anchor]||anchor}`),
   });
   setStatus('ready');
  })().catch(()=>{if(!cancelled)setStatus('error')});
  return()=>{cancelled=true;dispose?.()};
 },[page,locale,enableBackgroundApi,router]);
 const labels=[['background','Arka plan kaldır'],['qr','Ücretsiz QR'],['nfc','NFC etiket yaz'],['artistic','Sanatsal QR']] as const;
 return <div className="rhl rhl-tools-wrapper"><a className="rhl-skip" href="#rh-main">İçeriğe geç</a><div className="rhl-notice">TASARIM ÖNİZLEMESİ · 3D ana sayfa + V3 araçları · Canlı site değiştirilmedi</div><div className="rhl-shell"><LaunchNavigation locale={locale} current={page}/></div>
 <div className="rh-unified-tabs"><nav aria-label="Araçlar arasında geçiş">{labels.map(([p,label])=><Link href={previewPath(locale,p)} key={p} aria-current={page===p?'page':undefined} className={p==='artistic'?'rh-paid-link':''}>{label}{p==='artistic'&&<small>Ücretli</small>}</Link>)}</nav></div>
 {locale==='en'&&<p className="rhl-notice">V3 tool copy is Turkish in this preview. English tool localization is not included.</p>}
 {status==='loading'&&<p className="rhl-tools-loading" role="status">Araç yükleniyor…</p>}
 {status==='error'&&<p className="rhl-tools-error" role="alert">Araç arayüzü açılamadı. Sayfayı yenileyin veya ana sayfaya dönün.</p>}
 <div ref={host} aria-label="Renderhane araç çalışma alanı"/>
 <div className="rhl-shell"><footer className="rhl-footer"><Link href={previewHome(locale)}><b>Renderhane</b></Link><span>3D model, görsel ve video üretimi.</span><div className="rhl-native-footer-links"><Link href={previewHome(locale)}>Ana sayfaya dön</Link><Link href={previewPath(locale,'tools')}>Araç kataloğu</Link><Link href={`${previewHome(locale)}#rhl-scope`}>Demo kapsamı</Link></div></footer></div>
 </div>;
}
