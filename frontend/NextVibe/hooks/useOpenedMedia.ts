import { useEffect, useState } from 'react';
import type { MediaKey } from '@/src/services/e2ee/core';
import { openFile } from '@/src/services/e2ee/media';

/**
 * The URI to show for a chat photo or video: the remote one for older,
 * unencrypted media; for end-to-end encrypted media, a local copy opened
 * with its key (null while it downloads). `failed` when it can't be opened.
 */
export function useOpenedMedia(uri: string, keys?: MediaKey[] | null): { uri: string | null; failed: boolean } {
    const sealed = !!keys && keys.length > 0;
    const [opened, setOpened] = useState<{ uri: string | null; failed: boolean }>(
        () => ({ uri: sealed ? null : uri, failed: false }),
    );
    const keyId = sealed ? keys!.map((k) => k.n).join(',') : '';

    useEffect(() => {
        if (!sealed || !uri) {
            setOpened({ uri, failed: false });
            return;
        }
        let active = true;
        setOpened({ uri: null, failed: false });
        openFile(uri, keys!).then(
            (local) => { if (active) setOpened({ uri: local, failed: false }); },
            () => { if (active) setOpened({ uri: null, failed: true }); },
        );
        return () => { active = false; };
    }, [uri, keyId]); // eslint-disable-line react-hooks/exhaustive-deps

    return opened;
}
