type MockContext = {
    isStartupProcedureRunning: boolean;
    isChecking: boolean;
    isUpdateAvailable: boolean;
    isUpdatePending: boolean;
    isDownloading: boolean;
    isRestarting: boolean;
    restartCount: number;
    sequenceNumber: number;
    downloadProgress: number;
    checkError?: Error;
    lastCheckForUpdateTime?: Date;
};

const mockUpdates = {
    isEnabled: true,
    latestContext: null as MockContext | null,
    listeners: new Set<(event: { context: MockContext }) => void>(),
};

jest.mock('expo-updates', () => ({
    __esModule: true,
    get isEnabled() { return mockUpdates.isEnabled; },
    get latestContext() { return mockUpdates.latestContext; },
    addUpdatesStateChangeListener: (listener: (event: { context: MockContext }) => void) => {
        mockUpdates.listeners.add(listener);
        return { remove: () => { mockUpdates.listeners.delete(listener); } };
    },
}));

import { launchOtaVerdict, subscribeOtaDownloadProgress, whenLaunchOtaKnown } from '../launchOta';

/** Native state right after StartStartup: JS runs, the server request hasn't started. */
const ctx = (over: Partial<MockContext> = {}): MockContext => ({
    isStartupProcedureRunning: true,
    isChecking: false,
    isUpdateAvailable: false,
    isUpdatePending: false,
    isDownloading: false,
    isRestarting: false,
    restartCount: 0,
    sequenceNumber: 1,
    downloadProgress: 0,
    ...over,
});

const emit = (context: MockContext) => {
    mockUpdates.listeners.forEach((listener) => listener({ context }));
};

beforeEach(() => {
    mockUpdates.isEnabled = true;
    mockUpdates.latestContext = ctx();
    mockUpdates.listeners.clear();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('launchOtaVerdict', () => {
    it('is still checking before and during the launch check', () => {
        expect(launchOtaVerdict(ctx())).toBe('checking');
        expect(launchOtaVerdict(ctx({ isChecking: true }))).toBe('checking');
    });

    it('reports the update the launch check found, while it downloads and once it is on disk', () => {
        expect(launchOtaVerdict(ctx({ isUpdateAvailable: true, lastCheckForUpdateTime: new Date() }))).toBe('update');
        expect(launchOtaVerdict(ctx({ isUpdateAvailable: true, isDownloading: true, downloadProgress: 0.4 }))).toBe('update');
        expect(launchOtaVerdict(ctx({ isStartupProcedureRunning: false, isUpdateAvailable: true, isUpdatePending: true }))).toBe('update');
    });

    it('a failed launch download still counts, so the update screen retries it', () => {
        expect(launchOtaVerdict(ctx({ isStartupProcedureRunning: false, isUpdateAvailable: true }))).toBe('update');
    });

    it('reports none when the launch check found nothing, failed, or never ran', () => {
        expect(launchOtaVerdict(ctx({ lastCheckForUpdateTime: new Date() }))).toBe('none');
        expect(launchOtaVerdict(ctx({ checkError: new Error('offline'), lastCheckForUpdateTime: new Date() }))).toBe('none');
        expect(launchOtaVerdict(ctx({ isStartupProcedureRunning: false }))).toBe('none');
    });

    it('reports none after reloadAsync(), which resets the native state', () => {
        expect(launchOtaVerdict(ctx({ isStartupProcedureRunning: false, restartCount: 1, sequenceNumber: 9 }))).toBe('none');
    });
});

describe('whenLaunchOtaKnown', () => {
    it('resolves at once when the verdict is already known', async () => {
        mockUpdates.latestContext = ctx({ isUpdateAvailable: true, isDownloading: true });
        await expect(whenLaunchOtaKnown(3000)).resolves.toBe('update');
        expect(mockUpdates.listeners.size).toBe(0);
    });

    it('waits for the native check to finish', async () => {
        mockUpdates.latestContext = ctx({ isChecking: true });
        const verdict = whenLaunchOtaKnown(3000);
        emit(ctx({ isChecking: true }));
        expect(mockUpdates.listeners.size).toBe(1);
        emit(ctx({ isUpdateAvailable: true, lastCheckForUpdateTime: new Date() }));
        await expect(verdict).resolves.toBe('update');
        expect(mockUpdates.listeners.size).toBe(0);
    });

    it('resolves none when the check finds nothing', async () => {
        const verdict = whenLaunchOtaKnown(3000);
        emit(ctx({ isChecking: true }));
        emit(ctx({ lastCheckForUpdateTime: new Date() }));
        await expect(verdict).resolves.toBe('none');
    });

    it('gives up after the timeout and drops its listener', async () => {
        jest.useFakeTimers();
        mockUpdates.latestContext = ctx({ isChecking: true });
        const verdict = whenLaunchOtaKnown(3000);
        jest.advanceTimersByTime(2999);
        expect(mockUpdates.listeners.size).toBe(1);
        jest.advanceTimersByTime(1);
        await expect(verdict).resolves.toBe('checking');
        expect(mockUpdates.listeners.size).toBe(0);
    });

    it('is none when expo-updates is disabled', async () => {
        mockUpdates.isEnabled = false;
        mockUpdates.latestContext = ctx({ isChecking: true });
        await expect(whenLaunchOtaKnown(3000)).resolves.toBe('none');
        expect(mockUpdates.listeners.size).toBe(0);
    });
});

describe('subscribeOtaDownloadProgress', () => {
    it('reports the current and later progress until unsubscribed', () => {
        mockUpdates.latestContext = ctx({ isUpdateAvailable: true, isDownloading: true, downloadProgress: 0.25 });
        const seen: number[] = [];
        const unsubscribe = subscribeOtaDownloadProgress((progress) => seen.push(progress));
        emit(ctx({ isUpdateAvailable: true, isDownloading: true, downloadProgress: 0.5 }));
        // Downloaded: full, whatever the last byte count said.
        emit(ctx({ isStartupProcedureRunning: false, isUpdateAvailable: true, isUpdatePending: true, downloadProgress: 0.98 }));
        unsubscribe();
        emit(ctx({ isDownloading: true, downloadProgress: 0.1 }));
        expect(seen).toEqual([0.25, 0.5, 1]);
        expect(mockUpdates.listeners.size).toBe(0);
    });

    it('reports nothing while no download runs', () => {
        const seen: number[] = [];
        const unsubscribe = subscribeOtaDownloadProgress((progress) => seen.push(progress));
        emit(ctx({ isChecking: true }));
        emit(ctx({ isStartupProcedureRunning: false, lastCheckForUpdateTime: new Date() }));
        unsubscribe();
        expect(seen).toEqual([]);
    });
});
