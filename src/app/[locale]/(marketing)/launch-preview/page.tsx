import {notFound,redirect} from 'next/navigation';
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(locale!=='tr'&&locale!=='en')notFound();
 redirect(`/${locale}`);
}