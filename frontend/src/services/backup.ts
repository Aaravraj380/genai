/**
 * Backup export / restore — device I/O. The file format, validation and
 * sanitising live in ./backupFormat.ts.
 */
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { BackupError } from './backupFormat';

export * from './backupFormat';

/* ------------------------------------------------------------------ */
/* Device I/O                                                          */
/* ------------------------------------------------------------------ */

export function backupFileName(now: Date = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `focus-flow-backup-${d}.json`;
}

/** Save the backup as a .json file and open the share sheet (Drive, WhatsApp, Files, email…). */
export async function exportBackupFile(json: string, dialogTitle: string): Promise<void> {
  const name = backupFileName();
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle });
  } else {
    await Share.share({ message: json, title: dialogTitle });
  }
}

/** Let the user pick a backup file and return its text, or null if they cancelled. */
export async function pickBackupText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  try {
    if (Platform.OS === 'web') {
      return asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
    }
    return await new File(asset.uri).text();
  } catch {
    throw new BackupError('read');
  }
}
