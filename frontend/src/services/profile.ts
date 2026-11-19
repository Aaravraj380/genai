/**
 * Profile photo: pick from the gallery (square crop), then copy it into the
 * app's private document folder so it survives cache clean-ups.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type PickPhotoResult = { status: 'picked'; uri: string } | { status: 'cancelled' } | { status: 'denied' };

const AVATAR_DIR = 'profile';

export async function pickProfilePhoto(): Promise<PickPhotoResult> {
  // The system photo picker needs no permission prompt on current iOS/Android.
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
  } catch {
    return { status: 'denied' };
  }
  if (result.canceled || !result.assets?.length) return { status: 'cancelled' };
  const picked = result.assets[0].uri;
  if (Platform.OS === 'web') return { status: 'picked', uri: picked };

  // Copy into documents with a unique name (a new name also busts the image cache).
  const dir = new Directory(Paths.document, AVATAR_DIR);
  if (!dir.exists) dir.create();
  removeStoredPhotos(dir);
  const dest = new File(dir, `avatar-${Date.now()}.jpg`);
  await new File(picked).copy(dest);
  return { status: 'picked', uri: dest.uri };
}

/** Delete the stored photo files (when the user removes their photo). */
export function deleteProfilePhotos(): void {
  if (Platform.OS === 'web') return;
  const dir = new Directory(Paths.document, AVATAR_DIR);
  if (dir.exists) removeStoredPhotos(dir);
}

function removeStoredPhotos(dir: Directory) {
  try {
    for (const entry of dir.list()) if (entry instanceof File) entry.delete();
  } catch {
    /* nothing to clean */
  }
}
