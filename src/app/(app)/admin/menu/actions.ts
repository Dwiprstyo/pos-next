"use server";

import { revalidatePath } from "next/cache";

import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type MenuActionResult = { ok: true } | { ok: false; error: string };

async function managerSession() {
  const session = await getSessionContext();
  if (!session || session.role !== "manager") return null;
  return session;
}

export async function upsertCategoryAction(input: {
  id?: string;
  outletId?: string;
  name: string;
  station: string;
  sortOrder: number;
}): Promise<MenuActionResult> {
  const session = await managerSession();
  const outletId = session?.isMultiOutlet ? input.outletId : session?.outletId;
  if (!session || !outletId) return { ok: false, error: "Pilih outlet terlebih dahulu." };

  const supabase = await createClient();

  if (input.id) {
    const { error } = await supabase
      .from("menu_categories")
      .update({ name: input.name, station: input.station, sort_order: input.sortOrder })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("menu_categories").insert({
      outlet_id: outletId,
      name: input.name,
      station: input.station,
      sort_order: input.sortOrder,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/admin/menu");
  revalidatePath("/pos");
  return { ok: true };
}

export async function deleteCategoryAction(id: string): Promise<MenuActionResult> {
  const session = await managerSession();
  if (!session?.outletId) return { ok: false, error: "Tidak punya akses." };

  const supabase = await createClient();
  const { error } = await supabase.from("menu_categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/menu");
  return { ok: true };
}

export type VariantGroupInput = {
  id?: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  options: { id?: string; name: string; extra_price: number }[];
};

export async function upsertMenuItemAction(input: {
  id?: string;
  outletId?: string;
  name: string;
  categoryId: string | null;
  basePrice: number;
  isAvailable: boolean;
  variantGroups: VariantGroupInput[];
  recipe: { ingredientId: string; qtyRequired: number }[];
}): Promise<MenuActionResult> {
  const session = await managerSession();
  const outletId = session?.isMultiOutlet ? input.outletId : session?.outletId;
  if (!session || !outletId) return { ok: false, error: "Pilih outlet terlebih dahulu." };

  if (!input.name.trim()) return { ok: false, error: "Nama menu wajib diisi." };
  if (!Number.isFinite(input.basePrice) || input.basePrice < 0) {
    return { ok: false, error: "Harga tidak valid." };
  }

  const supabase = await createClient();
  let itemId = input.id;

  if (itemId) {
    const { error } = await supabase
      .from("menu_items")
      .update({
        name: input.name.trim(),
        category_id: input.categoryId,
        base_price: input.basePrice,
        is_available: input.isAvailable,
      })
      .eq("id", itemId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        outlet_id: outletId,
        name: input.name.trim(),
        category_id: input.categoryId,
        base_price: input.basePrice,
        is_available: input.isAvailable,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Gagal menyimpan menu." };
    itemId = data.id;
  }

  const { error: deleteGroupsError } = await supabase
    .from("variant_groups")
    .delete()
    .eq("menu_item_id", itemId);
  if (deleteGroupsError) return { ok: false, error: deleteGroupsError.message };

  for (const [index, group] of input.variantGroups.entries()) {
    const { data: groupRow, error: groupError } = await supabase
      .from("variant_groups")
      .insert({
        menu_item_id: itemId,
        name: group.name.trim() || `Varian ${index + 1}`,
        is_required: group.is_required,
        min_select: group.min_select,
        max_select: group.max_select,
      })
      .select("id")
      .single();
    if (groupError || !groupRow) return { ok: false, error: groupError?.message ?? "Gagal menyimpan varian." };

    const options = group.options
      .filter((option) => option.name.trim().length > 0)
      .map((option) => ({
        variant_group_id: groupRow.id,
        name: option.name.trim(),
        extra_price: option.extra_price,
      }));

    if (options.length > 0) {
      const { error: optionsError } = await supabase.from("variant_options").insert(options);
      if (optionsError) return { ok: false, error: optionsError.message };
    }
  }

  const { error: deleteRecipeError } = await supabase
    .from("menu_item_ingredients")
    .delete()
    .eq("menu_item_id", itemId);
  if (deleteRecipeError) return { ok: false, error: deleteRecipeError.message };

  const recipe = input.recipe.filter((row) => row.ingredientId && row.qtyRequired > 0);
  if (recipe.length > 0) {
    const { error: recipeError } = await supabase.from("menu_item_ingredients").insert(
      recipe.map((row) => ({
        menu_item_id: itemId as string,
        ingredient_id: row.ingredientId,
        qty_required: row.qtyRequired,
      })),
    );
    if (recipeError) return { ok: false, error: recipeError.message };
  }

  revalidatePath("/admin/menu");
  revalidatePath("/pos");
  revalidatePath("/kds");
  return { ok: true };
}

export async function toggleMenuItemAction(id: string, isAvailable: boolean): Promise<MenuActionResult> {
  const session = await managerSession();
  if (!session?.outletId) return { ok: false, error: "Tidak punya akses." };

  const supabase = await createClient();
  const { error } = await supabase.from("menu_items").update({ is_available: isAvailable }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/menu");
  revalidatePath("/pos");
  return { ok: true };
}
