"use client";
import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function Error({error,reset}:{error:Error;reset:()=>void}){useEffect(()=>{console.error(error);},[error]);return <div className="mx-auto max-w-md py-20 text-center"><AlertCircle size={34} className="mx-auto text-amber-600"/><h1 className="mt-5 text-xl font-semibold">Your care space couldn’t load.</h1><p className="my-4 text-sm leading-7 text-muted-foreground">Please try again. Your previously saved care records remain in the database.</p><Button onClick={reset}>Try again</Button></div>;}
