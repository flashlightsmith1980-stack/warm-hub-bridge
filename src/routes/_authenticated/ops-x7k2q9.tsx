/* eslint-disable @typescript-eslint/no-explicit-any -- server function payloads are runtime-validated. */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Star, Trash2, CopyPlus, ImagePlus, Plus, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  addProductKeys,
  adjustCustomerBalance,
  adminDashboardData,
  broadcastMessage,
  bulkUpdateProducts,
  claimAdmin,
  deleteProduct,
  deleteTemplate,
  duplicateProduct,
  inviteTelegramUser,
  resolveDispute,
  reviewPayment,
  saveCategory,
  saveProduct,
  saveSettings,
  saveTemplate,
  updateCustomers,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/ops-x7k2q9")({
  head: () => ({
    meta: [
      { title: "Store command center" },
      {
        name: "description",
        content: "Manage your Telegram storefront, catalog, customers and payments.",
      },
    ],
  }),
  component: Dashboard,
});

type AdminData = Awaited<ReturnType<typeof adminDashboardData>>;
type Run = (action: () => Promise<string>) => Promise<void>;
const money = (value: unknown) => `$${Number(value ?? 0).toFixed(2)}`;
const field = "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground";

function Dashboard() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const load = useServerFn(adminDashboardData);
  const claim = useServerFn(claimAdmin);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => load({}) });

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      toast.success(await action());
      await client.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading)
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">Loading command center...</p>
      </main>
    );
  if (query.error && /forbidden/i.test(String(query.error)))
    return <AccessPanel busy={busy} run={run} claim={claim} />;
  if (query.error || !query.data)
    return (
      <main className="p-10">
        <p className="text-destructive">{String(query.error ?? "Unable to load admin data")}</p>
      </main>
    );

  const data = query.data as AdminData;
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">
            Operations / live
          </p>
          <h1 className="font-display text-3xl font-bold text-balance md:text-4xl">
            Store command center
          </h1>
          <p className="text-sm text-muted-foreground">
            Run the Telegram store from one secure workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => query.refetch()}>
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Customers", data.stats.customers],
          ["Orders", data.stats.orders],
          ["Pending", data.stats.pendingPayments],
          ["Revenue", money(data.stats.revenue)],
          ["Balances", money(data.stats.liability)],
          ["Disputes", data.stats.openDisputes],
        ].map(([label, value]) => (
          <div className="panel p-4" key={String(label)}>
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <Tabs defaultValue="payments" className="flex flex-col gap-4">
        <TabsList className="h-auto flex-wrap justify-start">
          {[
            ["payments", "Payments"],
            ["products", "Products"],
            ["categories", "Categories"],
            ["customers", "Customers"],
            ["orders", "Orders"],
            ["disputes", "Disputes"],
            ["broadcasts", "Broadcasts"],
            ["settings", "Settings"],
          ].map(([value, label]) => (
            <TabsTrigger value={String(value)} key={String(value)}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="payments">
          <Payments data={data} busy={busy} run={run} />
        </TabsContent>
        <TabsContent value="products">
          <Products data={data} busy={busy} run={run} />
        </TabsContent>
        <TabsContent value="categories">
          <Categories data={data} busy={busy} run={run} />
        </TabsContent>
        <TabsContent value="customers">
          <Customers data={data} busy={busy} run={run} />
        </TabsContent>
        <TabsContent value="orders">
          <Orders data={data} />
        </TabsContent>
        <TabsContent value="disputes">
          <Disputes data={data} busy={busy} run={run} />
        </TabsContent>
        <TabsContent value="broadcasts">
          <Broadcasts data={data} busy={busy} run={run} />
        </TabsContent>
        <TabsContent value="settings">
          <Settings data={data} busy={busy} run={run} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function AccessPanel({
  busy,
  run,
  claim,
}: {
  busy: boolean;
  run: Run;
  claim: ReturnType<typeof useServerFn<typeof claimAdmin>>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="panel flex max-w-md flex-col gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Admin access required</h1>
        <p className="text-sm text-muted-foreground">
          If the store has no admin yet, claim the first admin role.
        </p>
        <Button disabled={busy} onClick={() => run(async () => (await claim({})).reason)}>
          Claim admin access
        </Button>
      </div>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Payments({ data, busy, run }: { data: AdminData; busy: boolean; run: Run }) {
  const review = useServerFn(reviewPayment);
  return (
    <Section
      title="Payments"
      description="Review chain verification results and resolve exceptions."
    >
      <div className="flex flex-col gap-3">
        {data.transactions.map((tx: any) => (
          <article
            className="panel flex flex-wrap items-center justify-between gap-4 p-4"
            key={tx.id}
          >
            <div className="min-w-0">
              <p className="font-mono text-sm">
                {tx.invoice_code} / {money(tx.amount_usd)} / {tx.asset}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                Expected {tx.expected_amount ?? "-"} · {tx.tx_hash || "No hash"}
                {tx.verification_note ? ` · ${tx.verification_note}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  tx.status === "completed"
                    ? "default"
                    : tx.status === "failed"
                      ? "destructive"
                      : "secondary"
                }
              >
                {tx.status}
              </Badge>
              {tx.status !== "completed" &&
                ["recheck", "approve", "reject"].map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    disabled={busy}
                    variant={
                      action === "reject"
                        ? "destructive"
                        : action === "approve"
                          ? "default"
                          : "outline"
                    }
                    onClick={() =>
                      run(
                        async () =>
                          (
                            await review({
                              data: {
                                id: tx.id,
                                action: action as "approve" | "reject" | "recheck",
                              },
                            })
                          ).message,
                      )
                    }
                  >
                    {action}
                  </Button>
                ))}
            </div>
          </article>
        ))}
        {!data.transactions.length && <Empty label="No payment invoices yet." />}
      </div>
    </Section>
  );
}

function Products({ data, busy, run }: { data: AdminData; busy: boolean; run: Run }) {
  const save = useServerFn(saveProduct),
    bulk = useServerFn(bulkUpdateProducts),
    addKeys = useServerFn(addProductKeys),
    remove = useServerFn(deleteProduct),
    duplicate = useServerFn(duplicateProduct);
  const [selected, setSelected] = useState<number[]>([]),
    [bulkAction, setBulkAction] = useState("activate"),
    [bulkValue, setBulkValue] = useState("");
  const toggle = (id: number) =>
    setSelected((old) => (old.includes(id) ? old.filter((item) => item !== id) : [...old, id]));
  return (
    <Section
      title="Products"
      description="Create, edit, activate and stock catalog items. Bulk actions apply to selected rows."
    >
      <ProductForm
        categories={data.categories}
        subcategories={data.subcategories}
        busy={busy}
        submit={(payload: any) => run(async () => (await save({ data: payload })).message)}
      />
      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <Badge variant="secondary">{selected.length} selected</Badge>
        <select
          className={field}
          value={bulkAction}
          onChange={(e) => setBulkAction(e.target.value)}
        >
          <option value="activate">Activate</option>
          <option value="deactivate">Deactivate</option>
          <option value="price">Set price</option>
          <option value="category">Move category</option>
        </select>
        {["price", "category"].includes(bulkAction) && (
          <Input
            className="w-36"
            placeholder={bulkAction === "price" ? "Price" : "Category ID"}
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
          />
        )}
        <Button
          disabled={busy || !selected.length}
          onClick={() =>
            run(
              async () =>
                (
                  await bulk({
                    data: {
                      ids: selected,
                      action: bulkAction as any,
                      ...(bulkValue ? { value: Number(bulkValue) } : {}),
                    },
                  })
                ).message,
            )
          }
        >
          Apply bulk edit
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {data.products.map((product: any) => (
          <ProductRow
            key={product.id}
            product={product}
            categories={data.categories}
            subcategories={data.subcategories}
            checked={selected.includes(product.id)}
            toggle={() => toggle(product.id)}
            busy={busy}
            save={(payload: any) => run(async () => (await save({ data: payload })).message)}
            remove={() => run(async () => (await remove({ data: { id: product.id } })).message)}
            duplicate={() =>
              run(async () => (await duplicate({ data: { id: product.id } })).message)
            }
            add={(keys: any) =>
              run(async () => {
                const result = await addKeys({ data: { productId: product.id, keys } });
                return `Added ${result.added} keys (stock ${result.stock}).`;
              })
            }
          />
        ))}
      </div>
    </Section>
  );
}

function ProductForm({ categories, subcategories, busy, submit, initial }: any) {
  const [form, setForm] = useState({
    id: initial?.id,
    name: initial?.name ?? "",
    price: initial?.price ?? "",
    description: initial?.description ?? "",
    productType: initial?.product_type ?? "file",
    categoryId: initial?.category_id ?? "",
    subcategoryId: initial?.subcategory_id ?? "",
    imageUrl: initial?.image_url ?? "",
    downloadLink: initial?.download_link ?? "",
    isActive: initial?.is_active ?? true,
    isFeatured: initial?.is_featured ?? false,
  });
  const set = (key: string, value: unknown) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <div className="panel grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
      <Input
        placeholder="Product name"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <Input
        type="number"
        min="0"
        step="0.01"
        placeholder="Price"
        value={form.price}
        onChange={(e) => set("price", e.target.value)}
      />
      <select
        className={field}
        value={form.productType}
        onChange={(e) => set("productType", e.target.value)}
      >
        <option value="file">Digital file</option>
        <option value="key">Unique key</option>
      </select>
      <select
        className={field}
        value={form.categoryId}
        onChange={(e) => set("categoryId", e.target.value)}
      >
        <option value="">No category</option>
        {categories.map((item: any) => (
          <option value={item.id} key={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <select
        className={field}
        value={form.subcategoryId}
        onChange={(e) => set("subcategoryId", e.target.value)}
      >
        <option value="">No subcategory</option>
        {subcategories
          .filter((item: any) => !form.categoryId || item.category_id === Number(form.categoryId))
          .map((item: any) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
      </select>
      <ImageField
        value={form.imageUrl}
        onChange={(value) => set("imageUrl", value)}
        title={form.name}
        description={form.description}
        badge={form.isFeatured ? "Featured" : form.productType === "key" ? "Unique key" : "File"}
        caption={form.price ? `$${Number(form.price || 0).toFixed(2)}` : ""}
      />
      <Input
        placeholder="Download URL"
        value={form.downloadLink}
        onChange={(e) => set("downloadLink", e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
        />{" "}
        Active
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isFeatured}
          onChange={(e) => set("isFeatured", e.target.checked)}
        />{" "}
        Featured
      </label>
      <Textarea
        className="md:col-span-2 lg:col-span-3"
        placeholder="Description"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => submit({ ...form, price: Number(form.price) })}>
          {initial ? "Save product" : "Create product"}
        </Button>
        {!initial && (
          <Button
            variant="outline"
            disabled={busy}
            title="Save and start another product in the same category"
            onClick={async () => {
              await submit({ ...form, price: Number(form.price) });
              setForm((old) => ({
                ...old,
                id: undefined,
                name: "",
                description: "",
                imageUrl: "",
                downloadLink: "",
              }));
            }}
          >
            <Plus className="size-4" /> Save & add another
          </Button>
        )}
      </div>
    </div>
  );
}


function ProductRow({
  product,
  categories,
  subcategories,
  checked,
  toggle,
  busy,
  save,
  remove,
  duplicate,
  add,
}: any) {
  const [editing, setEditing] = useState(false),
    [keys, setKeys] = useState("");
  return (
    <article className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={checked} onChange={toggle} />
          <span className="font-medium">{product.name}</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={product.is_active ? "default" : "secondary"}>
            {product.is_active ? "active" : "hidden"}
          </Badge>
          <Badge variant="outline">{money(product.price)}</Badge>
          <Badge variant="outline">
            {product.product_type === "file" ? "unlimited" : `${product.stock_count} stock`}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            size="sm"
            variant={product.is_featured ? "default" : "outline"}
            disabled={busy}
            title={product.is_featured ? "Remove featured status" : "Feature product"}
            onClick={() =>
              save({
                ...product,
                id: product.id,
                productType: product.product_type,
                categoryId: product.category_id,
                subcategoryId: product.subcategory_id,
                imageUrl: product.image_url,
                downloadLink: product.download_link,
                isActive: product.is_active,
                isFeatured: !product.is_featured,
                price: Number(product.price),
              })
            }
          >
            <Star className="size-4" /> {product.is_featured ? "Featured" : "Feature"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            title="Duplicate product"
            onClick={duplicate}
          >
            <CopyPlus className="size-4" /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            title="Delete product"
            onClick={remove}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </div>
      {editing && (
        <ProductForm
          initial={product}
          categories={categories}
          subcategories={subcategories}
          busy={busy}
          submit={save}
        />
      )}
      {product.product_type === "key" && (
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder="One unique inventory item per line"
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:text-foreground">
              <Upload className="size-4" /> Upload .txt file
              <input
                type="file"
                accept=".txt,text/plain,.csv"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const text = await file.text();
                  const lines = text
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);
                  if (!lines.length) {
                    toast.error("That file has no keys in it.");
                    return;
                  }
                  setKeys((old) => [...old.split(/\r?\n/), ...lines].filter(Boolean).join("\n"));
                  toast.success(`Loaded ${lines.length} keys from ${file.name}.`);
                }}
              />
            </label>
            <span className="text-xs text-muted-foreground">
              {keys.split(/\r?\n/).filter((line) => line.trim()).length} ready to add
            </span>
            <Button
              className="ml-auto"
              disabled={busy || !keys.trim()}
              onClick={() => {
                add(keys);
                setKeys("");
              }}
            >
              Add inventory
            </Button>
          </div>
        </div>
      )}

    </article>
  );
}

function Categories({ data, busy, run }: { data: AdminData; busy: boolean; run: Run }) {
  const save = useServerFn(saveCategory);
  return (
    <Section
      title="Categories"
      description="Organize the storefront navigation and edit names in place."
    >
      <CategoryForm
        busy={busy}
        categories={data.categories}
        submit={(payload: any) => run(async () => (await save({ data: payload })).message)}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {data.categories.map((category: any) => (
          <div className="panel flex flex-col gap-3 p-4" key={category.id}>
            <CategoryForm
              initial={category}
              busy={busy}
              kind="category"
              submit={(payload: any) => run(async () => (await save({ data: payload })).message)}
            />
            <div className="border-t border-border pt-3">
              {data.subcategories
                .filter((sub: any) => sub.category_id === category.id)
                .map((sub: any) => (
                  <CategoryForm
                    key={sub.id}
                    initial={sub}
                    busy={busy}
                    kind="subcategory"
                    categories={data.categories}
                    submit={(payload: any) =>
                      run(async () => (await save({ data: payload })).message)
                    }
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function CategoryForm({ initial, kind = "category", categories = [], busy, submit }: any) {
  const [name, setName] = useState(initial?.name ?? ""),
    [description, setDescription] = useState(initial?.description ?? ""),
    [categoryId, setCategoryId] = useState(initial?.category_id ?? categories[0]?.id ?? ""),
    [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-44 flex-1"
          placeholder={`${kind} name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {kind === "subcategory" && (
          <select
            className={field}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
        <Button
          size="sm"
          disabled={busy || name.trim().length < 2}
          onClick={() => submit({ id: initial?.id, kind, name, description, categoryId, imageUrl })}
        >
          {initial ? "Save" : `Add ${kind}`}
        </Button>
        {!initial && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || name.trim().length < 2}
            title={`Save and start another ${kind}`}
            onClick={async () => {
              await submit({ kind, name, description, categoryId, imageUrl });
              setName("");
              setDescription("");
              setImageUrl("");
            }}
          >
            <Plus className="size-4" /> Save & add another
          </Button>
        )}
      </div>
      <Input
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <ImageField
        value={imageUrl}
        onChange={setImageUrl}
        title={name}
        description={description}
        badge={kind === "category" ? "Category" : "Subcategory"}
      />

    </div>
  );
}

function Customers({ data, busy, run }: { data: AdminData; busy: boolean; run: Run }) {
  const invite = useServerFn(inviteTelegramUser),
    adjust = useServerFn(adjustCustomerBalance),
    update = useServerFn(updateCustomers);
  const [selected, setSelected] = useState<number[]>([]),
    [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      data.customers.filter((user: any) =>
        `${user.telegram_id} ${user.username ?? ""} ${user.first_name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data.customers, search],
  );
  return (
    <Section
      title="Customers"
      description="Invite users, adjust balances and manage access in bulk."
    >
      <InviteForm
        busy={busy}
        submit={(payload: any) => run(async () => (await invite({ data: payload })).message)}
      />
      <div className="panel flex flex-wrap gap-2 p-3">
        <Input
          className="min-w-48 flex-1"
          placeholder="Search customers"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Badge variant="secondary">{selected.length} selected</Badge>
        <Button
          size="sm"
          variant="outline"
          disabled={!selected.length || busy}
          onClick={() =>
            run(async () => (await update({ data: { ids: selected, isBanned: false } })).message)
          }
        >
          Unban
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!selected.length || busy}
          onClick={() =>
            run(async () => (await update({ data: { ids: selected, isBanned: true } })).message)
          }
        >
          Ban
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {filtered.map((user: any) => (
          <CustomerRow
            key={user.id}
            user={user}
            checked={selected.includes(user.id)}
            toggle={() =>
              setSelected((old) =>
                old.includes(user.id) ? old.filter((id) => id !== user.id) : [...old, user.id],
              )
            }
            busy={busy}
            adjust={(amount: any, reason: any) =>
              run(
                async () =>
                  `New balance: ${money((await adjust({ data: { userId: user.id, amount, reason } })).balance)}`,
              )
            }
          />
        ))}
      </div>
    </Section>
  );
}

function InviteForm({ busy, submit }: { busy: boolean; submit: (payload: any) => void }) {
  const [form, setForm] = useState({ telegramId: "", firstName: "", username: "", note: "" });
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  return (
    <div className="panel grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
      <Input
        placeholder="Telegram ID"
        value={form.telegramId}
        onChange={(e) => set("telegramId", e.target.value)}
      />
      <Input
        placeholder="First name"
        value={form.firstName}
        onChange={(e) => set("firstName", e.target.value)}
      />
      <Input
        placeholder="@username (optional)"
        value={form.username}
        onChange={(e) => set("username", e.target.value)}
      />
      <Input
        placeholder="Personal note (optional)"
        value={form.note}
        onChange={(e) => set("note", e.target.value)}
      />
      <Button
        className="lg:col-start-4"
        disabled={busy || !form.telegramId}
        onClick={() => submit(form)}
      >
        Add and invite
      </Button>
    </div>
  );
}

function CustomerRow({ user, checked, toggle, busy, adjust }: any) {
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState("Console adjustment");
  return (
    <article className="panel flex flex-wrap items-center justify-between gap-3 p-4">
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={checked} onChange={toggle} />
        <span>
          <b>{user.first_name || user.username || `Telegram ${user.telegram_id}`}</b>
          <small className="block text-muted-foreground">
            @{user.username || "unknown"} · {money(user.wallet_balance)}{" "}
            {user.is_banned ? "· banned" : ""}
          </small>
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          className="w-28"
          placeholder="+/- amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          className="w-48"
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button
          size="sm"
          disabled={busy || !Number(amount)}
          onClick={() => {
            adjust(Number(amount), reason);
            setAmount("");
          }}
        >
          Adjust
        </Button>
      </div>
    </article>
  );
}

function Orders({ data }: { data: AdminData }) {
  return (
    <Section title="Orders" description="Recent fulfillment and delivery history.">
      <div className="flex flex-col gap-3">
        {data.orders.map((order: any) => (
          <article className="panel flex flex-wrap justify-between gap-3 p-4" key={order.id}>
            <div>
              <p className="font-mono text-sm">
                Order #{order.id} · {money(order.total_amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {order.bot_users?.username
                  ? `@${order.bot_users.username}`
                  : `Telegram ${order.bot_users?.telegram_id ?? "-"}`}{" "}
                · {new Date(order.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Badge>{order.status}</Badge>
              <Badge variant="outline">{order.dispute_status}</Badge>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function Disputes({ data, busy, run }: { data: AdminData; busy: boolean; run: Run }) {
  const resolve = useServerFn(resolveDispute);
  return (
    <Section title="Disputes" description="Review customer reports and record a final resolution.">
      <div className="flex flex-col gap-3">
        {data.disputes.map((item: any) => (
          <DisputeRow
            key={item.id}
            item={item}
            busy={busy}
            submit={(resolution: any) =>
              run(async () => (await resolve({ data: { id: item.id, resolution } })).message)
            }
          />
        ))}
        {!data.disputes.length && <Empty label="No disputes." />}
      </div>
    </Section>
  );
}
function DisputeRow({ item, busy, submit }: any) {
  const [resolution, setResolution] = useState(item.resolution ?? "");
  return (
    <article className="panel flex flex-col gap-3 p-4">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-medium">
            Order #{item.order_id} · {money(item.orders?.total_amount)}
          </p>
          <p className="text-sm text-muted-foreground">{item.reason}</p>
        </div>
        <Badge variant={item.status === "opened" ? "destructive" : "secondary"}>
          {item.status}
        </Badge>
      </div>
      {item.status === "opened" && (
        <div className="flex flex-col gap-2 md:flex-row">
          <Textarea
            placeholder="Resolution and customer-facing note"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          <Button
            disabled={busy || resolution.trim().length < 2}
            onClick={() => submit(resolution)}
          >
            Resolve
          </Button>
        </div>
      )}
    </article>
  );
}

function Broadcasts({ data, busy, run }: { data: AdminData; busy: boolean; run: Run }) {
  const broadcast = useServerFn(broadcastMessage);
  const save = useServerFn(saveTemplate);
  const remove = useServerFn(deleteTemplate);
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState({
    id: null as number | null,
    title: "",
    category: "custom",
    body: "",
  });
  const selectedTemplate = data.templates.find((item: any) => String(item.id) === templateId);
  const libraryTemplate = data.templates.find(
    (item: any) => item.title === "E-BANK ENROLL complete Telegram template library",
  );
  const librarySections = libraryTemplate
    ? libraryTemplate.body
        .split(/\n(?=\d+\. )/)
        .filter((section: string) => /^\d+\. /.test(section))
    : [];
  return (
    <Section
      title="Broadcasts"
      description="Send a Telegram announcement to every active customer."
    >
      <div className="panel flex flex-col gap-3 p-4">
        <select
          className={field}
          value={templateId}
          onChange={(e) => {
            const template = data.templates.find((item: any) => String(item.id) === e.target.value);
            setTemplateId(e.target.value);
            if (template) setText(template.body);
          }}
        >
          <option value="">Choose a saved message template</option>
          {data.templates.map((template: any) => (
            <option value={template.id} key={template.id}>
              {template.category}: {template.title}
            </option>
          ))}
        </select>
        <Textarea
          rows={6}
          maxLength={3000}
          placeholder="Message to active customers"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-muted-foreground">{text.length}/3000</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!text.trim()}
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                toast.success("Message copied to clipboard.");
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
            <Button
              disabled={busy || text.trim().length < 2}
              onClick={() =>
                run(async () => {
                  const result = await broadcast({ data: { text } });
                  setText("");
                  setTemplateId("");
                  return `Broadcast delivered to ${result.sent} customers.`;
                })
              }
            >
              Send to all users
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">Saved message templates</h3>
        {data.templates.map((template: any) => (
          <article className="panel flex flex-col gap-3 p-4" key={template.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{template.title}</p>
                <p className="text-xs uppercase text-muted-foreground">{template.category}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setTemplateForm({
                      id: template.id,
                      title: template.title,
                      category: template.category,
                      body: template.body,
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(template.body);
                    toast.success("Template copied to clipboard.");
                  }}
                >
                  <Copy className="size-4" /> Copy
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setTemplateId(String(template.id));
                    setText(template.body);
                  }}
                >
                  <Check className="size-4" /> Use in composer
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  title="Delete template"
                  onClick={() =>
                    run(async () => (await remove({ data: { id: template.id } })).message)
                  }
                >
                  <Trash2 className="size-4" /> Delete
                </Button>
              </div>
            </div>
            <p className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
              {template.body}
            </p>
          </article>
        ))}
        {!data.templates.length && <Empty label="No saved templates yet." />}
        {selectedTemplate ? (
          <p className="text-xs text-muted-foreground">Selected: {selectedTemplate.title}</p>
        ) : null}
      </div>
      <div className="panel flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Template editor</h3>
          {templateForm.id ? <Badge variant="secondary">Editing template</Badge> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Template title"
            value={templateForm.title}
            onChange={(e) => setTemplateForm((old) => ({ ...old, title: e.target.value }))}
          />
          <Input
            placeholder="Category"
            value={templateForm.category}
            onChange={(e) => setTemplateForm((old) => ({ ...old, category: e.target.value }))}
          />
        </div>
        <Textarea
          rows={8}
          maxLength={3000}
          placeholder="Template message"
          value={templateForm.body}
          onChange={(e) => setTemplateForm((old) => ({ ...old, body: e.target.value }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              busy || templateForm.title.trim().length < 2 || templateForm.body.trim().length < 2
            }
            onClick={() =>
              run(async () => {
                const result = await save({ data: templateForm });
                setTemplateForm({ id: null, title: "", category: "custom", body: "" });
                return result.message;
              })
            }
          >
            {templateForm.id ? "Save template" : "Create template"}
          </Button>
          {templateForm.id ? (
            <Button
              variant="outline"
              onClick={() => setTemplateForm({ id: null, title: "", category: "custom", body: "" })}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
      {librarySections.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">Individual library messages</h3>
          {librarySections.map((section: string) => {
            const title = section.split("\n", 1)[0] ?? "Broadcast template";
            return (
              <article className="panel flex flex-col gap-3 p-4" key={title}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{title}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(section);
                        toast.success("Message copied to clipboard.");
                      }}
                    >
                      <Copy className="size-4" /> Copy
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy || section.length > 3000}
                      onClick={() =>
                        run(async () => {
                          const result = await broadcast({ data: { text: section } });
                          return `Message delivered to ${result.sent} customers.`;
                        })
                      }
                    >
                      Send to all users
                    </Button>
                  </div>
                </div>
                <p className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
                  {section}
                </p>
              </article>
            );
          })}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {data.broadcasts.map((item: any) => (
          <div className="panel flex justify-between gap-3 p-3" key={item.id}>
            <p className="truncate text-sm">{item.message_text}</p>
            <Badge variant="secondary">{item.sent_count} sent</Badge>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ImageField({
  value,
  onChange,
  title,
  description,
  badge,
  caption,
}: {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  description?: string;
  badge?: string;
  caption?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    try {
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)}`;
      const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false });
      if (error) throw error;
      onChange(`/api/public/media/${path}`);
      toast.success("Image saved to the card");
    } catch (error) {
      toast.error(
        error instanceof Error ? `Image upload failed: ${error.message}` : "Image upload failed",
      );
    } finally {
      setUploading(false);
    }
  }
  const heading = title?.trim() || "Untitled";
  const blurb = description?.trim() || "Add a description so shoppers know what this is about.";
  return (
    <div className="flex flex-col gap-2 md:col-span-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={`group relative overflow-hidden rounded-xl border transition ${
          dragging ? "border-primary ring-2 ring-primary/40" : "border-border"
        }`}
      >
        <div className="relative aspect-[16/7] w-full bg-muted">
          {value ? (
            <img src={value} alt={heading} className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 text-center">
              <ImagePlus className="size-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Drag an image here or use the button below
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
            {badge && (
              <span className="w-fit rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                {badge}
              </span>
            )}
            <p className="text-base font-semibold leading-tight text-foreground">{heading}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{blurb}</p>
            {caption && <p className="font-mono text-xs text-primary">{caption}</p>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="shrink-0 cursor-pointer rounded-md border border-input px-3 py-2 text-sm">
          {uploading ? "Uploading..." : value ? "Replace image" : "Upload image"}
          <input
            className="hidden"
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
        <Input
          className="min-w-40 flex-1"
          placeholder="or paste an image link"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}


function Settings({ data, busy, run }: { data: AdminData; busy: boolean; run: Run }) {
  const save = useServerFn(saveSettings);
  const [form, setForm] = useState<any>(data.settings ?? {});
  const set = (key: string, value: string) => setForm((old: any) => ({ ...old, [key]: value }));
  return (
    <Section
      title="Store settings"
      description="Update bot copy, support links, wallet destinations and payment tolerances."
    >
      <div className="panel grid gap-3 p-4 md:grid-cols-2">
        <Input
          placeholder="Store name"
          value={form.store_name ?? ""}
          onChange={(e) => set("store_name", e.target.value)}
        />
        <Input
          placeholder="Support username"
          value={form.support_username ?? ""}
          onChange={(e) => set("support_username", e.target.value)}
        />
        <Input
          placeholder="Channel username or https://t.me/channel"
          value={form.channel_username ?? ""}
          onChange={(e) => set("channel_username", e.target.value)}
        />
        <p className="text-sm text-muted-foreground md:col-span-2">
          New users receive a join invitation and must join this channel before the $3 welcome bonus
          is deposited.
        </p>
        <Textarea
          className="md:col-span-2"
          placeholder="Welcome message"
          value={form.welcome_message ?? ""}
          onChange={(e) => set("welcome_message", e.target.value)}
        />
        <Input
          placeholder="Mini app URL"
          value={form.mini_app_url ?? ""}
          onChange={(e) => set("mini_app_url", e.target.value)}
        />
        <ImageField
          value={form.banner_image_url ?? ""}
          onChange={(value) => set("banner_image_url", value)}
        />
        {(
          [
            ["btc_address", "BTC address"],
            ["usdt_trc20_address", "USDT TRC20 address"],
            ["usdc_erc20_address", "USDC ERC20 (Ethereum) address"],
          ] as const
        ).map(([key, label]) => (
          <Input
            key={key}
            placeholder={label}
            value={form[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
          />
        ))}
        <Input
          type="number"
          min="5"
          max="1440"
          placeholder="Invoice expiry minutes"
          value={form.payment_expiry_minutes ?? 30}
          onChange={(e) => set("payment_expiry_minutes", e.target.value)}
        />
        <Input
          type="number"
          min="0"
          max="20"
          step="0.1"
          placeholder="Tolerance percent"
          value={form.amount_tolerance_percent ?? 2}
          onChange={(e) => set("amount_tolerance_percent", e.target.value)}
        />
        <Button
          className="md:col-start-2"
          disabled={busy}
          onClick={() =>
            run(
              async () =>
                (
                  await save({
                    data: {
                      storeName: String(form.store_name ?? ""),
                      welcomeMessage: String(form.welcome_message ?? ""),
                      supportUsername: String(form.support_username ?? ""),
                      channelUsername: String(form.channel_username ?? ""),
                      miniAppUrl: String(form.mini_app_url ?? ""),
                      bannerImageUrl: String(form.banner_image_url ?? ""),
                      btcAddress: String(form.btc_address ?? ""),
                      usdtTrc20Address: String(form.usdt_trc20_address ?? ""),
                      usdcErc20Address: String(form.usdc_erc20_address ?? ""),
                      paymentExpiryMinutes: Number(form.payment_expiry_minutes ?? 30),
                      amountTolerancePercent: Number(form.amount_tolerance_percent ?? 2),
                    },
                  })
                ).message,
            )
          }
        >
          Save settings
        </Button>
      </div>
    </Section>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="panel p-8 text-center text-sm text-muted-foreground">{label}</div>;
}
