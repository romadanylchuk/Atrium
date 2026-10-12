/**
 * App self-update status, pushed from main to renderer.
 *
 * No Electron, Node, or React imports — safe for @shared.
 */

export type UpdateStatus =
  /** Nothing to report: dev build, no check yet, or already on the latest version. */
  | { kind: 'idle' }
  | {
      kind: 'available';
      version: string;
      currentVersion: string;
      /**
       * True when this install can download and apply the update in place (Windows NSIS,
       * Linux AppImage). False for unsigned macOS builds and .deb installs, which must
       * download the installer from the release page instead.
       */
      canAutoInstall: boolean;
      releaseUrl: string;
    }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string; releaseUrl: string | null };
