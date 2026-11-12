import { discardFile, reencodePhoto } from "@platform/mobile";
import * as ImagePicker from "expo-image-picker";
import { RECIPE_PHOTO_ENCODING } from "../../constants/importRecipe";
import type { PhotoSource } from "../../types/PhotoSource";
import type { PickedRecipePhoto } from "../../types/PickedRecipePhoto";

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], exif: false };

/**
 * One photo from the camera or the library, as the website takes one file. It's re-encoded as a
 * JPEG the size the backend reads, which also turns an iPhone's HEIC into a type the backend takes.
 * Doesn't save to the photo library: the person asked for a recipe, not a picture.
 */
export async function pickRecipePhoto(source: PhotoSource): Promise<PickedRecipePhoto> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return "denied";
  }
  const result =
    source === "camera" ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled) return null;
  const [asset] = result.assets;
  try {
    return { uri: await reencodePhoto(asset.uri, RECIPE_PHOTO_ENCODING) };
  } finally {
    // The picker's own copy can still hold where the photo was taken.
    discardFile(asset.uri);
  }
}
