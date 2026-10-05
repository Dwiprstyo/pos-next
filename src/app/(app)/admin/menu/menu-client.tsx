"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rupiah } from "@/lib/format";

import {
  deleteCategoryAction,
  toggleMenuItemAction,
  upsertCategoryAction,
  upsertMenuItemAction,
  type VariantGroupInput,
} from "./actions";

type Category = { id: string; name: string; station: string; sort_order: number };
type Ingredient = { id: string; name: string; unit: string };

type ItemRow = {
  id: string;
  name: string;
  base_price: number;
  category_id: string | null;
  is_available: boolean;
  variant_groups: {
    id: string;
    name: string;
    is_required: boolean;
    min_select: number;
    max_select: number;
    variant_options: { id: string; name: string; extra_price: number }[];
  }[];
  menu_item_ingredients: {
    ingredient_id: string;
    qty_required: number;
    ingredients: { name: string; unit: string } | null;
  }[];
};

type ItemFormState = {
  id?: string;
  name: string;
  categoryId: string | null;
  basePrice: string;
  isAvailable: boolean;
  variantGroups: {
    name: string;
    is_required: boolean;
    min_select: string;
    max_select: string;
    options: { name: string; extra_price: string }[];
  }[];
  recipe: { ingredientId: string; qtyRequired: string }[];
};

function emptyItem(): ItemFormState {
  return {
    name: "",
    categoryId: null,
    basePrice: "",
    isAvailable: true,
    variantGroups: [],
    recipe: [],
  };
}

export function MenuAdminClient({
  categories,
  items,
  ingredients,
  outlets,
  outletId,
  isMultiOutlet,
  outletName,
}: {
  categories: Category[];
  items: ItemRow[];
  ingredients: Ingredient[];
  outlets: { id: string; name: string }[];
  outletId: string | null;
  isMultiOutlet: boolean;
  outletName: string;
}) {
  const router = useRouter();
  const [categoryForm, setCategoryForm] = useState<{
    id?: string;
    name: string;
    station: string;
    sortOrder: string;
  } | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveCategory() {
    if (!categoryForm || !categoryForm.name.trim()) return;
    setSaving(true);
    const result = await upsertCategoryAction({
      id: categoryForm.id,
      outletId: outletId ?? undefined,
      name: categoryForm.name.trim(),
      station: categoryForm.station,
      sortOrder: Number(categoryForm.sortOrder) || 0,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Kategori disimpan");
    setCategoryForm(null);
    router.refresh();
  }

  async function removeCategory(id: string) {
    const result = await deleteCategoryAction(id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Kategori dihapus");
    router.refresh();
  }

  async function saveItem() {
    if (!itemForm) return;
    setSaving(true);
    const variantGroups: VariantGroupInput[] = itemForm.variantGroups
      .filter((group) => group.name.trim().length > 0)
      .map((group) => ({
        name: group.name.trim(),
        is_required: group.is_required,
        min_select: Number(group.min_select) || 0,
        max_select: Math.max(Number(group.max_select) || 1, 1),
        options: group.options
          .filter((option) => option.name.trim().length > 0)
          .map((option) => ({ name: option.name.trim(), extra_price: Number(option.extra_price) || 0 })),
      }));

    const result = await upsertMenuItemAction({
      id: itemForm.id,
      outletId: outletId ?? undefined,
      name: itemForm.name,
      categoryId: itemForm.categoryId,
      basePrice: Number(itemForm.basePrice),
      isAvailable: itemForm.isAvailable,
      variantGroups,
      recipe: itemForm.recipe
        .filter((row) => row.ingredientId && Number(row.qtyRequired) > 0)
        .map((row) => ({ ingredientId: row.ingredientId, qtyRequired: Number(row.qtyRequired) })),
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Menu disimpan");
    setItemForm(null);
    router.refresh();
  }

  function editItem(item: ItemRow) {
    setItemForm({
      id: item.id,
      name: item.name,
      categoryId: item.category_id,
      basePrice: String(item.base_price),
      isAvailable: item.is_available,
      variantGroups: (item.variant_groups ?? []).map((group) => ({
        name: group.name,
        is_required: group.is_required,
        min_select: String(group.min_select),
        max_select: String(group.max_select),
        options: (group.variant_options ?? []).map((option) => ({
          name: option.name,
          extra_price: String(option.extra_price),
        })),
      })),
      recipe: (item.menu_item_ingredients ?? []).map((row) => ({
        ingredientId: row.ingredient_id,
        qtyRequired: String(row.qty_required),
      })),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Menu — {outletName}</h1>
          <p className="text-sm text-muted-foreground">Kelola kategori, menu, varian, dan resep bahan.</p>
        </div>
        <div className="flex items-center gap-2">
          {isMultiOutlet ? (
            <Select
              value={outletId ?? ""}
              onValueChange={(value) => router.push(`/admin/menu?outlet=${value ?? ""}`)}
              items={outlets.map((outlet) => ({ value: outlet.id, label: outlet.name }))}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Pilih outlet" />
              </SelectTrigger>
              <SelectContent>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button onClick={() => setItemForm(emptyItem())} disabled={!outletId}>
            <Plus className="size-4" />
            Menu Baru
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Kategori</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCategoryForm({ name: "", station: "kitchen", sortOrder: "0" })}
          >
            <Plus className="size-4" />
            Kategori
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">{category.name}</p>
                <p className="text-xs text-muted-foreground">
                  {category.station} • urutan {category.sort_order}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() =>
                  setCategoryForm({
                    id: category.id,
                    name: category.name,
                    station: category.station,
                    sortOrder: String(category.sort_order),
                  })
                }
              >
                <Pencil className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => removeCategory(category.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kategori.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Menu</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Harga</TableHead>
                <TableHead>Varian</TableHead>
                <TableHead>Tersedia</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const category = categories.find((candidate) => candidate.id === item.category_id);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{category?.name ?? "-"}</TableCell>
                    <TableCell>{rupiah(item.base_price)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.variant_groups?.length ?? 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={item.is_available}
                        onCheckedChange={async (checked) => {
                          const result = await toggleMenuItemAction(item.id, checked);
                          if (!result.ok) toast.error(result.error);
                          else router.refresh();
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => editItem(item)}>
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Belum ada menu.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(categoryForm)} onOpenChange={(open) => !open && setCategoryForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryForm?.id ? "Edit Kategori" : "Kategori Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nama</Label>
              <Input
                value={categoryForm?.name ?? ""}
                onChange={(event) =>
                  setCategoryForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Station</Label>
                <Select
                  value={categoryForm?.station ?? "kitchen"}
                  onValueChange={(value) =>
                    setCategoryForm((prev) => (prev ? { ...prev, station: value ?? "kitchen" } : prev))
                  }
                  items={{ kitchen: "Kitchen", bar: "Bar" }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kitchen">Kitchen</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Urutan</Label>
                <Input
                  type="number"
                  value={categoryForm?.sortOrder ?? "0"}
                  onChange={(event) =>
                    setCategoryForm((prev) => (prev ? { ...prev, sortOrder: event.target.value } : prev))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryForm(null)}>
              Batal
            </Button>
            <Button onClick={saveCategory} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(itemForm)} onOpenChange={(open) => !open && setItemForm(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{itemForm?.id ? "Edit Menu" : "Menu Baru"}</DialogTitle>
            <DialogDescription>Atur harga, varian, dan resep bahan.</DialogDescription>
          </DialogHeader>

          {itemForm ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Nama</Label>
                  <Input
                    value={itemForm.name}
                    onChange={(event) =>
                      setItemForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Kategori</Label>
                  <Select
                    value={itemForm.categoryId ?? "none"}
                    onValueChange={(value) =>
                      setItemForm((prev) =>
                        prev
                          ? { ...prev, categoryId: !value || value === "none" ? null : value }
                          : prev,
                      )
                    }
                    items={[
                      { value: "none", label: "Tanpa kategori" },
                      ...categories.map((category) => ({ value: category.id, label: category.name })),
                    ]}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tanpa kategori</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Harga Dasar</Label>
                  <Input
                    type="number"
                    min={0}
                    value={itemForm.basePrice}
                    onChange={(event) =>
                      setItemForm((prev) => (prev ? { ...prev, basePrice: event.target.value } : prev))
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={itemForm.isAvailable}
                    onCheckedChange={(checked) =>
                      setItemForm((prev) => (prev ? { ...prev, isAvailable: checked } : prev))
                    }
                  />
                  <Label>Tersedia</Label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Varian</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setItemForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              variantGroups: [
                                ...prev.variantGroups,
                                {
                                  name: "",
                                  is_required: true,
                                  min_select: "1",
                                  max_select: "1",
                                  options: [{ name: "", extra_price: "0" }],
                                },
                              ],
                            }
                          : prev,
                      )
                    }
                  >
                    <Plus className="size-4" />
                    Grup
                  </Button>
                </div>

                {itemForm.variantGroups.map((group, groupIndex) => (
                  <div key={groupIndex} className="space-y-2 rounded-md border p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                      <Input
                        placeholder="Nama grup (cth. Level Pedas)"
                        value={group.name}
                        onChange={(event) =>
                          setItemForm((prev) => {
                            if (!prev) return prev;
                            const groups = [...prev.variantGroups];
                            groups[groupIndex] = { ...groups[groupIndex], name: event.target.value };
                            return { ...prev, variantGroups: groups };
                          })
                        }
                      />
                      <Input
                        type="number"
                        className="w-20"
                        title="min select"
                        value={group.min_select}
                        onChange={(event) =>
                          setItemForm((prev) => {
                            if (!prev) return prev;
                            const groups = [...prev.variantGroups];
                            groups[groupIndex] = { ...groups[groupIndex], min_select: event.target.value };
                            return { ...prev, variantGroups: groups };
                          })
                        }
                      />
                      <Input
                        type="number"
                        className="w-20"
                        title="max select"
                        value={group.max_select}
                        onChange={(event) =>
                          setItemForm((prev) => {
                            if (!prev) return prev;
                            const groups = [...prev.variantGroups];
                            groups[groupIndex] = { ...groups[groupIndex], max_select: event.target.value };
                            return { ...prev, variantGroups: groups };
                          })
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setItemForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  variantGroups: prev.variantGroups.filter((_, index) => index !== groupIndex),
                                }
                              : prev,
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={group.is_required}
                        onCheckedChange={(checked) =>
                          setItemForm((prev) => {
                            if (!prev) return prev;
                            const groups = [...prev.variantGroups];
                            groups[groupIndex] = { ...groups[groupIndex], is_required: checked };
                            return { ...prev, variantGroups: groups };
                          })
                        }
                      />
                      <span className="text-xs text-muted-foreground">Wajib dipilih</span>
                    </div>

                    <div className="space-y-2">
                      {group.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex gap-2">
                          <Input
                            placeholder="Nama opsi"
                            value={option.name}
                            onChange={(event) =>
                              setItemForm((prev) => {
                                if (!prev) return prev;
                                const groups = [...prev.variantGroups];
                                const options = [...groups[groupIndex].options];
                                options[optionIndex] = { ...options[optionIndex], name: event.target.value };
                                groups[groupIndex] = { ...groups[groupIndex], options };
                                return { ...prev, variantGroups: groups };
                              })
                            }
                          />
                          <Input
                            type="number"
                            className="w-28"
                            placeholder="+Rp"
                            value={option.extra_price}
                            onChange={(event) =>
                              setItemForm((prev) => {
                                if (!prev) return prev;
                                const groups = [...prev.variantGroups];
                                const options = [...groups[groupIndex].options];
                                options[optionIndex] = { ...options[optionIndex], extra_price: event.target.value };
                                groups[groupIndex] = { ...groups[groupIndex], options };
                                return { ...prev, variantGroups: groups };
                              })
                            }
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setItemForm((prev) => {
                                if (!prev) return prev;
                                const groups = [...prev.variantGroups];
                                groups[groupIndex] = {
                                  ...groups[groupIndex],
                                  options: groups[groupIndex].options.filter((_, index) => index !== optionIndex),
                                };
                                return { ...prev, variantGroups: groups };
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setItemForm((prev) => {
                            if (!prev) return prev;
                            const groups = [...prev.variantGroups];
                            groups[groupIndex] = {
                              ...groups[groupIndex],
                              options: [...groups[groupIndex].options, { name: "", extra_price: "0" }],
                            };
                            return { ...prev, variantGroups: groups };
                          })
                        }
                      >
                        <Plus className="size-4" />
                        Opsi
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Resep Bahan</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setItemForm((prev) =>
                        prev
                          ? { ...prev, recipe: [...prev.recipe, { ingredientId: "", qtyRequired: "" }] }
                          : prev,
                      )
                    }
                  >
                    <Plus className="size-4" />
                    Bahan
                  </Button>
                </div>

                {itemForm.recipe.map((row, index) => (
                  <div key={index} className="flex gap-2">
                    <Select
                      value={row.ingredientId || "none"}
                      onValueChange={(value) =>
                        setItemForm((prev) => {
                          if (!prev) return prev;
                          const recipe = [...prev.recipe];
                          const selected = value ?? "none";
                          recipe[index] = { ...recipe[index], ingredientId: selected === "none" ? "" : selected };
                          return { ...prev, recipe };
                        })
                      }
                      items={[
                        { value: "none", label: "Pilih bahan" },
                        ...ingredients.map((ingredient) => ({
                          value: ingredient.id,
                          label: `${ingredient.name} (${ingredient.unit})`,
                        })),
                      ]}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Pilih bahan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Pilih bahan</SelectItem>
                        {ingredients.map((ingredient) => (
                          <SelectItem key={ingredient.id} value={ingredient.id}>
                            {ingredient.name} ({ingredient.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      className="w-32"
                      placeholder="qty"
                      value={row.qtyRequired}
                      onChange={(event) =>
                        setItemForm((prev) => {
                          if (!prev) return prev;
                          const recipe = [...prev.recipe];
                          recipe[index] = { ...recipe[index], qtyRequired: event.target.value };
                          return { ...prev, recipe };
                        })
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setItemForm((prev) =>
                          prev ? { ...prev, recipe: prev.recipe.filter((_, i) => i !== index) } : prev,
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemForm(null)}>
              Batal
            </Button>
            <Button onClick={saveItem} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
