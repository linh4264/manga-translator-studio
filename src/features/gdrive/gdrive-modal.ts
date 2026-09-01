/**
 * Manga Translator Studio - GDrive: Modal Manager
 * Manages Google Drive settings & sync modal dialog lifecycle.
 */
import { ensureModalElement } from '../../core/component-loader';
import { syncGDriveAuthStatusUI, initGoogleGISClient, googleClientId, tokenClient } from './gdrive-auth';
import { loadGDriveFolders } from './gdrive-folder';
import { loadGDriveProjectList } from './gdrive-project-sync';

export async function openGDriveModal(): Promise<void> {
    const modal = await ensureModalElement('gdrive-modal');
    if (modal) {
        modal.classList.remove('hidden');
        syncGDriveAuthStatusUI();
        if (googleClientId && !tokenClient) {
            initGoogleGISClient(googleClientId);
        }
        loadGDriveFolders();
        loadGDriveProjectList();
    }
}

export function closeGDriveModal(): void {
    const modal = document.getElementById('gdrive-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}
