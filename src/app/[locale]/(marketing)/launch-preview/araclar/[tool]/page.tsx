import {notFound,redirect} from 'next/navigation';
import {toolFromSlug} from '@/lib/launch-preview/routes';
export default async function Page({params}:{params:Promise<{locale:string;tool:string}>}){
 const {locale,tool:slug}=await params;
 if(locale!=='tr'&&locale!=='en')notFound();
 const tool=toolFromSlug(slug);
 if(!tool)notFound();
 const routes={background:'arka-plan-kaldirma',qr:'qr-kod',nfc:'nfc-yaz'} as const;
 if(tool==='scenes')redirect(`/${locale}/araclar/sahne-olustur`);
 if(tool==='tools')redirect(`/${locale}#rhl-free`);
 if(tool==='artistic')redirect(`/${locale}/iletisim`);
 if(tool in routes)redirect(`/${locale}/araclar/${routes[tool as keyof typeof routes]}`);
 redirect(`/${locale}`);
}
