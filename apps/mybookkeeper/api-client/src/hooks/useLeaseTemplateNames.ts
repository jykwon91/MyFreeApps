import { useEffect, useState } from "react";
import { useLazyGetLeaseTemplateByIdQuery } from "../store/leaseTemplatesApi";

/**
 * Names of the lease templates with these ids, each fetched by id so a template past the first page of the
 * list still gets its name. A name appears once its template arrives (and from the cache when already
 * loaded); one that can't be fetched is left out, and the caller shows its own stand-in.
 */
export function useLeaseTemplateNames(ids: readonly string[]): Readonly<Record<string, string>> {
  const [fetchTemplate] = useLazyGetLeaseTemplateByIdQuery();
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const idsKey = ids.join(",");

  useEffect(() => {
    let isCurrent = true;
    for (const id of idsKey.split(",").filter(Boolean)) {
      fetchTemplate(id, true)
        .unwrap()
        .then((template) => {
          if (isCurrent) setNames((previous) => ({ ...previous, [id]: template.name }));
        })
        // The name is only a label; the caller falls back when it never arrives.
        .catch(() => undefined);
    }
    return () => {
      isCurrent = false;
    };
  }, [idsKey, fetchTemplate]);

  return names;
}
