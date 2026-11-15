"use client";
import { Children,cloneElement,isValidElement,useId,type ReactNode } from "react";
import { cn } from "@/lib/utils";
const field="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm outline-none transition-shadow focus:border-primary/60 focus:ring-3 focus:ring-primary/10 disabled:bg-muted";
export function Input({className,...props}:React.InputHTMLAttributes<HTMLInputElement>) {return <input className={cn(field,className)} {...props}/>;}
export function Textarea({className,...props}:React.TextareaHTMLAttributes<HTMLTextAreaElement>) {return <textarea className={cn(field,"min-h-24 resize-y",className)} {...props}/>;}
export function Select({className,...props}:React.SelectHTMLAttributes<HTMLSelectElement>) {return <select className={cn(field,"min-h-11",className)} {...props}/>;}
export function Field({label,children,hint,required}:{label:string;children:ReactNode;hint?:string;required?:boolean}) {
  const id=useId();const hintId=`${id}-hint`;
  const connect=(node:ReactNode):ReactNode=>{
    if(!isValidElement<{id?:string;children?:ReactNode;"aria-describedby"?:string}>(node)) return node;
    if(node.type===Input || node.type===Textarea || node.type===Select || node.type==="input" || node.type==="select" || node.type==="textarea") return cloneElement(node,{id,"aria-describedby":hint?hintId:undefined});
    return node.props.children?cloneElement(node,{},Children.map(node.props.children,connect)):node;
  };
  return <div className="block space-y-2"><div className="flex items-center"><label htmlFor={id} className="block text-xs font-semibold text-foreground">{label}</label>{required && <span aria-hidden="true" className="ml-1 text-xs text-primary">*</span>}</div>{Children.map(children,connect)}{hint && <span id={hintId} className="block text-xs leading-5 text-muted-foreground">{hint}</span>}</div>;
}
