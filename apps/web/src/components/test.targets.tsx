'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, postJson } from '@reliability/web/lib/fetcher';
import { badgeClass, formatDate } from '@reliability/web/lib/format';
import { useSystemState } from '@reliability/web/components/state.controls';

type CredentialField = { key: string; label: string; secret: boolean };

type TestChannel = {
  id: string;
  provider: string;
  integrationId: string;
  health: string;
  healthError: string | null;
  healthCheckedAt: string | null;
  credentialsSet: boolean;
  credentialsChangedBy: string | null;
  credentialsChangedAt: string | null;
  fields: CredentialField[];
};

type TestEnvironment = {
  id: string;
  name: string;
  apiUrl: string;
  testUsers: Array<{ id: string; name: string; channels: TestChannel[] }>;
};

const useTestTargets = () => useSWR<TestEnvironment[]>('/api/targets', fetcher);

const CredentialsForm = ({ channel, onSaved }: { channel: TestChannel; onSaved: () => void }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (body: unknown) => {
    setSending(true);
    setError('');
    try {
      await postJson(`/api/targets/channels/${channel.id}/credentials`, body);
      setValues({});
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {channel.fields.map((field) => (
          <input
            key={field.key}
            type={field.secret ? 'password' : 'text'}
            autoComplete="off"
            value={values[field.key] || ''}
            onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
            placeholder={field.label}
            className="w-64 rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5"
          />
        ))}
        <button
          disabled={sending || channel.fields.some((f) => !values[f.key]?.trim())}
          onClick={() => send({ credentials: values })}
          className="rounded bg-blue-600 px-3 py-1.5 font-medium disabled:opacity-50"
        >
          {channel.credentialsSet ? 'Replace' : 'Save'}
        </button>
        {channel.credentialsSet && (
          <button
            disabled={sending}
            onClick={() => send({ clear: true })}
            className="rounded bg-neutral-700 px-3 py-1.5 font-medium disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
      {!!error && <div className="text-red-400">{error}</div>}
    </div>
  );
};

export const TestTargets = () => {
  const { data, error, mutate } = useTestTargets();
  const { data: state } = useSystemState();
  const admin = !!state?.member.admin;

  if (error) {
    return <div className="text-red-400">{error.message}</div>;
  }
  if (!data) {
    return <div className="text-neutral-400">Loading test targets...</div>;
  }
  if (!data.length) {
    return <div className="text-neutral-400">No test target configured.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-neutral-400">
        Credentials saved here are encrypted copies the reliability system uses to check each
        account and delete the posts its scenarios publish. Saving or clearing them here does not
        change the account&apos;s login on the platform. Saved values are never shown again.
      </p>
      {data.map((environment) => (
        <section
          key={environment.id}
          className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
        >
          <h3 className="font-semibold">
            {environment.name} <span className="font-normal text-neutral-400">{environment.apiUrl}</span>
          </h3>
          {environment.testUsers.map((testUser) => (
            <div key={testUser.id} className="flex flex-col divide-y divide-neutral-800">
              <div className="pb-2 text-neutral-400">Test user: {testUser.name}</div>
              {testUser.channels.map((channel) => (
                <div key={channel.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{channel.provider}</span>
                    <span className="font-mono text-neutral-500">{channel.integrationId}</span>
                    <span className={badgeClass(channel.health)}>{channel.health}</span>
                    <span className="text-neutral-500">checked {formatDate(channel.healthCheckedAt)}</span>
                  </div>
                  {!!channel.healthError && <div className="text-red-400">{channel.healthError}</div>}
                  {channel.fields.length ? (
                    <>
                      <div className="text-neutral-400">
                        {channel.credentialsSet ? 'Credentials set' : 'No credentials'}
                        {!!channel.credentialsChangedAt &&
                          `, last changed by ${channel.credentialsChangedBy} at ${formatDate(channel.credentialsChangedAt)}`}
                      </div>
                      {admin && <CredentialsForm channel={channel} onSaved={() => mutate()} />}
                    </>
                  ) : (
                    <div className="text-neutral-500">
                      The system has no use for credentials on this platform.
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};
