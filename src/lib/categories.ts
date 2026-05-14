export const CATEGORIES = [
  { value: "beers",       label: "Beers",       icon: "🍺" },
  { value: "liquor",      label: "Liquor",      icon: "🍾" },
  { value: "drinks",      label: "Drinks",      icon: "🧃" },
  { value: "snacks",      label: "Snacks",      icon: "🍟" },
  { value: "cigarettes",  label: "Cigarettes",  icon: "🚬" },
] as const;

export type CategoryValue = typeof CATEGORIES[number]["value"];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

export function categoryIcon(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.icon ?? "🍹";
}

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
