"use client";
import {useParams} from "next/navigation";
import {FreeToolsPreview} from "@/components/launch-preview/free-tools-preview";
export default function PublicQRCodePage(){
 const params=useParams<{locale:string}>();
 const locale=params.locale==="en"?"en":"tr";
 return <FreeToolsPreview locale={locale} page="qr" production/>;
}