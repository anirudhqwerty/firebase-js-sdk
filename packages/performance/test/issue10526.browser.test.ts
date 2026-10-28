/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { initializeApp, deleteApp } from '@firebase/app';
import { getInstallations, getId, getToken } from '@firebase/installations';
import { getAuthTokenPromise } from '../src/services/iid_service';

it('handles a blocked registration through the real browser SDK paths', async () => {
  const app = initializeApp({
    apiKey: 'test-api-key', projectId: 'demo-issue-10526',
    appId: '1:123456789:web:issue10526'
  }, 'issue10526');
  const installations = getInstallations(app);
  const networkError = new TypeError('ISSUE_10526_BLOCKED_NETWORK');
  const rejects: Array<(reason: Error) => void> = [];
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://firebaseinstallations.googleapis.com/')) {
      return new Promise<Response>((_, reject) => rejects.push(reject));
    }
    return originalFetch(input, init);
  });
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const unhandled: unknown[] = [];
  const onUnhandled = (event: PromiseRejectionEvent): void => {
    if (event.reason === networkError) {
      unhandled.push(event.reason);
      // Contain only the deliberately triggered error; the assertion below
      // still fails if this event is emitted.
      event.preventDefault();
    }
  };
  window.addEventListener('unhandledrejection', onUnhandled);
  try {
    const fid = await getId(installations);
    expect(fid).toHaveLength(22);
    await vi.waitFor(() => expect(rejects).toHaveLength(1));
    rejects[0](networkError);
    await new Promise(resolve => setTimeout(resolve, 100));
    const registrationConsoleErrors = errors.mock.calls.length;

    const token = getAuthTokenPromise({
      getId: () => getId(installations),
      getToken: () => getToken(installations)
    });
    const outcome = token.then(() => undefined, reason => reason);
    await vi.waitFor(() => expect(rejects).toHaveLength(2));
    // Allow the real IndexedDB registration transaction to complete before
    // rejecting its pending network request.
    await new Promise(resolve => setTimeout(resolve, 100));
    rejects[1](networkError);
    expect(await outcome).toBe(networkError);
    await new Promise(resolve => setTimeout(resolve, 100));
    const evidence = {
      fidResolved: true,
      tokenRejectedToCaller: true,
      networkAttempts: rejects.length,
      registrationConsoleErrors,
      consoleErrors: errors.mock.calls.length,
      unhandledRejections: unhandled.length
    };
    console.log('ISSUE10526_EVIDENCE', JSON.stringify(evidence));
    expect(evidence.consoleErrors).toBe(0);
    expect(evidence.unhandledRejections).toBe(0);
  } finally {
    window.removeEventListener('unhandledrejection', onUnhandled);
    rejects.forEach(reject => reject(networkError));
    await deleteApp(app);
  }
});
