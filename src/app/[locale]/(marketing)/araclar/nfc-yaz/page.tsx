"use client";
import {useParams} from "next/navigation";
import {FreeToolsPreview} from "@/components/launch-preview/free-tools-preview";
import {ToolGuideSection} from "@/components/seo/tool-guide-section";

export default function PublicNfcWriterPage(){
 const params=useParams<{locale:string}>();
 const locale=params.locale==="en"?"en":"tr";
 return (
   <FreeToolsPreview locale={locale} page="nfc" production>
    <ToolGuideSection slug="nfc-yaz" locale={locale} />
   </FreeToolsPreview>
 );
}
