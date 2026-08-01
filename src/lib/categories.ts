export const CATEGORIES = [
  { value: "beers",          label: "Beer",           icon: "🍺" },
  { value: "liquor",         label: "Rum",            icon: "🍾" },
  { value: "drinks",         label: "Soft Drinks",    icon: "🧃" },
  { value: "cigarettes",     label: "Cigs",           icon: "🚬" },
  { value: "snacks",         label: "Snacks",         icon: "🍟" },
  { value: "food",           label: "Food",           icon: "🍽️" },
  { value: "miscellaneous",  label: "Misc",           icon: "📦" },
] as const;

export type CategoryValue = typeof CATEGORIES[number]["value"];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

export function categoryIcon(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.icon ?? "🍹";
}

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/**
 * Returns the i18n translation key for a category value.
 * Use with t(): t(categoryKey("beers"), "Beer")
 */
export function categoryKey(value: string): string {
  return `cat_${value}`;
}
