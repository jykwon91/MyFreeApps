import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet, X, Loader2 } from "lucide-react";
import api from "@/shared/lib/api";
import type { Property } from "@/shared/types/property/property";
import type { ImportResult } from "@/shared/types/transaction/import-result";
import Button from "@/shared/components/ui/Button";
import Select from "@/shared/components/ui/Select";

export interface BankStatementImportProps {
  properties: readonly Property[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export default function BankStatementImport({ properties, onClose, onSuccess, onError }: BankStatementImportProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
  }, []);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const params = propertyId ? `?property_id=${propertyId}` : "";
      const res = await api.post<ImportResult>(`/imports/bank-csv${params}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
      onSuccess(
        `Imported ${res.data.imported} transaction(s)` +
        (res.data.skipped_duplicates > 0 ? `, ${res.data.skipped_duplicates} duplicate(s) skipped` : ""),
      );
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      onError(detail ?? "Failed to import bank statement");
    } finally {
      setImporting(false);
    }
  }, [file, propertyId, onSuccess, onError]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-card border rounded-lg shadow-lg w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold">Import Bank Statement</h2>
          <button onClick={onClose} aria-label="Close import modal" className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">CSV File</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors"
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <FileSpreadsheet size={18} className="text-green-600" />
                  <span>{file.name}</span>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  <Upload size={24} className="mx-auto mb-2 opacity-50" />
                  <p>Click to select a CSV file</p>
                  <p className="text-xs mt-1">Supports Chase, Wells Fargo, Bank of America, and generic formats</p>
                </div>
              )}
            </button>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Property (optional)</label>
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full">
              <option value="">No property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          {result ? (
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-medium">Format detected:</span>{" "}
                <span className="capitalize">{result.format_detected}</span>
              </div>
              {result.preview.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">Vendor</th>
                        <th className="text-right px-3 py-2">Amount</th>
                        <th className="text-left px-3 py-2">Type</th>
                        <th className="text-left px-3 py-2">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {result.preview.map((row, i) => (
                        <tr key={i} className="hover:bg-muted/40">
                          <td className="px-3 py-2">{row.date}</td>
                          <td className="px-3 py-2 truncate max-w-[120px]">{row.vendor ?? ""}</td>
                          <td className="px-3 py-2 text-right">${row.amount}</td>
                          <td className="px-3 py-2 capitalize">{row.transaction_type}</td>
                          <td className="px-3 py-2">{row.category.replace(/_/g, " ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleImport}
            disabled={!file || importing}
          >
            {importing ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload size={14} className="mr-1.5" />
                Import
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
