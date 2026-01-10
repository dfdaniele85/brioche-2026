import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

type WeeklyRow = { weekday: number; product_id: string; expected_qty: number | null };
type ProductRow = { id: string; name: string };

export function useWeeklyExpected(productNames: string[]) {
  const namesKey = useMemo(() => productNames.slice().sort().join("|"), [productNames]);

  const [loading, setLoading] = useState(true);
  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});
  const [expectedByWeekday, setExpectedByWeekday] = useState<Record<number, Record<string, number>>>({
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
    7: {},
  });

  const refresh = useCallback(async () => {
    setLoading(true);

    const { data: prodData, error: prodErr } = await supabase
      .from("products")
      .select("id,name")
      .in("name", productNames);

    if (prodErr) throw prodErr;

    const prods = (prodData ?? []) as ProductRow[];

    const idByName: Record<string, string> = {};
    const nameById: Record<string, string> = {};
    for (const p of prods) {
      idByName[p.name] = p.id;
      nameById[p.id] = p.name;
    }

    const ids = prods.map((p) => p.id);
    const next: Record<number, Record<string, number>> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} };

    // inizializza a 0
    for (let w = 1 as number; w <= 7; w++) {
      for (const nm of productNames) next[w][nm] = 0;
    }

    if (ids.length > 0) {
      const { data: weData, error: weErr } = await supabase
        .from("weekly_expected")
        .select("weekday,product_id,expected_qty")
        .in("product_id", ids);

      if (weErr) throw weErr;

      const rows = (weData ?? []) as WeeklyRow[];
      for (const r of rows) {
        const nm = nameById[r.product_id];
        if (!nm) continue;
        const w = Number(r.weekday);
        if (!next[w]) continue;
        next[w][nm] = Number(r.expected_qty ?? 0);
      }
    }

    setProductIdByName(idByName);
    setExpectedByWeekday(next);
    setLoading(false);
  }, [productNames]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await refresh();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        if (alive) setLoading(false);
      }
    })();

    const ch = supabase
      .channel(`weekly_expected_watch_${namesKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_expected" }, () => {
        void refresh().catch((e) => console.error(e));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        void refresh().catch((e) => console.error(e));
      })
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [refresh, namesKey]);

  return { loading, productIdByName, expectedByWeekday, refresh };
}
