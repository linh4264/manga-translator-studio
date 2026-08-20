import { test, expect } from 'vitest';
import assert from 'node:assert';
import '../../setup/browser-env.js';

import { globalBus } from '../../../src/core/events.ts';

test('Core Events - Event Bus Publish and Subscribe', () => {
    let receivedPayload = null;
    let callCount = 0;

    const unsubscribe = globalBus.subscribe('test:event', (payload) => {
        receivedPayload = payload;
        callCount++;
    });

    // Publish event
    globalBus.publish('test:event', { msg: 'hello world', value: 42 });

    assert.strictEqual(callCount, 1, 'Subscriber should be called once');
    assert.deepStrictEqual(receivedPayload, { msg: 'hello world', value: 42 });

    // Publish again
    globalBus.publish('test:event', { msg: 'second call', value: 99 });
    assert.strictEqual(callCount, 2);
    assert.strictEqual(receivedPayload.value, 99);

    // Unsubscribe and publish
    unsubscribe();
    globalBus.publish('test:event', { msg: 'should not receive' });
    assert.strictEqual(callCount, 2, 'Call count should remain 2 after unsubscribe');
});

test('Core Events - Multiple Subscribers Isolation', () => {
    const listA = [];
    const listB = [];

    const unsubA = globalBus.subscribe('batch:event', (data) => listA.push(data));
    const unsubB = globalBus.subscribe('batch:event', (data) => listB.push(data));

    globalBus.publish('batch:event', 100);
    globalBus.publish('batch:event', 200);

    assert.deepStrictEqual(listA, [100, 200]);
    assert.deepStrictEqual(listB, [100, 200]);

    unsubA();
    globalBus.publish('batch:event', 300);

    assert.deepStrictEqual(listA, [100, 200]);
    assert.deepStrictEqual(listB, [100, 200, 300]);

    unsubB();
});
