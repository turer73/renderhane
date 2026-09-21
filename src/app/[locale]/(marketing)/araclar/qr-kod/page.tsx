"use client";
import {useParams} from "next/navigation";
import {FreeToolsPreview} from "@/components/launch-preview/free-tools-preview";
import {ToolGuideSection} from "@/components/seo/tool-guide-section";

export default function PublicQRCodePage(){
 const params=useParams<{locale:string}>();
 const locale=params.locale==="en"?"en":"tr";
 return (
  <>
   <FreeToolsPreview locale={locale} page="qr" production/>
   <div className="mx-auto max-w-5xl px-4 pb-16">
    <ToolGuideSection slug="qr-kod" locale={locale} />
   </div>
  </>
 );
}