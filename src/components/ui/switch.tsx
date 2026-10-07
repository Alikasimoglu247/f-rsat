"use client";
import * as React from "react";
import { Switch as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-muted transition-colors data-[state=checked]:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500",
        className,
      )}
      {...props}
    >
      <Primitive.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5" />
    </Primitive.Root>
  );
}
