import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {FreeToolsPreview} from '@/components/launch-preview/free-tools-preview';
import {toolFromSlug} from '@/lib/launch-preview/routes';
export const metadata:Metadata={title:'Renderhane — V3 araç önizlemesi',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{locale:string;tool:string}>}){
 // Preview flag is not authentication. Do not expose unreviewed previews publicly.
 if(process.env.RENDERHANE_LAUNCH_PREVIEW!=='1')notFound();
 const {locale,tool}=await params;
 if(locale!=='tr'&&locale!=='en')notFound();
 const page=toolFromSlug(tool);if(!page)notFound();
 // Intentionally no production adapter enabled by this route.
 return <FreeToolsPreview locale={locale} page={page}/>;
}
