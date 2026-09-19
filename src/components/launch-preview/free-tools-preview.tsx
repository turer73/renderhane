"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {LaunchNavigation} from './launch-navigation';
import {Footer} from '@/components/landing/footer';
import {previewHome,previewPath,type PreviewTool} from '@/lib/launch-preview/routes';
import type {Locale} from '@/lib/launch-preview/core';
import {enhanceMobileToolFlow} from './tools-engine/mobile-tool-flow';
import './tools-engine/styles.css';
import './launch.css';
import './tools.css';
import './preview-dark.css';

function productionPath(locale:Locale,page:PreviewTool|'home'):string {
 if(page==='home')return `/${locale}`;
 const slug:Partial<Record<PreviewTool,string>>={background:'arka-plan-kaldirma',qr:'qr-kod',nfc:'nfc-yaz'};
 if(page==='artistic')return `/${locale}/iletisim`;
 if(page==='tools')return `/${locale}#rhl-free`;
 const target=slug[page];
 return target?`/${locale}/araclar/${target}`:`/${locale}`;
}

/** Reuses the tested V3 TypeScript tool views. Not an iframe or a new AI backend. */
export function FreeToolsPreview({locale,page,enableBackgroundApi=false,production=false}:{locale:Locale;page:PreviewTool;enableBackgroundApi?:boolean;production?:boolean}){
 const router=useRouter();
 const host=useRef<HTMLDivElement>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const href=(target:PreviewTool)=>production?productionPath(locale,target):previewPath(locale,target);
 useEffect(()=>{
  let cancelled=false;let dispose:(()=>void)|undefined;
  setStatus('loading');
  void (async()=>{
   const {mountRenderhane}=await import('./tools-engine/core');
   const {createRenderhaneAdapter}=await import('./tools-engine/api-adapter');
   if(cancelled||!host.current)return;
   dispose=mountRenderhane(host.current,{initialPage:page,chrome:false,preview:!production,assetBase:'/launch-preview/tools',
    onRender:p=>enhanceMobileToolFlow(host.current!,p),
    adapters:enableBackgroundApi?createRenderhaneAdapter():undefined,
    pageHref:p=>production?productionPath(locale,p):previewPath(locale,p),
    onNavigate:p=>router.push(production?productionPath(locale,p):previewPath(locale,p)),
    onAnchor:anchor=>router.push(`${production?`/${locale}`:previewHome(locale)}#${({examples:'rhl-example',faq:'rhl-scope',how:'rhl-paths'} as Record<string,string>)[anchor]||anchor}`),
   });
   setStatus('ready');
  })().catch(()=>{if(!cancelled)setStatus('error')});
  return()=>{cancelled=true;dispose?.()};
 },[page,locale,enableBackgroundApi,production,router]);
 const labels=[['background','Arka plan kaldır'],['qr','Ücretsiz QR'],['nfc','NFC etiket yaz'],['artistic','Sanatsal QR']] as const;
 return <><div className="rhl rhl-tools-wrapper"><a className="rhl-skip" href="#rh-main">İçeriğe geç</a>{!production&&<div className="rhl-notice">TASARIM ÖNİZLEMESİ · 3D ana sayfa + V3 araçları · Canlı site değiştirilmedi</div>}<div className="rhl-shell"><LaunchNavigation locale={locale} current={page} production={production}/></div>
 <div className="rh-unified-tabs"><nav aria-label="Araçlar arasında geçiş">{labels.map(([p,label])=><Link href={href(p)} key={p} aria-current={page===p?'page':undefined} className={p==='artistic'?'rh-paid-link':''}>{label}{p==='artistic'&&<small>Ücretli</small>}</Link>)}</nav></div>
 {locale==='en'&&<p className="rhl-notice">V3 tool copy is currently available in Turkish.</p>}
 {status==='loading'&&<p className="rhl-tools-loading" role="status">Araç yükleniyor…</p>}
 {status==='error'&&<p className="rhl-tools-error" role="alert">Araç arayüzü açılamadı. Sayfayı yenileyin veya ana sayfaya dönün.</p>}
 <div ref={host} aria-label="Renderhane araç çalışma alanı"/>
 </div>
 <Footer />
 </>;
}
