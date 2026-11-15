import { Button } from "./ui/button";
import { Plus } from "lucide-react";
export function PageHeading({eyebrow,title,description,action}:{eyebrow?:string;title:string;description:string;action?:React.ReactNode}) {return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="mb-2 text-[10px] font-semibold tracking-[1.3px] text-primary uppercase">{eyebrow}</p>}<h1 className="text-[28px] font-semibold leading-10 tracking-[-1px]">{title}</h1><p className="mt-1 text-xs leading-6 text-muted-foreground">{description}</p></div>{action}</div>;}
export function AddButton({onClick,children}:{onClick:()=>void;children:React.ReactNode}) {return <Button onClick={onClick} size="sm" className="h-9 rounded-lg px-3.5"><Plus size={14}/>{children}</Button>;}
