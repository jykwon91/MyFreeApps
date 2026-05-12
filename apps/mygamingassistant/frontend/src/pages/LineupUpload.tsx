/**
 * LineupUpload — manual lineup upload form.
 * Route: /lineups/new
 *
 * Upload flow:
 *   1. User selects a game → map → zones + utility → fills metadata
 *   2. User selects stand screenshot → requests presigned PUT URL →
 *      PUTs file directly to MinIO with XHR progress
 *   3. Same for aim screenshot (+ optional aim anchor click on preview)
 *   4. Submit → POST /api/lineups?lineup_id=... → redirect to map page
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  FileUploadDropzone,
  FormField,
  LoadingButton,
  Select,
  showError,
  showSuccess,
} from "@platform/ui";
import { useGetGamesQuery, useGetMapDetailQuery, useGetMapsQuery } from "@/store/gamesApi";
import {
  useCreateLineupMutation,
  useGetUploadUrlMutation,
} from "@/store/lineupsApi";
import type { LineupCreate } from "@/types/game";
import { uploadFileToPresignedUrl } from "@/lib/storage";

interface FormValues {
  game_id: string;
  map_id: string;
  target_zone_id: string;
  stand_zone_id: string;
  side: "side_a" | "side_b" | "any";
  utility_type_id: string;
  title: string;
  notes: string;
  setup_seconds: string;
}

export default function LineupUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultGameSlug = searchParams.get("game") ?? "";
  const defaultMapSlug = searchParams.get("map") ?? "";

  const { data: games } = useGetGamesQuery();
  const [selectedGameSlug, setSelectedGameSlug] = useState(defaultGameSlug);
  const [selectedMapSlug, setSelectedMapSlug] = useState(defaultMapSlug);

  const { data: maps } = useGetMapsQuery(selectedGameSlug, {
    skip: !selectedGameSlug,
  });
  const { data: mapDetail } = useGetMapDetailQuery(
    { gameSlug: selectedGameSlug, mapSlug: selectedMapSlug },
    { skip: !selectedGameSlug || !selectedMapSlug },
  );

  const selectedGame = games?.find((g) => g.slug === selectedGameSlug);
  const selectedMap = maps?.find((m) => m.slug === selectedMapSlug);

  // Screenshot upload state
  const [standFile, setStandFile] = useState<File | null>(null);
  const [aimFile, setAimFile] = useState<File | null>(null);
  const [standProgress, setStandProgress] = useState(0);
  const [aimProgress, setAimProgress] = useState(0);
  const [standUploading, setStandUploading] = useState(false);
  const [aimUploading, setAimUploading] = useState(false);
  const [standKey, setStandKey] = useState<string | null>(null);
  const [aimKey, setAimKey] = useState<string | null>(null);
  const [lineupIdFromUrl, setLineupIdFromUrl] = useState<string | null>(null);

  // Aim anchor (click on aim preview to set)
  const [aimAnchor, setAimAnchor] = useState<{ x: number; y: number } | null>(null);
  const aimPreviewRef = useRef<HTMLDivElement>(null);

  const [getUploadUrl] = useGetUploadUrlMutation();
  const [createLineup, { isLoading: isCreating }] = useCreateLineupMutation();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      game_id: "",
      map_id: "",
      target_zone_id: "",
      stand_zone_id: "",
      side: "side_a",
      utility_type_id: "",
      title: "",
      notes: "",
      setup_seconds: "",
    },
  });

  // Sync game/map dropdowns → form values
  useEffect(() => {
    if (selectedGame) setValue("game_id", selectedGame.id);
  }, [selectedGame, setValue]);

  useEffect(() => {
    if (selectedMap) setValue("map_id", selectedMap.id);
  }, [selectedMap, setValue]);

  // Preview URLs — derived from the selected files using useMemo so object URLs
  // are created and revoked deterministically without needing useEffect setState.
  const standPreview = useMemo(() => {
    if (!standFile) return null;
    const url = URL.createObjectURL(standFile);
    return url;
  }, [standFile]);

  const aimPreview = useMemo(() => {
    if (!aimFile) return null;
    const url = URL.createObjectURL(aimFile);
    return url;
  }, [aimFile]);

  // Revoke object URLs when they change to avoid memory leaks
  useEffect(() => {
    return () => {
      if (standPreview) URL.revokeObjectURL(standPreview);
    };
  }, [standPreview]);

  useEffect(() => {
    return () => {
      if (aimPreview) URL.revokeObjectURL(aimPreview);
    };
  }, [aimPreview]);

  // Upload a screenshot to MinIO via presigned PUT URL
  async function uploadScreenshot(
    file: File,
    key: string,
    putUrl: string,
    setProgress: (n: number) => void,
    setUploading: (b: boolean) => void,
    setKey: (k: string) => void,
  ) {
    setUploading(true);
    setProgress(0);
    try {
      await uploadFileToPresignedUrl(putUrl, file, setProgress);
      setKey(key);
    } catch (err) {
      showError("Screenshot upload failed. Please try again.");
      throw err;
    } finally {
      setUploading(false);
    }
  }

  // Request upload URL pair on first file select (both slots at once)
  const uploadUrlFetched = useRef(false);
  const [uploadUrlData, setUploadUrlData] = useState<{
    lineup_id: string;
    stand_upload_url: string;
    aim_upload_url: string;
    stand_object_key: string;
    aim_object_key: string;
  } | null>(null);

  async function ensureUploadUrls() {
    if (uploadUrlData) return uploadUrlData;
    const result = await getUploadUrl().unwrap();
    setUploadUrlData(result);
    setLineupIdFromUrl(result.lineup_id);
    uploadUrlFetched.current = true;
    return result;
  }

  async function handleStandFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setStandFile(file);
    try {
      const urls = await ensureUploadUrls();
      await uploadScreenshot(
        file,
        urls.stand_object_key,
        urls.stand_upload_url,
        setStandProgress,
        setStandUploading,
        setStandKey,
      );
    } catch {
      setStandFile(null);
    }
  }

  async function handleAimFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setAimFile(file);
    try {
      const urls = await ensureUploadUrls();
      await uploadScreenshot(
        file,
        urls.aim_object_key,
        urls.aim_upload_url,
        setAimProgress,
        setAimUploading,
        setAimKey,
      );
    } catch {
      setAimFile(null);
    }
  }

  // Aim anchor click handler
  const handleAimClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const div = aimPreviewRef.current;
    if (!div) return;
    const rect = div.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setAimAnchor({
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    });
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    if (!standKey || !aimKey) {
      showError("Please upload both screenshots before saving.");
      return;
    }

    const payload: LineupCreate = {
      game_id: values.game_id,
      map_id: values.map_id,
      target_zone_id: values.target_zone_id,
      stand_zone_id: values.stand_zone_id,
      side: values.side,
      utility_type_id: values.utility_type_id,
      title: values.title,
      notes: values.notes || undefined,
      stand_screenshot_key: standKey,
      aim_screenshot_key: aimKey,
      aim_anchor_x: aimAnchor?.x,
      aim_anchor_y: aimAnchor?.y,
      setup_seconds: values.setup_seconds ? parseInt(values.setup_seconds, 10) : undefined,
    };

    await createLineup({
      payload,
      lineup_id: lineupIdFromUrl ?? undefined,
    }).unwrap();

    showSuccess("Lineup saved.");
    const targetZoneSlug = mapDetail?.zones.find((z) => z.id === values.target_zone_id)?.slug;
    const zonePart = targetZoneSlug ? `?zone=${targetZoneSlug}` : "";
    navigate(`/${selectedGameSlug}/${selectedMapSlug}${zonePart}`);
  });

  const sideOptions = selectedGame
    ? [
        { value: "side_a", label: selectedGame.side_a_label },
        { value: "side_b", label: selectedGame.side_b_label },
        { value: "any", label: "Any (both sides)" },
      ]
    : [
        { value: "side_a", label: "Side A" },
        { value: "side_b", label: "Side B" },
        { value: "any", label: "Any" },
      ];

  const isUploadBusy = standUploading || aimUploading;
  const canSubmit = !isCreating && !isUploadBusy && !!standKey && !!aimKey;

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Add Lineup</h1>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {/* Game */}
        <FormField label="Game">
          <Select
            value={selectedGameSlug}
            onChange={(e) => {
              setSelectedGameSlug(e.target.value);
              setSelectedMapSlug("");
              setValue("map_id", "");
              setValue("target_zone_id", "");
              setValue("stand_zone_id", "");
              setValue("utility_type_id", "");
            }}
            disabled={!games}
            aria-label="Select game"
          >
            <option value="">Select game…</option>
            {games?.map((g) => (
              <option key={g.id} value={g.slug}>{g.name}</option>
            ))}
          </Select>
          <input type="hidden" {...register("game_id", { required: "Game is required" })} />
          {errors.game_id && <p className="text-xs text-destructive mt-1">{errors.game_id.message}</p>}
        </FormField>

        {/* Map */}
        <FormField label="Map">
          <Select
            value={selectedMapSlug}
            onChange={(e) => {
              setSelectedMapSlug(e.target.value);
              setValue("target_zone_id", "");
              setValue("stand_zone_id", "");
            }}
            disabled={!selectedGameSlug || !maps}
            aria-label="Select map"
          >
            <option value="">Select map…</option>
            {maps?.map((m) => (
              <option key={m.id} value={m.slug}>{m.name}</option>
            ))}
          </Select>
          <input type="hidden" {...register("map_id", { required: "Map is required" })} />
          {errors.map_id && <p className="text-xs text-destructive mt-1">{errors.map_id.message}</p>}
        </FormField>

        {/* Target zone */}
        <FormField label="Target zone (where it lands)">
          <Select
            {...register("target_zone_id", { required: "Target zone is required" })}
            disabled={!mapDetail}
            aria-label="Select target zone"
          >
            <option value="">Select zone…</option>
            {mapDetail?.zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </Select>
          {errors.target_zone_id && <p className="text-xs text-destructive mt-1">{errors.target_zone_id.message}</p>}
        </FormField>

        {/* Stand zone */}
        <FormField label="Stand zone (where you throw from)">
          <Select
            {...register("stand_zone_id", { required: "Stand zone is required" })}
            disabled={!mapDetail}
            aria-label="Select stand zone"
          >
            <option value="">Select zone…</option>
            {mapDetail?.zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </Select>
          {errors.stand_zone_id && <p className="text-xs text-destructive mt-1">{errors.stand_zone_id.message}</p>}
        </FormField>

        {/* Side */}
        <FormField label="Side">
          <Select
            {...register("side", { required: "Side is required" })}
            aria-label="Select side"
          >
            {sideOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          {errors.side && <p className="text-xs text-destructive mt-1">{errors.side.message}</p>}
        </FormField>

        {/* Utility type */}
        <FormField label="Utility type">
          <Select
            {...register("utility_type_id", { required: "Utility type is required" })}
            disabled={!mapDetail}
            aria-label="Select utility type"
          >
            <option value="">Select utility…</option>
            {mapDetail?.utility_types.map((u) => (
              <option key={u.id} value={u.id} className="capitalize">{u.name}</option>
            ))}
          </Select>
          {errors.utility_type_id && <p className="text-xs text-destructive mt-1">{errors.utility_type_id.message}</p>}
        </FormField>

        {/* Title */}
        <FormField label="Title" required>
          <input
            {...register("title", { required: "Title is required" })}
            type="text"
            placeholder="e.g. A-site smoke from CT spawn"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="Lineup title"
          />
          {errors.title && <p className="text-xs text-destructive mt-1">{errors.title.message}</p>}
        </FormField>

        {/* Notes */}
        <FormField label="Notes (optional)">
          <textarea
            {...register("notes")}
            rows={3}
            placeholder="Step-by-step notes, crouch/jump timing, etc."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
            aria-label="Notes"
          />
        </FormField>

        {/* Setup seconds */}
        <FormField label="Setup time (seconds, optional)">
          <input
            {...register("setup_seconds")}
            type="number"
            min={0}
            max={120}
            placeholder="e.g. 8"
            className="w-32 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="Setup seconds"
          />
        </FormField>

        {/* Screenshots */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-1.5">Stand screenshot *</p>
            {standPreview ? (
              <div className="relative rounded-md overflow-hidden border aspect-video bg-muted/20">
                <img src={standPreview} alt="Stand preview" className="w-full h-full object-cover" />
                {standUploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-xs text-white">
                      {standProgress < 100 ? `${standProgress}%` : "Processing…"}
                    </div>
                  </div>
                )}
                {standKey && !standUploading && (
                  <div className="absolute top-1.5 right-1.5 bg-green-500/90 text-white text-xs px-1.5 py-0.5 rounded">
                    Uploaded
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setStandFile(null); setStandKey(null); }}
                  className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded hover:bg-black/80"
                >
                  Change
                </button>
              </div>
            ) : (
              <FileUploadDropzone
                accept="image/*"
                maxSizeBytes={10 * 1024 * 1024}
                label="Drop stand screenshot here"
                helperText="Max 10 MB — PNG/JPG"
                uploading={standUploading}
                onFilesSelected={handleStandFiles}
              />
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-1.5">Aim screenshot *</p>
            {aimPreview ? (
              <div
                ref={aimPreviewRef}
                onClick={handleAimClick}
                className="relative rounded-md overflow-hidden border aspect-video bg-muted/20 cursor-crosshair"
                title="Click to set aim anchor point"
              >
                <img src={aimPreview} alt="Aim preview" className="w-full h-full object-cover" />
                {aimUploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-xs text-white">
                      {aimProgress < 100 ? `${aimProgress}%` : "Processing…"}
                    </div>
                  </div>
                )}
                {aimKey && !aimUploading && (
                  <div className="absolute top-1.5 right-1.5 bg-green-500/90 text-white text-xs px-1.5 py-0.5 rounded">
                    Uploaded
                  </div>
                )}
                {aimAnchor && (
                  <div
                    style={{
                      position: "absolute",
                      left: `calc(${aimAnchor.x * 100}% - 6px)`,
                      top: `calc(${aimAnchor.y * 100}% - 6px)`,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      border: "2px solid rgba(239, 68, 68, 0.9)",
                      background: "rgba(239, 68, 68, 0.3)",
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                      pointerEvents: "none",
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setAimFile(null); setAimKey(null); setAimAnchor(null); }}
                  className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded hover:bg-black/80"
                >
                  Change
                </button>
              </div>
            ) : (
              <FileUploadDropzone
                accept="image/*"
                maxSizeBytes={10 * 1024 * 1024}
                label="Drop aim screenshot here"
                helperText="Then click to set aim anchor point"
                uploading={aimUploading}
                onFilesSelected={handleAimFiles}
              />
            )}
            {aimPreview && !aimUploading && (
              <p className="text-xs text-muted-foreground mt-1">
                {aimAnchor
                  ? `Anchor set at ${Math.round(aimAnchor.x * 100)}%, ${Math.round(aimAnchor.y * 100)}%`
                  : "Click the image to set the aim anchor point"}
              </p>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2 flex gap-3">
          <LoadingButton
            type="submit"
            isLoading={isCreating || isUploadBusy}
            loadingText={isUploadBusy ? "Uploading screenshots…" : "Saving…"}
            disabled={!canSubmit}
          >
            Save Lineup
          </LoadingButton>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-md text-sm hover:bg-muted/40 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
