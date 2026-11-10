import * as ImagePicker from "expo-image-picker";

/** The photos the person chose, not yet re-encoded. A limit of 0 means the library sets none. */
export async function chooseLibraryAssets(selectionLimit: number): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit,
    exif: false,
  });
  return result.canceled ? [] : result.assets;
}
