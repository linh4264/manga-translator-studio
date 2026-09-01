import { describe, it, expect, vi } from 'vitest';
import { WorkerBridge } from '../../../src/workers/worker-manager';

describe('WorkerManager & WorkerBridge Infrastructure', () => {
    it('executes fallback handler when Web Worker is not supported or not available', async () => {
        const fallback = vi.fn().mockImplementation(async (req, onProgress) => {
            if (onProgress) onProgress({ progress: 50 });
            return { processed: req.data.toUpperCase() };
        });

        const bridge = new WorkerBridge({
            fallbackHandler: fallback
        });

        const progressMock = vi.fn();
        const result = await bridge.execute({ data: 'hello' }, progressMock);

        expect(fallback).toHaveBeenCalledTimes(1);
        expect(progressMock).toHaveBeenCalledWith({ progress: 50 });
        expect(result).toEqual({ processed: 'HELLO' });
    });

    it('handles worker errors in fallback gracefully', async () => {
        const bridge = new WorkerBridge({
            fallbackHandler: async () => {
                throw new Error('Fallback processing error');
            }
        });

        await expect(bridge.execute({ text: 'fail' })).rejects.toThrow('Fallback processing error');
    });

    it('terminates cleanly without throwing errors', () => {
        const bridge = new WorkerBridge({
            fallbackHandler: async () => 'done'
        });

        expect(() => bridge.terminate()).not.toThrow();
    });
});
