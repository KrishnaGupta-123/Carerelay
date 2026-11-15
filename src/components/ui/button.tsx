import * as React from "react";
import { cva,type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants=cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-600/30 disabled:pointer-events-none disabled:opacity-50",{
  variants:{variant:{default:"bg-primary text-white hover:bg-primary/90 shadow-xs",outline:"border border-border bg-white hover:bg-muted",ghost:"hover:bg-muted text-muted-foreground",secondary:"bg-primary/8 text-primary hover:bg-primary/15",destructive:"bg-red-50 text-red-700 border border-red-100 hover:bg-red-100"},size:{default:"h-10 px-4",sm:"h-8 px-3 text-xs",lg:"h-12 px-6 text-base",icon:"size-10"}},defaultVariants:{variant:"default",size:"default"},
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof variants> {}
export const Button=React.forwardRef<HTMLButtonElement,ButtonProps>(({className,variant,size,type="button",...props},ref)=><button ref={ref} type={type} className={cn(variants({variant,size}),className)} {...props}/>);
Button.displayName="Button";
