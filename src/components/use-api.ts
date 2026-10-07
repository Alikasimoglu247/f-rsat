"use client";
import { useEffect, useState, useCallback, useRef } from "react";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      [
        value.error,
        ...(value.issues ?? []).map(
          (item: { field: string; message: string }) =>
            `${item.field}: ${item.message}`,
        ),
        ...(value.rows ?? []).map(
          (item: { row: number; message: string }) =>
            `Satır ${item.row}: ${item.message}`,
        ),
      ].join(" "),
    );
  return value as T;
}
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const loadedPath = useRef<string | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener("radar:refresh", refresh);
    return () => window.removeEventListener("radar:refresh", refresh);
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setLoading(loadedPath.current !== path);
    setError("");
    api<T>(path)
      .then((value) => {
        if (active) {
          loadedPath.current = path;
          setData(value);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading, refresh };
}
