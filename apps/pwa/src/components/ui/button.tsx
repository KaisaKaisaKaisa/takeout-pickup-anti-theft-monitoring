import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "default" | "secondary" | "ghost" | "amber";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return <button className={cn("ui-button", `ui-button-${variant}`, className)} {...props} />;
}
