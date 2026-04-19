import { nip19 } from "nostr-tools";
import { ProductData } from "./product-parser-functions";


// Escape special regex characters so user input never causes a RegExp crash.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Category Filter

// Returns true if the product belongs to at least one of the selected categories.
// When no categories are selected (empty set), every product passes.
export function productSatisfiesCategoryFilter(
  product: ProductData,
  selectedCategories: Set<string>
): boolean {
  if (selectedCategories.size === 0) return true;

  return Array.from(selectedCategories).some((selectedCategory) => {
    const re = new RegExp(escapeRegExp(selectedCategory), "i");
    return product.categories?.some((category) => re.test(category)) ?? false;
  });
}

// Location Filter

// Returns true if the product's location matches the selected location exactly.
// When no location is selected (empty string), every product passes.
export function productSatisfiesLocationFilter(
  product: ProductData,
  selectedLocation: string
): boolean {
  if (!selectedLocation) return true;
  return product.location === selectedLocation;
}

// Search (Text / npub / naddr / Price)

export function productSatisfiesSearchFilter(
  product: ProductData,
  searchQuery: string
): boolean {
  const normalizedSearch = searchQuery.trim();
  if (!normalizedSearch) return true;
  if (!product.title) return false;

  // ── naddr lookup ──
  if (normalizedSearch.startsWith("naddr1")) {
    try {
      const decoded = nip19.decode(normalizedSearch);
      if (decoded.type === "naddr") {
        return (
          product.d === decoded.data.identifier &&
          product.pubkey === decoded.data.pubkey
        );
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── npub lookup ──
  if (normalizedSearch.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(normalizedSearch);
      if (decoded.type === "npub") {
        return decoded.data === product.pubkey;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ── Text / numeric matching ──
  try {
    const re = new RegExp(escapeRegExp(normalizedSearch), "i");

    if (re.test(product.title)) return true;
    if (product.summary && re.test(product.summary)) return true;

    const numericSearch = parseFloat(normalizedSearch);
    if (!isNaN(numericSearch) && product.price === numericSearch) return true;

    return false;
  } catch {
    // Malformed input that somehow bypasses escaping — fail closed
    return false;
  }
}

// Composite Filter

// Function combining all three filters.
// Returns true only if the product satisfies every active filter.
export function productSatisfiesAllFilters(
  product: ProductData,
  selectedCategories: Set<string>,
  selectedLocation: string,
  searchQuery: string
): boolean {
  return (
    productSatisfiesCategoryFilter(product, selectedCategories) &&
    productSatisfiesLocationFilter(product, selectedLocation) &&
    productSatisfiesSearchFilter(product, searchQuery)
  );
}
