import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface FormFieldContextValue {
  id: string;
  name: string;
  error?: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

interface FormItemProps extends React.HTMLAttributes<HTMLDivElement> {}

const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(
  ({ className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    );
  }
);
FormItem.displayName = "FormItem";

interface FormLabelProps
  extends React.ComponentPropsWithoutRef<typeof Label> {}

const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  FormLabelProps
>(({ className, ...props }, ref) => {
  return <Label ref={ref} className={cn(className)} {...props} />;
});
FormLabel.displayName = "FormLabel";

interface FormControlProps
  extends React.ComponentPropsWithoutRef<typeof Slot> {}

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  FormControlProps
>(({ ...props }, ref) => {
  return <Slot ref={ref} {...props} />;
});
FormControl.displayName = "FormControl";

interface FormDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  FormDescriptionProps
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children?: React.ReactNode;
}

const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn("text-sm font-medium text-destructive", className)}
        {...props}
      >
        {children}
      </p>
    );
  }
);
FormMessage.displayName = "FormMessage";

export {
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormFieldContext,
};
