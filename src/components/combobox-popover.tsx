import { Combobox, ComboboxContent, ComboboxInput, ComboboxTrigger, ComboboxEmpty, ComboboxList, ComboboxItem, ComboboxValue } from "@/components/ui/combobox";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function ComboboxPopover({
  items,
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  items: {
    label: string;
    value: string;
  }[];
  className?: string;
}) {
  // Find the selected item object for Base UI
  const selectedItem = items.find((item) => item.value === value) ?? null;

  return (
    <Combobox
      value={selectedItem}
      onValueChange={(item) => onChange(item?.value ?? "")}
    >
      <ComboboxTrigger render={<Button variant="outline" className={cn("justify-between font-normal", className || "w-64")}><ComboboxValue placeholder="Select..." /></Button>} />
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder="Search" />
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {items.map((item) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
